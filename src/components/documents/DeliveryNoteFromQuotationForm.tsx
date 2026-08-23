import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, PackageCheck, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { supabase } from "../../lib/supabase";
import { resolveDocNumber } from "../../lib/docNumber";
import { businessTodayString } from "../../lib/devDate";
import { calculateLineAmounts, calculateTax } from "../../lib/tax";
import { formatBuddhistDate } from "../../lib/dates";
import { formatCurrency } from "../../lib/format";
import type { Customer, Document, DocumentLineItem, DocumentStatus } from "../../types";
import { EditableDocNumber } from "./EditableDocNumber";

type QuotationWithCustomer = Document & { customer?: Customer };

type DeliveryTotals = {
  delivered: number;
  pending: number;
};

type DeliveryLine = {
  id: string;
  source: DocumentLineItem | null;
  quantity: number;
  delivered: number;
  pending: number;
  item_name: string;
  item_sku: string | null;
  item_type: string;
  unit: string;
  unit_price: number;
  discount_percent: number;
  line_note: string;
  base_quantity: number | null;
  qty_carton: number | null;
  carton_unit: string | null;
  hide_amounts_on_print: boolean;
};

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
  documentId?: string;
}

export function DeliveryNoteFromQuotationForm({ quotationId, documentId }: DeliveryNoteFromQuotationFormProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const businessToday = businessTodayString(clientProfile);
  const todayString = () => businessToday;
  const toast = useToast();

  const [quotation, setQuotation] = useState<QuotationWithCustomer | null>(null);
  const [quotationLines, setQuotationLines] = useState<DocumentLineItem[]>([]);
  const [lines, setLines] = useState<DeliveryLine[]>([]);
  const [existingDraft, setExistingDraft] = useState<{ id: string; doc_number: string | null } | null>(null);
  const [issueDate, setIssueDate] = useState(() => businessTodayString(clientProfile));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [error, setError] = useState("");
  const [hideAmountsOnPrint, setHideAmountsOnPrint] = useState(true);
  const [showFullTotals, setShowFullTotals] = useState(false);
  const totalsTouched = useRef(false);

  useEffect(() => {
    if (!documentId && clientProfile && !totalsTouched.current) {
      setShowFullTotals(clientProfile.delivery_note_show_full_totals === true);
    }
  }, [documentId, clientProfile]);

  const isEditing = Boolean(documentId);

  useEffect(() => {
    if (documentId) return;
    const realToday = businessTodayString(null);
    if (issueDate === realToday) setIssueDate(businessToday);
  }, [businessToday, documentId, issueDate]);

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

        const [
          { data: sourcedDnLines, error: dnLinesError },
          { data: existingDoc, error: existingDocError },
          { data: existingLines, error: existingLinesError },
        ] = await Promise.all([
          supabase
            .from("document_line_items")
            .select("*, document:document_id(id, status, doc_type)")
            .eq("source_document_id", quotationId),
          documentId
            ? supabase
                .from("documents")
                .select("*")
                .eq("id", documentId)
                .eq("user_id", userId)
                .eq("converted_from_id", quotationId)
                .eq("doc_type", "delivery_note")
                .eq("status", "draft")
                .single()
            : Promise.resolve({ data: null, error: null }),
          documentId
            ? supabase
                .from("document_line_items")
                .select("*")
                .eq("document_id", documentId)
                .order("sort_order", { ascending: true })
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (dnLinesError) throw dnLinesError;
        if (existingDocError) throw existingDocError;
        if (existingLinesError) throw existingLinesError;
        if (documentId && !existingDoc) throw new Error("ไม่พบร่างใบส่งของ");

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

        if (documentId && existingDoc) {
          setIssueDate((existingDoc as Document).issue_date || todayString());
          setNote((existingDoc as Document).note || "");
          setDocNumberOverride((existingDoc as Document).doc_number || "");
          setHideAmountsOnPrint((existingDoc as Document).hide_amounts_on_print ?? true);
          setShowFullTotals((existingDoc as Document).show_full_totals ?? false);
        }

        const activeDraft = draftDoc && draftDoc.id !== documentId
          ? { id: draftDoc.id, doc_number: draftDoc.doc_number }
          : null;

        const totals = new Map<string, DeliveryTotals>();
        ((sourcedDnLines || []) as (DocumentLineItem & { document?: Pick<Document, "id" | "status" | "doc_type"> })[]).forEach((line) => {
          if (!line.source_line_item_id || line.document?.doc_type !== "delivery_note" || line.document?.status === "voided") return;
          if (documentId && line.document?.id === documentId) return;
          const current = totals.get(line.source_line_item_id) || { delivered: 0, pending: 0 };
          if (line.document?.status === "sent" || line.document?.status === "converted") {
            current.delivered = round3(current.delivered + line.quantity);
          } else if (line.document?.status === "draft") {
            current.pending = round3(current.pending + line.quantity);
          }
          totals.set(line.source_line_item_id, current);
        });

        const qLines = (quoteLines || []) as DocumentLineItem[];
        const sourceLineById = new Map(qLines.map((line) => [line.id, line]));
        const existingDnLines = (existingLines || []) as DocumentLineItem[];
        const coveredSourceIds = new Set<string>();
        const initialLines: DeliveryLine[] = [];

        if (documentId && existingDnLines.length > 0) {
          existingDnLines.forEach((line) => {
            if (line.source_line_item_id) coveredSourceIds.add(line.source_line_item_id);
            const source = line.source_line_item_id
              ? sourceLineById.get(line.source_line_item_id) || null
              : null;
            const total = source ? totals.get(source.id) || { delivered: 0, pending: 0 } : { delivered: 0, pending: 0 };
            initialLines.push({
              id: line.id,
              source,
              quantity: round3(Number(line.quantity) || 0),
              delivered: total.delivered,
              pending: total.pending,
              item_name: line.item_name,
              item_sku: line.item_sku ?? source?.item_sku ?? null,
              item_type: line.item_type || source?.item_type || "product",
              unit: line.unit || source?.unit || "ชิ้น",
              unit_price: Number(line.unit_price) || 0,
              discount_percent: Number(line.discount_percent) || 0,
              line_note: line.line_note ?? "",
              base_quantity: line.base_quantity ?? null,
              qty_carton: line.qty_carton ?? null,
              carton_unit: line.carton_unit ?? null,
              hide_amounts_on_print: line.hide_amounts_on_print ?? false,
            });
          });

          qLines.forEach((line) => {
            if (coveredSourceIds.has(line.id)) return;
            const total = totals.get(line.id) || { delivered: 0, pending: 0 };
            const remaining = round3(line.quantity - total.delivered - total.pending);
            if (remaining <= 0) return;
            initialLines.push({
              id: line.id,
              source: line,
              quantity: remaining,
              delivered: total.delivered,
              pending: total.pending,
              item_name: line.item_name,
              item_sku: line.item_sku,
              item_type: line.item_type,
              unit: line.unit || "ชิ้น",
              unit_price: Number(line.unit_price) || 0,
              discount_percent: Number(line.discount_percent) || 0,
              line_note: line.line_note ?? "",
              base_quantity: null,
              qty_carton: line.qty_carton ?? null,
              carton_unit: line.carton_unit ?? null,
              hide_amounts_on_print: false,
            });
          });
        } else {
          qLines.forEach((line) => {
            const total = totals.get(line.id) || { delivered: 0, pending: 0 };
            const remaining = round3(line.quantity - total.delivered - total.pending);
            initialLines.push({
              id: line.id,
              source: line,
              quantity: Math.max(0, remaining),
              delivered: total.delivered,
              pending: total.pending,
              item_name: line.item_name,
              item_sku: line.item_sku,
              item_type: line.item_type,
              unit: line.unit || "ชิ้น",
              unit_price: Number(line.unit_price) || 0,
              discount_percent: Number(line.discount_percent) || 0,
              line_note: line.line_note ?? "",
              base_quantity: null,
              qty_carton: line.qty_carton ?? null,
              carton_unit: line.carton_unit ?? null,
              hide_amounts_on_print: false,
            });
          });
        }

        if (cancelled) return;
        setQuotation(quote);
        setQuotationLines(qLines);
        setLines(initialLines);
        setExistingDraft(activeDraft);
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
  }, [documentId, quotationId, userId]);

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
    setExistingDraft(draftDoc && draftDoc.id !== documentId ? { id: draftDoc.id, doc_number: draftDoc.doc_number } : null);
  }, [documentId, quotationId, userId]);

  const selectedLines = useMemo(
    () => lines.filter((line) => line.quantity > 0),
    [lines],
  );

  const overDeliveryLines = useMemo(
    () => lines.filter((line) => line.source && line.quantity > Math.max(0, round3(line.source.quantity - line.delivered - line.pending))),
    [lines],
  );

  const tax = useMemo(() => {
    return calculateTax(
      selectedLines.map((line) => ({
        unit_price: line.unit_price,
        quantity: line.quantity,
        discount_percent: line.discount_percent || 0,
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
        line.id === lineId
          ? { ...line, quantity: Number.isFinite(nextQty) ? Math.max(0, round3(nextQty)) : 0 }
          : line,
      ),
    );
  };

  const updateLine = (lineId: string, patch: Partial<DeliveryLine>) => {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const addCustomLine = () => {
    setLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        source: null,
        quantity: 1,
        delivered: 0,
        pending: 0,
        item_name: "",
        item_sku: null,
        item_type: "product",
        unit: "ชิ้น",
        unit_price: 0,
        discount_percent: 0,
        line_note: "",
        base_quantity: null,
        qty_carton: null,
        carton_unit: null,
        hide_amounts_on_print: false,
      },
    ]);
  };

  const removeLine = (lineId: string) => {
    setLines((current) => current.filter((line) => line.id !== lineId));
  };

  const handleSave = async () => {
    if (!quotation || !userId || selectedLines.length === 0) return;
    setSaving(true);
    setError("");

    let createdDocId: string | null = null;

    try {
      const docNumber = await resolveDocNumber(userId, "delivery_note", issueDate, docNumberOverride, documentId);
      const docPayload = {
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
          vat_amount: 0,
          total_amount: tax.total,
          wht_amount: 0,
          net_payable: tax.total,
          note: note || null,
          hide_amounts_on_print: hideAmountsOnPrint,
          show_full_totals: showFullTotals,
          converted_from_id: quotation.id,
        };

      let deliveryNoteId = documentId || "";
      if (documentId) {
        const { error: docError } = await supabase
          .from("documents")
          .update(docPayload)
          .eq("id", documentId)
          .eq("user_id", userId)
          .eq("status", "draft");

        if (docError) throw docError;
        const { error: deleteLinesError } = await supabase.from("document_line_items").delete().eq("document_id", documentId);
        if (deleteLinesError) throw deleteLinesError;
      } else {
        const { data: deliveryNote, error: docError } = await supabase
          .from("documents")
          .insert(docPayload)
          .select("*")
          .single();

        if (docError || !deliveryNote) throw docError || new Error("สร้างใบส่งของไม่สำเร็จ");
        deliveryNoteId = deliveryNote.id;
        createdDocId = deliveryNote.id;
      }

      const lineRecords = selectedLines.map((line, index) => {
        const calc = calculateLineAmounts({
          unit_price: line.unit_price,
          quantity: line.quantity,
          discount_percent: line.discount_percent,
        });

        return {
          document_id: deliveryNoteId,
          user_id: userId,
          item_id: line.source?.item_id ?? null,
          item_name: line.item_name,
          line_note: line.line_note.trim() || null,
          item_sku: line.item_sku,
          item_type: line.item_type,
          unit: line.unit,
          unit_price: line.unit_price,
          quantity: line.quantity,
          base_quantity: line.source ? getBaseQuantity(line.source, line.quantity) : line.base_quantity,
          discount_percent: line.discount_percent,
          discount_amount: calc.discountAmount,
          qty_carton: line.source ? (line.source.qty_carton ? line.quantity : null) : line.qty_carton,
          carton_unit: line.source?.carton_unit ?? line.carton_unit,
          line_total: calc.lineTotal,
          source_document_id: line.source ? quotation.id : null,
          source_line_item_id: line.source ? line.source.id : null,
          source_delivered_qty: line.source ? Number(line.source.quantity) || 0 : null,
          source_unit_price: line.source ? Number(line.source.unit_price) || 0 : null,
          hide_amounts_on_print: line.hide_amounts_on_print,
          sort_order: index,
        };
      });

      const { error: lineError } = await supabase.from("document_line_items").insert(lineRecords);
      if (lineError) throw lineError;

      toast.success(documentId ? "บันทึกร่างใบส่งของแล้ว" : "สร้างใบส่งของจากใบเสนอราคาแล้ว");
      if (quotation.deal_id) navigate(`/deals/${quotation.deal_id}`);
      else navigate(`/documents/${deliveryNoteId}`);
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
      <AppShell title={isEditing ? "แก้ไขร่างใบส่งของ" : "ออกใบส่งของจากใบเสนอราคา"} showBack>
        <Spinner />
      </AppShell>
    );
  }

  if (error || !quotation) {
    return (
      <AppShell title={isEditing ? "แก้ไขร่างใบส่งของ" : "ออกใบส่งของจากใบเสนอราคา"} showBack>
        <div className="py-12 text-center text-sm text-red-600">{error || "ไม่พบใบเสนอราคา"}</div>
      </AppShell>
    );
  }

  if (quotationLines.length === 0) {
    return (
      <AppShell title={isEditing ? "แก้ไขร่างใบส่งของ" : "ออกใบส่งของจากใบเสนอราคา"} showBack>
        <EmptyState title="ใบเสนอราคานี้ไม่มีรายการสินค้า" description="เพิ่มรายการในใบเสนอราคาก่อนสร้างใบส่งของ" />
      </AppShell>
    );
  }

  return (
    <AppShell title={isEditing ? "แก้ไขร่างใบส่งของ" : "ออกใบส่งของจากใบเสนอราคา"} showBack>
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
              <div className="mt-1 text-lg font-semibold text-ink-900">{quotation.doc_number || "-"}</div>
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
              <p className="mt-1 text-xs text-gray-500">แก้ไขจำนวน ราคา หรือรายละเอียดได้ ใส่ 0 หรือลบรายการ หากยังไม่ส่ง</p>
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
              const remaining = line.source
                ? round3(line.source.quantity - line.delivered - line.pending)
                : null;
              const over = remaining !== null && line.quantity > Math.max(0, remaining);
              const totalWithPending = round3(line.delivered + line.pending + line.quantity);
              const lineCalc = calculateLineAmounts({
                unit_price: line.unit_price,
                quantity: line.quantity,
                discount_percent: line.discount_percent,
              });

              return (
                <div
                  key={line.id}
                  className={`rounded-xl border p-3 ${
                    over ? "border-amber-300 bg-amber-50" : "border-card-border bg-white"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Input
                        label="ชื่อสินค้า / รายละเอียด"
                        value={line.item_name}
                        onChange={(event) => updateLine(line.id, { item_name: event.target.value })}
                        placeholder="ระบุชื่อสินค้า"
                      />
                      {line.source?.item_sku && <div className="mt-0.5 text-xs text-gray-500">SKU: {line.source.item_sku}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-card-border text-gray-400 transition-colors hover:border-red-300 hover:text-red-600"
                      title="ลบรายการนี้"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {line.source && (
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
                        <div className={`font-medium ${remaining! < 0 ? "text-red-700" : "text-gray-800"}`}>{formatQty(remaining!)} {line.source.unit}</div>
                      </div>
                    </div>
                  )}

                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input
                      label="จำนวนส่ง"
                      type="number"
                      min="0"
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) => updateQuantity(line.id, event.target.value)}
                    />
                    <Input
                      label="หน่วย"
                      value={line.unit}
                      onChange={(event) => updateLine(line.id, { unit: event.target.value })}
                      placeholder="ชิ้น"
                    />
                    <Input
                      label="ราคา/หน่วย"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unit_price}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        updateLine(line.id, { unit_price: Number.isFinite(next) ? Math.max(0, next) : 0 });
                      }}
                    />
                    <Input
                      label="ส่วนลด %"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.discount_percent}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        updateLine(line.id, { discount_percent: Number.isFinite(next) ? Math.max(0, next) : 0 });
                      }}
                    />
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-2">
                    <Input
                      className="flex-1"
                      label="หมายเหตุของรายการ"
                      value={line.line_note}
                      onChange={(event) => updateLine(line.id, { line_note: event.target.value })}
                      placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                    />
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-medium text-gray-700">฿{formatCurrency(lineCalc.lineTotal)}</div>
                      <div className="text-2xs text-gray-400">{formatQty(line.quantity)} × ฿{formatCurrency(line.unit_price)}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateLine(line.id, { hide_amounts_on_print: !line.hide_amounts_on_print })}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        line.hide_amounts_on_print
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-card-border text-gray-500 hover:border-primary hover:text-primary"
                      }`}
                      title={line.hide_amounts_on_print ? "คลิกเพื่อแสดงราคาในเอกสาร" : "คลิกเพื่อซ่อนราคาในเอกสาร"}
                    >
                      {line.hide_amounts_on_print ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {line.hide_amounts_on_print ? "ซ่อนราคาแล้ว" : "ซ่อนราคา"}
                    </button>
                    <span className="text-xs text-gray-500">
                      {line.hide_amounts_on_print
                        ? "เอกสารจะแสดงเฉพาะชื่อสินค้า จำนวน และหน่วย โดยไม่แสดงราคาและยอดเงินของรายการนี้"
                        : "ราคา/หน่วย ส่วนลด และยอดเงินของรายการนี้จะแสดงบนเอกสาร"}
                    </span>
                  </div>

                  {over && (
                    <div className="mt-2 text-xs font-medium text-amber-800">
                      รอบนี้เกินคงเหลือ {formatQty(round3(line.quantity - Math.max(0, remaining!)))} {line.source!.unit}
                    </div>
                  )}
                  {line.pending > 0 && (
                    <div className="mt-1 text-xs text-gray-500">
                      ยังไม่รวมร่างค้าง คงเหลือหลังส่งจริง: {formatQty(round3(line.source!.quantity - line.delivered))} {line.source!.unit} • รวมร่างค้างและรอบนี้: {formatQty(totalWithPending)} {line.source!.unit}
                    </div>
                  )}
                </div>
              );
            })}

            <Button variant="secondary" size="sm" className="w-full justify-center" onClick={addCustomLine}>
              <Plus className="h-4 w-4 mr-1.5" />
              เพิ่มรายการ
            </Button>
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
            <div className="rounded-xl border border-card-border bg-paper-soft p-3 text-sm">
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
              {hideAmountsOnPrint ? (
                <p className="mt-2 text-xs leading-5 text-gray-500">มูลค่านี้ใช้สำหรับรวมออกใบแจ้งหนี้ภายหลัง แต่ PDF ใบส่งของจะไม่แสดงราคา</p>
              ) : (
                <p className="mt-2 text-xs leading-5 text-blue-600">PDF ใบส่งของจะแสดงราคาและยอดรวมด้วย</p>
              )}
            </div>
            <EditableDocNumber
              value={docNumberOverride}
              onChange={setDocNumberOverride}
              placeholder="เลขที่ใบส่งของ (เว้นว่าง = สร้างอัตโนมัติ)"
              autoGenerate={async () => userId ? await resolveDocNumber(userId, "delivery_note", issueDate, undefined, documentId) : ""}
              className="mb-3"
            />
          </div>
        </Card>

        <Card>
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative inline-flex items-center mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={hideAmountsOnPrint}
                onChange={(e) => setHideAmountsOnPrint(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-9 h-5 rounded-full transition-colors ${hideAmountsOnPrint ? "bg-primary" : "bg-gray-300"}`}
              />
              <div
                className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${hideAmountsOnPrint ? "translate-x-4" : ""}`}
              />
            </div>
            <div>
              <span className="text-sm font-medium text-gray-800">ซ่อนจำนวนเงินใน PDF</span>
              <span className="text-[11px] text-gray-400 ml-2">ซ่อนยอดเงินเมื่อพิมพ์</span>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                เมื่อเปิดใช้งาน PDF ใบส่งของจะแสดงเฉพาะชื่อสินค้า จำนวน และหน่วย โดยไม่แสดงราคา ส่วนลด และยอดรวม
              </p>
            </div>
          </label>
        </Card>

        {!hideAmountsOnPrint && (
          <Card>
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative inline-flex items-center mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={showFullTotals}
                  onChange={(e) => { totalsTouched.current = true; setShowFullTotals(e.target.checked); }}
                  className="sr-only"
                />
                <div
                  className={`w-9 h-5 rounded-full transition-colors ${showFullTotals ? "bg-primary" : "bg-gray-300"}`}
                />
                <div
                  className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showFullTotals ? "translate-x-4" : ""}`}
                />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-800">แสดงยอดรวมแบบใบแจ้งหนี้</span>
                <span className="text-[11px] text-gray-400 ml-2">รวม VAT และหัก ณ ที่จ่ายในใบส่งของ</span>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  เปิดใช้งานเพื่อแสดงยอดสรุปแบบเต็ม (มูลค่าก่อนภาษี VAT ยอดรวมทั้งสิ้น หัก ณ ที่จ่าย และยอดสุทธิ) คล้ายใบแจ้งหนี้ หากปิด ใบส่งของจะแสดงเฉพาะมูลค่ารวม
                </p>
              </div>
            </label>
          </Card>
        )}

        <Button className="w-full justify-center" disabled={selectedLines.length === 0 || saving} loading={saving} onClick={handleSave}>
          {isEditing ? "บันทึกร่างใบส่งของ" : "สร้างใบส่งของฉบับร่าง"}
        </Button>
      </div>
    </AppShell>
  );
}
