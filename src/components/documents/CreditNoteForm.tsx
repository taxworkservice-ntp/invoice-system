import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { useItems } from "../../hooks/useItems";
import { useToast } from "../../hooks/useToast";
import { AppShell } from "../layout/AppShell";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Input";
import { DateInput } from "../ui/DateInput";
import { CatalogAutocomplete } from "../CatalogAutocomplete";
import { Spinner } from "../ui/Spinner";
import { resolveDocNumber } from "../../lib/docNumber";
import { isRefSummaryLine } from "../../lib/refSummary";
import { businessTodayString } from "../../lib/devDate";
import { calculateLineAmounts, calculateTax } from "../../lib/tax";
import { returnStockOnCreditNoteIssued } from "../../lib/stock";
import { formatBuddhistDate } from "../../lib/dates";
import { DOC_TYPE_LABELS, WHT_RATE_OPTIONS } from "../../constants";
import type { Document, DocumentLineItem, Customer, Deal } from "../../types";
import { EditableDocNumber } from "./EditableDocNumber";
import { FormStep } from "./FormStep";
import { FormActionBar } from "./FormActionBar";

interface CreditNoteFormProps {
  dealId?: string;
  documentId?: string;
  /** Which adjustment document this form manages (default: credit_note). */
  docType?: "credit_note" | "debit_note";
}

interface CreditItem {
  key: string;
  itemId: string;
  itemSku?: string | null;
  itemName: string;
  lineNote: string;
  itemType: "product" | "service";
  unit: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  lineTotal: number;
}

let idCounter = 0;
function uid() {
  return `cn_${++idCounter}_${Date.now()}`;
}

