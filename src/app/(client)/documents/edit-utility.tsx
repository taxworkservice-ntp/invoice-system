import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth";
import { useItems } from "../../../hooks/useItems";
import { useToast } from "../../../hooks/useToast";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Card } from "../../../components/ui/Card";
import { CatalogAutocomplete } from "../../../components/CatalogAutocomplete";
import { Spinner } from "../../../components/ui/Spinner";
import { supabase } from "../../../lib/supabase";
import { calculateTax } from "../../../lib/tax";
import type { Document, DocumentLineItem, Item } from "../../../types";

function parseAmount(value: string) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getUsageBillDetail(note: string) {
  const currentReading = note.match(/เลขปัจจุบัน:\s*([\d,.]+)/)?.[1]?.replace(/,/g, "") || "";
  const previousReading = note.match(/เลขก่อนหน้า:\s*([\d,.]+)/)?.[1]?.replace(/,/g, "") || "";
  const periodMatch = note.match(/รอบบิล:\s*([0-9-]+)\s*-\s*([0-9-]+)/);
  const rateMatch = note.match(/ใช้ไป:[\s\d,.]+\s*[\d.,]+\s*\S*\s*x\s*฿([\d,.]+)/) || note.match(/ราคาต่อหน่วย:\s*([\d,.]+)/);
  const usageMatch = note.match(/ใช้ไป:\s*[\d,.]+\s*(.+)$/m);
  return {
    currentReading,
    previousReading,
    periodStart: periodMatch?.[1] || "",
    periodEnd: periodMatch?.[2] || "",
    unit: usageMatch?.[1]?.trim() || "",
  };
}

