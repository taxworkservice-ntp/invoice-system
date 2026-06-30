import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { supabase } from "../../lib/supabase";
import { generateDocNumberBE } from "../../lib/docNumber";
import { calculateLineAmounts, calculateTax } from "../../lib/tax";
import { formatBuddhistDate } from "../../lib/dates";
import { formatCurrency } from "../../lib/format";
import type { Customer, Document, DocumentLineItem, DocumentStatus } from "../../types";

type QuotationWithCustomer = Document & { customer?: Customer };

type DeliveryTotals = {
  delivered: number;
  pending: number;
};

type DeliveryLine = {
  source: DocumentLineItem;
  quantity: number;
  delivered: number;
  pending: number;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatQty(value: number) {
  return round3(value).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function getBaseQuantity(source: DocumentLineItem, quantity: number) {
  if (!source.base_quantity || !source.quantity) return quantity;
  return round3((source.base_quantity / source.quantity) * quantity);
}

interface DeliveryNoteFromQuotationFormProps {
  quotationId: string;
}

export function DeliveryNoteFromQuotationForm({ quotationId }: DeliveryNoteFromQuotationFormProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id;
  const toast = useToast();

  const [quotation, setQuotation] = useState<QuotationWithCustomer | null>(null);
  const [quotationLines, setQuotationLines] = useState<DocumentLineItem[]>([]);
  const [lines, setLines] = useState<DeliveryLine[]>([]);
  const [existingDraft, setExistingDraft] = useState<{ id: string; doc_number: string | null } | null>(null);
  const [issueDate, setIssueDate] = useState(todayString());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!quotationId || !userId) return;

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const { data: quotationData, error: quotationError } = await supabase
          .from("documents")
          .select("*, customer:customer_id(*)")
          .eq("id", quotationId)
          .eq("user_id", userId)
          .single();

        if (quotationError || !quotationData) throw quotationError || new Error("ไม่พบใบเสนอราคา");

        const quote = quotationData as unknown as QuotationWithCustomer;
        if (quote.doc_type !== "quotation") throw new Error("เอกสารนี้ไม่ใช่ใบเสนอราคา");

        const { data: quoteLines, error: linesError } = await supabase
          .from("document_line_items")
          .select("*")
          .eq("document_id", quotationId)
          .order("sort_order", { ascending: true });

        if (linesError) throw linesError;

        const { data: sourcedDnLines, error: dnLinesError } = await supabase
          .from("document_line_items")
          .select("*, document:document_id(id, status, doc_type)")
          .eq("source_document_id", quotationId);

        if (dnLinesError) throw dnLinesError;

        const totals = new Map<string, DeliveryTotals>();
        ((sourcedDnLines || []) as (DocumentLineItem & { document?: Pick<Document, "status" | "doc_type"> })[]).forEach((line) => {
          if (!line.source_line_item_id || line.document?.doc_type !== "delivery_note" || line.document?.status === "voided") return;
          const current = totals.get(line.source_line_item_id) || { delivered: 0, pending: 0 };
          if (line.document?.status === "sent" || line.document?.status === "converted") {
            current.delivered = round3(current.delivered + line.quantity);
          } else if (line.document?.status === "draft") {
            current.pending = round3(current.pending + line.quantity);
          }
          totals.set(line.source_line_item_id, current);
        });

        const qLines = (quoteLines || []) as DocumentLineItem[];
        const initialLines = qLines.map((line) => {
          const total = totals.get(line.id) || { delivered: 0, pending: 0 };
          const remaining = round3(line.quantity - total.delivered - total.pending);
          return {
            source: line,
            quantity: Math.max(0, remaining),
            delivered: total.delivered,
            pending: total.pending,
          };
        });

        const { data: draftDoc, error: draftError } = await supabase
          .from("documents")
          .select("id, doc_number")
          .eq("user_id", userId)
          .eq("converted_from_id", quotationId)
          .eq("doc_type", "delivery_note")
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (draftError) throw draftError;

        if (cancelled) return;
        setQuotation(quote);
        setQuotationLines(qLines);
        setLines(initialLines);
        setExistingDraft(draftDoc ? { id: draftDoc.id, doc_number: draftDoc.doc_number } : null);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [quotationId, userId]);

  const refetchExistingDraft = useCallback(async () => {
    if (!userId || !quotationId) return;
    const { data: draftDoc, error: draftError } = await supabase
      .from("documents")
      .select("id, doc_number")
      .eq("user_id", userId)
      .eq("converted_from_id", quotationId)
      .eq("doc_type", "delivery_note")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (draftError) return;
    setExistingDraft(draftDoc ? { id: draftDoc.id, doc_number: draftDoc.doc_number } : null);
  }, [quotationId, userId]);

  const selectedLines = useMemo(
    () => lines.filter((line) => line.quantity > 0),
    [lines],
  );

  const overDeliveryLines = useMemo(
    () => lines.filter((line) => line.quantity > Math.max(0, round3(line.source.quantity - line.delivered - line.pending))),
    [lines],
  );

  const tax = useMemo(() => {
    return calculateTax(
      selectedLines.map((line) => ({
        unit_price: line.source.unit_price,
        quantity: line.quantity,
        discount_percent: line.source.discount_percent || 0,
      })),
      quotation?.vat_registered ?? false,
      quotation?.vat_rate ?? 7,
      quotation?.wht_rate ?? 0,
      { discountPercent: 0 },
    );
  }, [quotation?.vat_rate, quotation?.vat_registered, quotation?.wht_rate, selectedLines]);

  const updateQuantity = (lineId: string, value: string) => {
    const nextQty = Number(value);
    setLines((current) =>
      current.map((line) =>
        line.source.id === lineId
          ? { ...line, quantity: Number.isFinite(nextQty) ? Math.max(0, round3(nextQty)) : 0 }
          : line,
      ),
    );
  };

  const handleSave = async () => {
    if (!quotation || !userId || selectedLines.length === 0) return;
    setSaving(true);
    setError("");

    let createdDocId: string | null = null;

    try {
      const docNumber = await generateDocNumberBE(userId, "delivery_note", issueDate);
      const { data: deliveryNote, error: docError } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          deal_id: quotation.deal_id,
          customer_id: quotation.customer_id,
          doc_type: "delivery_note",
          doc_number: docNumber,
          status: "draft" as DocumentStatus,
          issue_date: issueDate,
          vat_registered: quotation.vat_registered,
          vat_rate: quotation.vat_rate,
          wht_rate: quotation.wht_rate,
          discount_percent: 0,
          discount_amount: tax.discountAmount,
          subtotal: tax.subtotal,
          vat_amount: tax.vatAmount,
          total_amount: tax.total,
          wht_amount: tax.whtAmount,
          net_payable: tax.netPayable,
          note: note || null,
          converted_from_id: quotation.id,
        })
        .select("*")
        .single();

      if (docError || !deliveryNote) throw docError || new Error("สร้างใบส่งของไม่สำเร็จ");
      createdDocId = deliveryNote.id;

      const lineRecords = selectedLines.map((line, index) => {
        const calc = calculateLineAmounts({
          unit_price: line.source.unit_price,
          quantity: line.quantity,
          discount_percent: line.source.discount_percent,
        });

        return {
          document_id: deliveryNote.id,
          user_id: userId,
          item_id: line.source.item_id,
          item_name: line.source.item_name,
          line_note: line.source.line_note || null,
          item_sku: line.source.item_sku,
          item_type: line.source.item_type,
          unit: line.source.unit,
          unit_price: line.source.unit_price,
          quantity: line.quantity,
          base_quantity: getBaseQuantity(line.source, line.quantity),
          discount_percent: line.source.discount_percent,
          discount_amount: calc.discountAmount,
          qty_carton: line.source.qty_carton ? line.quantity : null,
          carton_unit: line.source.carton_unit,
          line_total: calc.lineTotal,
          source_document_id: quotation.id,
          source_line_item_id: line.source.id,
          sort_order: index,
        };
      });

      const { error: lineError } = await supabase.from("document_line_items").insert(lineRecords);
      if (lineError) throw lineError;

      toast.success("สร้างใบส่งของจากใบเสนอราคาแล้ว");
      navigate(`/documents/${deliveryNote.id}`);
    } catch (err: any) {
      if (createdDocId) {
        await supabase.from("documents").delete().eq("id", createdDocId);
      }
      if (err?.code === "23505") {
        const message = "มีร่างใบส่งของสำหรับใบเสนอราคานี้อยู่แล้ว";
        setError(message);
        toast.error(message);
        refetchExistingDraft();
        return;
      }
      setError(err.message || "เกิดข้อผิดพลาด");
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="ออกใบส่งของจากใบเสนอราคา" showBack>
        <Spinner />
      </AppShell>
    );
  }

  if (error || !quotation) {
    return (
      <AppShell title="ออกใบส่งของจากใบเสนอราคา" showBack>
        <div className="py-12 text-center text-sm text-red-600">{error || "ไม่พบใบเสนอราคา"}</div>
      </AppShell>
    );
  }

  if (quotationLines.length === 0) {
    return (
      <AppShell title="ออกใบส่งของจากใบเสนอราคา" showBack>
        <EmptyState title="ใบเสนอราคานี้ไม่มีรายการสินค้า" description="เพิ่มรายการในใบเสนอราคาก่อนสร้างใบส่งของ" />
      </AppShell>
    );
  }

  return (
    <AppShell title="ออกใบส่งของจากใบเสนอราคา" showBack>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {existingDraft && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              มีร่างใบส่งของที่ยังไม่ได้ส่ง
              {existingDraft.doc_number ? ` (${existingDraft.doc_number})` : ""}
            </p>
            <p className="mt-0.5 text-xs leading-5">เปิดร่างเดิมเพื่อแก้ไขหรือยืนยันส่งของ ก่อนสร้างร่างใหม่</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/documents/${existingDraft.id}`)}
          >
            เปิดร่าง
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">อ้างอิงใบเสนอราคา</div>
              <div className="mt-1 text-lg font-semibold text-[#1A1A18]">{quotation.doc_number || "-"}</div>
              <div className="mt-1 text-sm text-gray-500">{quotation.customer?.name || "ลูกค้า"}</div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>วันที่ใบเสนอราคา</div>
              <div className="mt-1 font-medium text-gray-800">{formatBuddhistDate(quotation.issue_date)}</div>
            </div>
          </div>
        </Card>

        {overDeliveryLines.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">มีรายการที่เกินจำนวนคงเหลือจากใบเสนอราคา</p>
              <p className="mt-0.5 text-xs leading-5">ระบบอนุญาตให้บันทึกได้ แต่ควรตรวจสอบกับลูกค้าก่อนส่งของ</p>
            </div>
          </div>
        )}

        <Card>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">รายการที่จะส่งรอบนี้</h3>
              <p className="mt-1 text-xs text-gray-500">ปรับจำนวนได้ ใส่ 0 หากยังไม่ส่งรายการนั้น</p>
            </div>
            <Input
              className="w-[150px]"
              label="วันที่ส่งของ"
              type="date"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            {lines.map((line) => {
              const deliveredRemaining = round3(line.source.quantity - line.delivered);
              const remaining = round3(line.source.quantity - line.delivered - line.pending);
              const over = line.quantity > Math.max(0, remaining);
              const totalWithPending = round3(line.delivered + line.pending + line.quantity);

              return (
                <div
                  key={line.source.id}
                  className={`rounded-xl border p-3 ${
                    over ? "border-amber-300 bg-amber-50" : "border-card-border bg-white"
                  }`}
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-start">
                    <div className="min-w-0">
                      <div className="font-medium text-[#1A1A18]">{line.source.item_name}</div>
                      {line.source.item_sku && <div className="mt-0.5 text-xs text-gray-500">SKU: {line.source.item_sku}</div>}
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
                        <div>
                          <div className="text-gray-400">เสนอราคา</div>
                          <div className="font-medium text-gray-800">{formatQty(line.source.quantity)} {line.source.unit}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">ส่งแล้ว</div>
                          <div className="font-medium text-gray-800">{formatQty(line.delivered)} {line.source.unit}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">ร่างค้าง</div>
                          <div className="font-medium text-gray-800">{formatQty(line.pending)} {line.source.unit}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">คงเหลือ</div>
                          <div className={`font-medium ${remaining < 0 ? "text-red-700" : "text-gray-800"}`}>{formatQty(remaining)} {line.source.unit}</div>
                        </div>
                      </div>
                      {over && (
                        <div className="mt-2 text-xs font-medium text-amber-800">
                          รอบนี้เกินคงเหลือ {formatQty(round3(line.quantity - Math.max(0, remaining)))} {line.source.unit}
                        </div>
                      )}
                      {line.pending > 0 && (
                        <div className="mt-1 text-xs text-gray-500">
                          ยังไม่รวมร่างค้าง คงเหลือหลังส่งจริง: {formatQty(deliveredRemaining)} {line.source.unit} • รวมร่างค้างและรอบนี้: {formatQty(totalWithPending)} {line.source.unit}
                        </div>
                      )}
                    </div>
                    <Input
                      label="จำนวนส่ง"
                      type="number"
                      min="0"
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) => updateQuantity(line.source.id, event.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="space-y-3">
            <Input
              label="หมายเหตุบนใบส่งของ"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="เช่น ส่งบางส่วนจากใบเสนอราคา"
            />
            <div className="rounded-xl border border-[#E8E6DF] bg-[#FAF8F3] p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
                <PackageCheck className="h-3.5 w-3.5" />
                สรุปภายในระบบ
              </div>
              <div className="flex justify-between">
                <span>จำนวนรายการที่จะสร้าง</span>
                <span>{selectedLines.length} รายการ</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>มูลค่าอ้างอิง</span>
                <span>฿{formatCurrency(tax.total)}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">มูลค่านี้ใช้สำหรับรวมออกใบแจ้งหนี้ภายหลัง แต่ PDF ใบส่งของจะไม่แสดงราคา</p>
            </div>
            <Button className="w-full justify-center" disabled={selectedLines.length === 0 || saving} loading={saving} onClick={handleSave}>
              สร้างใบส่งของฉบับร่าง
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