export function CreditNoteForm({ dealId, documentId, docType = "credit_note" }: CreditNoteFormProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const businessToday = businessTodayString(clientProfile);
  const todayString = () => businessToday;
  const { items: catalogItems, addItem } = useItems(userId);
  const toast = useToast();

  // ใบลดหนี้ reduces what the customer owes (and returns stock on issue).
  // ใบเพิ่มหนี้ increases it — purely financial, no stock movement.
  const isDebit = docType === "debit_note";
  const docTitleTh = isDebit ? "ใบเพิ่มหนี้" : "ใบลดหนี้";
  const issueVerbTh = isDebit ? "ออกใบเพิ่มหนี้" : "ออกใบลดหนี้";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [error, setError] = useState("");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paidInvoices, setPaidInvoices] = useState<Document[]>([]);
  const [refInvoiceId, setRefInvoiceId] = useState("");
  const [refInvoiceLines, setRefInvoiceLines] = useState<DocumentLineItem[]>([]);
  const [existingCreditTotal, setExistingCreditTotal] = useState(0);
  const [items, setItems] = useState<CreditItem[]>([]);
  const [note, setNote] = useState("");
  const [documentDiscountPercent, setDocumentDiscountPercent] = useState(0);
  const [addItemInput, setAddItemInput] = useState("");
  const [issueDate, setIssueDate] = useState(() => businessTodayString(clientProfile));
  const [showIssueDatePicker, setShowIssueDatePicker] = useState(false);

  const [docId, setDocId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState("");
  const isEditing = !!documentId;
  const isReadOnly = isEditing && existingStatus !== "draft";

  useEffect(() => {
    if (documentId) return;
    const realToday = businessTodayString(null);
    if (issueDate === realToday) setIssueDate(businessToday);
  }, [businessToday, documentId, issueDate]);

  const vatRegistered = clientProfile?.vat_registered ?? false;
  const vatRate = clientProfile?.vat_rate ?? 7.0;
  const [whtRate, setWhtRate] = useState(0);
  const [whtConfirmed, setWhtConfirmed] = useState(false);

  const taxCalcItems = items.map((it) => ({
    unit_price: it.unitPrice,
    quantity: it.quantity,
    discount_percent: it.discountPercent,
  }));
  const tax = calculateTax(taxCalcItems, vatRegistered, vatRate, whtConfirmed ? whtRate : 0, {
    discountPercent: documentDiscountPercent,
  });

  const loadDeal = useCallback(async () => {
    if (!dealId || !userId) return;
    setLoading(true);

    const { data: deal } = await supabase
      .from("deals")
      .select("*, customers:customer_id(*)")
      .eq("id", dealId)
      .single();

    if (!deal) {
      setError("ไม่พบงานขาย");
      setLoading(false);
      return;
    }

    setCustomer((deal as any).customers || null);

    const { data: paidDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("deal_id", dealId)
      .eq("user_id", userId)
      .in("doc_type", ["invoice", "tax_invoice_receipt"])
      .in("status", ["paid", "generated", "issued"])
      .order("created_at", { ascending: false });

    if (paidDocs && paidDocs.length > 0) {
      setPaidInvoices(paidDocs as unknown as Document[]);
      setRefInvoiceId(paidDocs[0].id);
      setWhtRate(Number(paidDocs[0].wht_rate) || 0);
    }

    setLoading(false);
  }, [dealId, userId]);

  const loadExisting = useCallback(async () => {
    if (!documentId || !userId) return;
    setLoading(true);

    const { data: doc } = await supabase
      .from("documents")
      .select("*, customer:customer_id(*), deal:deal_id(*, customers:customer_id(*))")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (!doc || (doc as any).doc_type !== docType) {
      setError(`ไม่พบ${docTitleTh}`);
      setLoading(false);
      return;
    }

    setExistingStatus((doc as any).status);
    setDocId((doc as any).id);
    setNote((doc as any).note || "");
    setDocumentDiscountPercent((doc as any).discount_percent || 0);
    setIssueDate((doc as any).issue_date || todayString());
    setWhtRate(Number((doc as any).wht_rate) || 0);
    setWhtConfirmed(Number((doc as any).wht_amount) > 0);

    if ((doc as any).converted_from_id) {
      setRefInvoiceId((doc as any).converted_from_id);
    }

    const cust = (doc as any).customer || (doc as any).deal?.customers;
    if (cust) setCustomer(cust);

    const { data: lines } = await supabase
      .from("document_line_items")
      .select("*")
      .eq("document_id", documentId)
      .order("sort_order");

    if (lines) {
      setItems(
        (lines as DocumentLineItem[]).map((l) => ({
          key: uid(),
          itemId: l.item_id || "",
          itemSku: l.item_sku || null,
          itemName: l.item_name,
          lineNote: l.line_note || "",
          itemType: l.item_type,
          unit: l.unit,
          unitPrice: l.unit_price,
          quantity: l.quantity,
          discountPercent: l.discount_percent || 0,
          lineTotal: l.line_total,
        }))
      );
    }

    setLoading(false);
  }, [documentId, userId, docType, docTitleTh]);

  const loadRefInvoiceLines = useCallback(async () => {
    if (!refInvoiceId) {
      setRefInvoiceLines([]);
      if (!isEditing) setItems([]);
      return;
    }

    const { data: lines } = await supabase
      .from("document_line_items")
      .select("*")
      .eq("document_id", refInvoiceId)
      .order("sort_order");

    // Skip ref-summary header rows persisted by invoice-from-DN/QT flows —
    // they are print markers (qty 0, ฿0), not creditable items.
    const realLines = (lines || []).filter((l) => !isRefSummaryLine(l));
    setRefInvoiceLines(realLines as DocumentLineItem[]);

    if (!isEditing) {
      setItems(
        realLines.map((l: any) => ({
          key: uid(),
          itemId: l.item_id || "",
          itemSku: l.item_sku || null,
          itemName: l.item_name,
          lineNote: l.line_note || "",
          itemType: l.item_type,
          unit: l.unit,
          unitPrice: l.unit_price,
          quantity: l.quantity,
          discountPercent: l.discount_percent || 0,
          lineTotal: l.line_total,
        }))
      );
    }
  }, [refInvoiceId, isEditing]);

  useEffect(() => {
    if (dealId) loadDeal();
    else if (documentId) loadExisting();
  }, [dealId, documentId, loadDeal, loadExisting]);

  // Track how much of the referenced invoice has already been credited by
  // active (non-voided, non-this-draft) credit notes — used for over-credit guard.
  useEffect(() => {
    if (!userId || !refInvoiceId || !paidInvoices.length) {
      setExistingCreditTotal(0);
      return;
    }
    let cancelled = false;

    async function loadExistingCredits() {
      const { data: creditNotes } = await supabase
        .from("documents")
        .select("id, total_amount")
        .eq("user_id", userId)
        .eq("doc_type", docType)
        .eq("converted_from_id", refInvoiceId)
        .neq("status", "voided");

      if (cancelled) return;
      const total = (creditNotes || [])
        .filter((cn: any) => cn.id !== docId)
        .reduce((sum: number, cn: any) => sum + Number(cn.total_amount || 0), 0);
      setExistingCreditTotal(total);
    }

    loadExistingCredits();
    return () => {
      cancelled = true;
    };
  }, [refInvoiceId, docId, paidInvoices.length, userId]);

  useEffect(() => {
    if (refInvoiceId && !isEditing) loadRefInvoiceLines();
  }, [refInvoiceId, loadRefInvoiceLines, isEditing]);

  function updateItem(key: string, field: "quantity" | "unitPrice" | "unit" | "discountPercent", value: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const updated = { ...it };
        if (field === "quantity") updated.quantity = parseFloat(value) || 0;
        if (field === "unitPrice") updated.unitPrice = parseFloat(value) || 0;
        if (field === "unit") updated.unit = value;
        if (field === "discountPercent") updated.discountPercent = parseFloat(value) || 0;
        updated.lineTotal = calculateLineAmounts({
          unit_price: updated.unitPrice,
          quantity: updated.quantity,
          discount_percent: updated.discountPercent,
        }).lineTotal;
        return updated;
      })
    );
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function handleAddCatalogItem(itemId: string) {
    const cat = catalogItems.find((i) => i.id === itemId);
    if (!cat) return;
    setItems((prev) => [
      ...prev,
      {
        key: uid(),
        itemId: cat.id,
        itemSku: cat.sku,
        itemName: cat.name,
        lineNote: "",
        itemType: cat.item_type,
        unit: cat.base_unit,
        unitPrice: cat.unit_price,
        quantity: 1,
        discountPercent: 0,
        lineTotal: cat.unit_price,
      },
    ]);
  }

  async function handleSave(status: "draft" | "issued") {
    if (!userId) {
      setError("กำลังโหลดข้อมูลผู้ใช้ กรุณาลองอีกครั้ง");
      return;
    }
    if (!customer) {
      setError("กำลังโหลดข้อมูลลูกค้า กรุณาลองอีกครั้ง");
      toast.error("กำลังโหลดข้อมูลลูกค้า กรุณาลองอีกครั้ง");
      return;
    }
    if (items.length === 0) {
      setError("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ");
      return;
    }

    const taxResult = calculateTax(
      items.map((it) => ({
        unit_price: it.unitPrice,
        quantity: it.quantity,
        discount_percent: it.discountPercent,
      })),
      vatRegistered,
      vatRate,
      whtRate,
      { discountPercent: documentDiscountPercent },
    );

    // Guardrail: cumulative active credits against the source invoice must not
    // exceed its total (prevents over-crediting). Debit notes have no upper limit.
    if (!isDebit && refInvoiceId) {
      const refInvoice = paidInvoices.find((d) => d.id === refInvoiceId);
      const invoiceTotal = Number(refInvoice?.total_amount || 0);
      const remainingCreditable = invoiceTotal - existingCreditTotal;
      if (invoiceTotal > 0 && taxResult.total > remainingCreditable + 0.01) {
        setError(
          `ยอดใบลดหนี้รวมเกินกว่าที่จะลดได้ — ใบแจ้งหนี้ ${refInvoice?.doc_number || ""} วงเงินคงเหลือที่ลดได้ ฿${remainingCreditable.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
        );
        return;
      }
    }

    setSaving(true);
    setError("");

    const effectiveIssueDate = issueDate || todayString();

    try {
      const docNumber = !isEditing
        ? await resolveDocNumber(userId, docType, effectiveIssueDate, docNumberOverride, docId || undefined)
        : null;

      const pLines = items.map((it, idx) => {
        const lineCalc = calculateLineAmounts({
          unit_price: it.unitPrice,
          quantity: it.quantity,
          discount_percent: it.discountPercent,
        });
        return {
          item_id: it.itemId || null,
          item_name: it.itemName,
          line_note: it.lineNote.trim() || null,
          item_sku: it.itemSku || null,
          item_type: it.itemType,
          unit: it.unit,
          unit_price: it.unitPrice,
          quantity: it.quantity,
          discount_percent: it.discountPercent,
          discount_amount: lineCalc.discountAmount,
          line_total: lineCalc.lineTotal,
          sort_order: idx,
        };
      });

      // Transactional path: document + lines + over-credit recheck + stock
      // return all commit together or not at all (see save_adjustment_note).
      const { data: savedId, error: saveError } = await supabase.rpc("save_adjustment_note", {
        p_user_id: userId,
        p_document: {
          id: docId || null,
          doc_type: docType,
          status,
          deal_id: dealId || null,
          customer_id: customer.id,
          doc_number: docNumber,
          issue_date: effectiveIssueDate,
          vat_registered: vatRegistered,
          vat_rate: vatRate,
          wht_rate: whtConfirmed ? whtRate : 0,
          discount_percent: documentDiscountPercent,
          discount_amount: taxResult.discountAmount,
          subtotal: taxResult.subtotal,
          vat_amount: taxResult.vatAmount,
          total_amount: taxResult.total,
          wht_amount: taxResult.whtAmount,
          net_payable: taxResult.netPayable,
          note: note || null,
          converted_from_id: refInvoiceId || null,
        },
        p_lines: pLines,
      });
      if (saveError) throw saveError;
      const targetDocId =
        typeof savedId === "string"
          ? savedId
          : Array.isArray(savedId)
            ? (savedId as string[])[0]
            : (savedId as any)?.id;
      if (!targetDocId) throw new Error("เกิดข้อผิดพลาดในการบันทึก");

      toast.success(status === "issued" ? `${issueVerbTh}แล้ว` : "บันทึกฉบับร่างแล้ว");
      navigate(`/documents/${targetDocId}`, { replace: true });
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาด");
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell title={isEditing ? `แก้ไข${docTitleTh}` : issueVerbTh} showBack>
        <Spinner />
      </AppShell>
    );
  }

  if (error && !customer) {
    return (
      <AppShell title={issueVerbTh} showBack>
        <p className="text-sm text-red-500">{error}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={isEditing ? `แก้ไข${docTitleTh}` : issueVerbTh} showBack>
      <div className="space-y-4">
        <FormStep number={1} title="ลูกค้าและการอ้างอิง">
          <div className="space-y-3">
            <div>
              <span className="text-[11px] text-ink-300">ลูกค้า</span>
              <p className="text-sm font-medium">{customer?.name || "-"}</p>
            </div>

            <div className="rounded-xl border border-line-soft bg-paper-field px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-gray-500">วันที่ที่ใช้บนเอกสาร</div>
                  <div className="mt-1 text-sm font-semibold text-ink-900">{formatBuddhistDate(issueDate)}</div>
                </div>
                {!isReadOnly && (
                  <div className="flex gap-2">
                    {issueDate !== todayString() && (
                      <button
                        type="button"
                        onClick={() => {
                          setIssueDate(todayString());
                          setShowIssueDatePicker(false);
                        }}
                        className="rounded-lg border border-cool-200 px-3 py-2 text-xs font-medium text-cool-500 transition-colors hover:bg-white"
                      >
                        ใช้วันนี้
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowIssueDatePicker((prev) => !prev)}
                      className="rounded-lg border border-cool-200 bg-white px-3 py-2 text-xs font-medium text-ink-900 transition-colors hover:bg-gray-50"
                    >
                      {showIssueDatePicker || issueDate !== todayString() ? "เปลี่ยนวันที่" : "ออกย้อนหลัง"}
                    </button>
                  </div>
                )}
              </div>
              {(showIssueDatePicker || issueDate !== todayString()) && !isReadOnly && (
                <div className="mt-3 border-t border-line-faint pt-3">
                  <DateInput
                    id="creditNoteIssueDate"
                    value={issueDate}
                    max={todayString()}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </div>
              )}
            </div>

            {!isEditing && paidInvoices.length > 0 && (
              <>
                <Select
                  label="อ้างอิงใบแจ้งหนี้เดิม"
                  value={refInvoiceId}
                  onChange={(e) => setRefInvoiceId(e.target.value)}
                >
                  {paidInvoices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.doc_number} — ฿{d.total_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </option>
                  ))}
                </Select>
                {!isDebit && (() => {
                  const refInvoice = paidInvoices.find((d) => d.id === refInvoiceId);
                  const invoiceTotal = Number(refInvoice?.total_amount || 0);
                  if (!refInvoice || invoiceTotal <= 0) return null;
                  const remaining = invoiceTotal - existingCreditTotal;
                  return (
                    <p className={`text-xs leading-5 ${remaining <= 0 ? "text-amber-600" : "text-gray-500"}`}>
                      {remaining > 0
                        ? `วงเงินคงเหลือที่ลดได้จากใบนี้: ฿${remaining.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
                        : "ใบแจ้งหนี้นี้ถูกลดหนี้ครบวงเงินแล้ว"}
                    </p>
                  );
                })()}
              </>
            )}

            {isEditing && refInvoiceId && (
              <div>
                <span className="text-[11px] text-ink-300">อ้างอิง</span>
                <p className="text-sm text-ink-300">
                  {refInvoiceLines.length > 0
                    ? (paidInvoices.find((d) => d.id === refInvoiceId)?.doc_number || refInvoiceId)
                    : refInvoiceId}
                </p>
              </div>
            )}
          </div>
        </FormStep>

        {paidInvoices.length === 0 && !isEditing && (
          <Card>
            <p className="text-sm text-ink-300 text-center py-4">
              ไม่มีเอกสารที่ชำระแล้วในงานขายนี้
            </p>
          </Card>
        )}

        <FormStep number={2} title="รายการ">
          <div className="text-[11px] uppercase font-semibold text-ink-300 tracking-wide mb-3">
            รายการ
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-ink-300 text-center py-4">
              ยังไม่มีรายการ — เลือกอ้างอิงใบแจ้งหนี้ด้านบนหรือเพิ่มรายการจากแค็ตตาล็อก
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-card-border text-ink-300">
                    <th className="text-left py-2 pr-1 w-8">#</th>
                    <th className="text-left py-2 pr-2">รายการ</th>
                    <th className="text-right py-2 pr-2 w-16">จำนวน</th>
                    <th className="text-right py-2 pr-2 w-20">ราคา/หน่วย</th>
                    <th className="text-right py-2 pr-2 w-20">รวม</th>
                    {!isReadOnly && <th className="w-6" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.key} className="border-b border-card-border/50">
                      <td className="py-2 pr-1 text-ink-300">{idx + 1}</td>
                      <td className="py-2 pr-2">
                        <div className="text-sm font-medium truncate max-w-[160px]">
                          {it.itemName}
                        </div>
                        {it.lineNote ? <div className="mt-0.5 text-2xs text-ink-300">{it.lineNote}</div> : null}
                        <div className="text-2xs text-ink-300">{it.unit}</div>
                      </td>
                      <td className="py-2 pr-2">
                        {isReadOnly ? (
                          <span className="text-right block">{it.quantity}</span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={it.quantity}
                            onChange={(e) => updateItem(it.key, "quantity", e.target.value)}
                            className="text-xs text-right px-1 py-1"
                          />
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        {isReadOnly ? (
                          <span className="text-right block">{it.unitPrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.unitPrice}
                            onChange={(e) => updateItem(it.key, "unitPrice", e.target.value)}
                            className="text-xs text-right px-1 py-1"
                          />
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right font-medium">
                        {it.lineTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      {!isReadOnly && (
                        <td className="py-2 text-center">
                          <button
                            onClick={() => removeItem(it.key)}
                            className="text-red-400 hover:text-red-600 text-xs"
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isReadOnly && (
            <div className="mt-3 flex items-center gap-2">
              <CatalogAutocomplete
                items={catalogItems}
                value={addItemInput}
                onChange={setAddItemInput}
                onSelect={(cat) => {
                  handleAddCatalogItem(cat.id);
                  setAddItemInput("");
                }}
                placeholder="+ เพิ่มรายการจากแค็ตตาล็อก"
                onCreate={async (input) => {
                  const created = await addItem(input);
                  handleAddCatalogItem(created.id);
                  setAddItemInput("");
                  return created;
                }}
              />
            </div>
          )}
        </FormStep>

        <FormStep number={3} title="สรุปและบันทึก">
          <div className="mb-3 text-[11px] uppercase font-semibold text-ink-300 tracking-wide">
            สรุปยอดเงิน
          </div>
             <div className="space-y-1 text-sm">
             <div className="flex justify-between">
               <span className="text-ink-300">{isDebit ? "ยอดเพิ่มก่อน VAT" : "ยอดลดก่อน VAT"}</span>
              <span>฿{tax.subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
            {vatRegistered && (
              <div className="flex justify-between">
                 <span className="text-ink-300">{isDebit ? "VAT ที่เพิ่ม" : "VAT ที่ลด"} {vatRate}%</span>
                <span>฿{tax.vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {vatRegistered && (
               <div className="flex justify-between">
                 <span className="text-ink-300">{isDebit ? "ยอดเพิ่มรวม" : "ยอดลดรวม"}</span>
                <span>฿{tax.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
             {whtConfirmed && tax.whtAmount > 0 && (
               <div className="flex justify-between">
                 <span className="text-ink-300">WHT ที่เกี่ยวข้อง {whtRate}%</span>
                 <span>฿{tax.whtAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
               </div>
             )}
            <div className="border-t border-card-border pt-1 flex justify-between font-semibold">
               <span>{isDebit ? "ยอดเพิ่มสุทธิ" : "ยอดเครดิตสุทธิ"}</span>
              <span>฿{tax.netPayable.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              หมายเหตุ
            </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isDebit ? "เหตุผลการเพิ่มหนี้ (เช่น ค่าใช้จ่ายเพิ่มเติมตามข้อตกลง)" : "เหตุผลการลดหนี้ (เช่น สินค้าเสียหาย, คืนเงินบางส่วน)"}
            rows={3}
            disabled={isReadOnly}
            className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-gray-400 resize-none disabled:bg-gray-50"
          />
          </div>

          {!isReadOnly && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <label className="flex items-start gap-2 text-xs text-amber-900">
                <input
                  type="checkbox"
                  checked={whtConfirmed}
                  onChange={(event) => setWhtConfirmed(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">มีการหักภาษี ณ ที่จ่ายจริงสำหรับรายการนี้</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-amber-700">
                    เปิดใช้เฉพาะกรณีที่เกี่ยวข้องกับการชำระเงินจริงและมี/จะมีหนังสือรับรองหัก ณ ที่จ่าย
                  </span>
                </span>
              </label>
              {whtConfirmed && (
                <Select
                  label="อัตราภาษีหัก ณ ที่จ่าย"
                  value={String(whtRate)}
                  onChange={(event) => setWhtRate(Number(event.target.value) || 0)}
                  className="mt-2"
                >
                  {WHT_RATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              )}
            </div>
          )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <EditableDocNumber
          value={docNumberOverride}
          onChange={setDocNumberOverride}
          placeholder={`เลขที่${docTitleTh} (เว้นว่าง = สร้างอัตโนมัติ)`}
          autoGenerate={async () => userId && !isEditing ? await resolveDocNumber(userId, docType, issueDate || todayString(), undefined, docId || undefined) : ""}
          className="mb-3"
        />

        </FormStep>

        {!isReadOnly && (
          <FormActionBar
            contextLabel={`${customer?.name || ""} · ${items.length} รายการ`}
            totalLabel={isDebit ? "ยอดเพิ่มสุทธิ" : "ยอดลดสุทธิ"}
            total={tax.netPayable}
            secondary={{
              label: "บันทึกฉบับร่าง",
              onClick: () => handleSave("draft"),
              loading: saving,
              disabled: saving,
            }}
            primary={{
              label: issueVerbTh,
              onClick: () => handleSave("issued"),
              loading: saving,
              disabled: saving,
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