export default function EditUtilityBillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id;
  const { items, addItem } = useItems(userId);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [lineItem, setLineItem] = useState<DocumentLineItem | null>(null);

  const [utilityServiceItemId, setUtilityServiceItemId] = useState<string | null>(null);
  const [utilityServiceName, setUtilityServiceName] = useState("");
  const [utilityUnit, setUtilityUnit] = useState("หน่วย");
  const [utilityPeriodStart, setUtilityPeriodStart] = useState("");
  const [utilityPeriodEnd, setUtilityPeriodEnd] = useState("");
  const [utilityPreviousReading, setUtilityPreviousReading] = useState("");
  const [utilityCurrentReading, setUtilityCurrentReading] = useState("");
  const [utilityRate, setUtilityRate] = useState("");

  const serviceItems = useMemo(() => items.filter((item) => item.item_type === "service"), [items]);
  const selectedUtilityService = useMemo(
    () => serviceItems.find((item) => item.id === utilityServiceItemId) || null,
    [serviceItems, utilityServiceItemId],
  );

  useEffect(() => {
    if (!id || !userId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data: docData, error: docError } = await supabase
          .from("documents")
          .select("*, customer:customer_id(name)")
          .eq("id", id)
          .single();

        if (cancelled) return;
        if (docError || !docData) {
          setError("ไม่พบเอกสารนี้");
          setLoading(false);
          return;
        }

        const document = docData as unknown as Document;
        if (document.status !== "draft") {
          setError("แก้ไขได้เฉพาะเอกสารฉบับร่างเท่านั้น");
          setLoading(false);
          return;
        }

        const { data: lines, error: linesError } = await supabase
          .from("document_line_items")
          .select("*")
          .eq("document_id", id)
          .order("sort_order", { ascending: true });

        if (cancelled) return;
        if (linesError || !lines?.length) {
          setError("ไม่พบรายการในเอกสารนี้");
          setLoading(false);
          return;
        }

        const usageLine = (lines as DocumentLineItem[]).find((l) =>
          (l.line_note || "").includes("[USAGE_BILL]"),
        );

        if (!usageLine) {
          setError("เอกสารนี้ไม่ใช่บิลประจำรอบ");
          setLoading(false);
          return;
        }

        setDoc(document);
        setLineItem(usageLine);

        const note = usageLine.line_note || "";
        const detail = getUsageBillDetail(note);

        setUtilityServiceItemId(usageLine.item_id);
        setUtilityServiceName(usageLine.item_name);
        setUtilityUnit(usageLine.unit || detail.unit || "หน่วย");
        setUtilityPeriodStart(detail.periodStart || "");
        setUtilityPeriodEnd(detail.periodEnd || "");
        setUtilityPreviousReading(detail.previousReading || "");
        setUtilityCurrentReading(detail.currentReading || "");
        setUtilityRate(usageLine.unit_price != null ? String(usageLine.unit_price) : "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [id, userId]);

  const usage = useMemo(() => {
    return Math.max(0, Math.round((parseAmount(utilityCurrentReading) - parseAmount(utilityPreviousReading)) * 1000) / 1000);
  }, [utilityCurrentReading, utilityPreviousReading]);

  const utilityValidation = useMemo(() => {
    const previous = parseAmount(utilityPreviousReading);
    const current = parseAmount(utilityCurrentReading);
    const rate = parseAmount(utilityRate);
    return {
      readingError: utilityPreviousReading !== "" && utilityCurrentReading !== "" && current <= previous
        ? "เลขปัจจุบันต้องมากกว่าเลขก่อนหน้า" : undefined,
      rateError: utilityRate !== "" && rate <= 0
        ? "กรุณาระบุราคา/หน่วยที่มากกว่า 0" : undefined,
      periodError: utilityPeriodStart && utilityPeriodEnd && utilityPeriodEnd < utilityPeriodStart
        ? "วันสิ้นสุดต้องมาหลังวันเริ่มต้น" : undefined,
    };
  }, [utilityPreviousReading, utilityCurrentReading, utilityRate, utilityPeriodStart, utilityPeriodEnd]);

  const handleUtilityServiceChange = (value: string) => {
    setUtilityServiceName(value);
    const matched = serviceItems.find((item) => item.name.trim().toLowerCase() === value.trim().toLowerCase());
    if (matched) {
      setUtilityServiceItemId(matched.id);
      setUtilityRate(String(matched.unit_price));
      setUtilityUnit(matched.base_unit || "หน่วย");
      return;
    }
    setUtilityServiceItemId(null);
    setUtilityRate("");
    setUtilityUnit("หน่วย");
  };

  const selectUtilityService = (catalogItem: Item) => {
    setUtilityServiceItemId(catalogItem.id);
    setUtilityServiceName(catalogItem.name);
    setUtilityRate(String(catalogItem.unit_price));
    setUtilityUnit(catalogItem.base_unit || "หน่วย");
  };

  const handleSave = async () => {
    if (!doc || !lineItem || !userId) return;
    setError(null);

    if (!utilityServiceName.trim()) {
      setError("กรุณาระบุชื่อค่าบริการ");
      return;
    }
    if (!utilityPeriodStart || !utilityPeriodEnd) {
      setError("กรุณาระบุรอบบิล");
      return;
    }
    if (utilityPeriodEnd < utilityPeriodStart) {
      setError("วันสิ้นสุดรอบบิลต้องมาหลังวันเริ่มต้น");
      return;
    }
    const previous = parseAmount(utilityPreviousReading);
    const current = parseAmount(utilityCurrentReading);
    if (current <= previous) {
      setError("เลขปัจจุบันต้องมากกว่าเลขก่อนหน้า");
      return;
    }
    const rate = parseAmount(utilityRate);
    if (rate <= 0) {
      setError("กรุณาระบุราคา/หน่วย");
      return;
    }

    setSaving(true);
    try {
      const serviceName = utilityServiceName.trim();
      const unit = utilityUnit.trim() || "หน่วย";
      const catalogService = selectedUtilityService || serviceItems.find((item) => item.name.trim().toLowerCase() === serviceName.toLowerCase()) || null;
      const lineNote = [
        "[USAGE_BILL]",
        `รอบบิล: ${utilityPeriodStart} - ${utilityPeriodEnd}`,
        `เลขก่อนหน้า: ${utilityPreviousReading || "0"}`,
        `เลขปัจจุบัน: ${utilityCurrentReading || "0"}`,
        `ใช้ไป: ${usage.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unit}`,
      ].join("\n");

      const updatedLineItem = {
        item_id: catalogService?.id || null,
        item_sku: catalogService?.sku || null,
        item_name: serviceName,
        item_type: "service" as const,
        line_note: lineNote,
        unit,
        unit_price: rate,
        quantity: usage,
        discount_percent: 0,
      };

      const { error: lineError } = await supabase
        .from("document_line_items")
        .update(updatedLineItem)
        .eq("id", lineItem.id);

      if (lineError) throw lineError;

      const tax = calculateTax(
        [{ unit_price: rate, quantity: usage, discount_percent: 0 }],
        doc.vat_registered,
        doc.vat_rate,
        doc.wht_rate,
        { discountPercent: doc.discount_percent || 0 },
      );

      const { error: docError } = await supabase
        .from("documents")
        .update({
          subtotal: tax.subtotal,
          discount_amount: tax.discountAmount,
          vat_amount: tax.vatAmount,
          total_amount: tax.total,
          wht_amount: tax.whtAmount,
          net_payable: tax.netPayable,
        })
        .eq("id", doc.id);

      if (docError) throw docError;

      toast.success("บันทึกการแก้ไขเรียบร้อยแล้ว");
      navigate(`/deals/${doc.deal_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="แก้ไข" showBack>
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      </AppShell>
    );
  }

  if (error || !doc) {
    return (
      <AppShell title="แก้ไข" showBack>
        <div className="p-4">
          <p className="text-sm text-red-600">{error || "ไม่พบเอกสาร"}</p>
          <Button variant="secondary" className="mt-3" onClick={() => navigate(-1)}>
            กลับ
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="แก้ไขออกบิลประจำรอบ" showBack>
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-[#1A1A18]">เอกสาร</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {doc.doc_number} — {(doc as any).customer?.name || "ไม่ระบุลูกค้า"}
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">ฉบับร่าง</span>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-[#1A1A18]">ข้อมูลรอบบิล</h3>
              <p className="mt-1 text-xs text-gray-500">
                ระบบจะคำนวณจำนวนหน่วย และบันทึกรายละเอียดไว้ในหมายเหตุรายการ
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-[13px] text-[#1A1A18]">ค่าบริการ</span>
              <CatalogAutocomplete
                items={serviceItems}
                value={utilityServiceName}
                onChange={handleUtilityServiceChange}
                onSelect={selectUtilityService}
                matched={!!selectedUtilityService}
                placeholder="เลือกจาก Catalog หรือพิมพ์ชื่อใหม่"
                createItemType="service"
                createDefaultUnit="หน่วย"
                onCreate={async (input) => {
                  try {
                    return await addItem(input);
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
                    throw err;
                  }
                }}
              />
            </label>

            <div>
              <span className="mb-1.5 block text-[13px] text-[#1A1A18]">รอบบิล</span>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="เริ่ม"
                  type="date"
                  value={utilityPeriodStart}
                  onChange={(e) => setUtilityPeriodStart(e.target.value)}
                  error={utilityValidation.periodError}
                />
                <Input
                  label="สิ้นสุด"
                  type="date"
                  value={utilityPeriodEnd}
                  onChange={(e) => setUtilityPeriodEnd(e.target.value)}
                />
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[13px] text-[#1A1A18]">มาตรวัด</span>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                <Input
                  label="เลขก่อนหน้า"
                  type="number"
                  min="0"
                  value={utilityPreviousReading}
                  onChange={(e) => setUtilityPreviousReading(e.target.value)}
                  placeholder="0"
                />
                <span className="pb-2 text-gray-400 text-sm">→</span>
                <Input
                  label="เลขปัจจุบัน"
                  type="number"
                  min="0"
                  value={utilityCurrentReading}
                  onChange={(e) => setUtilityCurrentReading(e.target.value)}
                  placeholder="0"
                  error={utilityValidation.readingError}
                />
              </div>
              {(parseAmount(utilityCurrentReading) > 0 || parseAmount(utilityPreviousReading) > 0) && parseAmount(utilityCurrentReading) > parseAmount(utilityPreviousReading) && (
                <p className="mt-1 text-xs text-gray-500">
                  ใช้ไป {usage.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {utilityUnit || "หน่วย"}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="ราคา/หน่วย (บาท)"
                type="number"
                min="0"
                value={utilityRate}
                onChange={(e) => setUtilityRate(e.target.value)}
                placeholder="0.00"
                error={utilityValidation.rateError}
              />
              <Input
                label="หน่วย"
                value={utilityUnit}
                onChange={(e) => setUtilityUnit(e.target.value)}
                placeholder="หน่วย"
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#E7E5DE] bg-[#FAF8F3] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600">ยอดก่อนภาษี</span>
              <span className="text-base font-semibold text-[#1A1A18]">
                ฿{(usage * parseAmount(utilityRate)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            {usage > 0 && parseAmount(utilityRate) > 0 && (
              <div className="mt-1 text-xs text-gray-500">
                {usage.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {utilityUnit || "หน่วย"} × ฿{parseAmount(utilityRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}/หน่วย
              </div>
            )}
          </div>
        </Card>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => navigate(`/deals/${doc.deal_id}`)}>
            ยกเลิก
          </Button>
          <Button
            className="flex-1"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
