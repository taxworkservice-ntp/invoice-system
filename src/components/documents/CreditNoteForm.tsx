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
import { CatalogAutocomplete } from "../CatalogAutocomplete";
import { Spinner } from "../ui/Spinner";
import { generateDocNumberBE } from "../../lib/docNumber";
import { calculateLineAmounts, calculateTax } from "../../lib/tax";
import { DOC_TYPE_LABELS } from "../../constants";
import type { Document, DocumentLineItem, Customer, Deal } from "../../types";

interface CreditNoteFormProps {
  dealId?: string;
  documentId?: string;
}

interface CreditItem {
  key: string;
  itemId: string;
  itemName: string;
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

export function CreditNoteForm({ dealId, documentId }: CreditNoteFormProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const { items: catalogItems } = useItems(userId);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paidInvoices, setPaidInvoices] = useState<Document[]>([]);
  const [refInvoiceId, setRefInvoiceId] = useState("");
  const [refInvoiceLines, setRefInvoiceLines] = useState<DocumentLineItem[]>([]);
  const [items, setItems] = useState<CreditItem[]>([]);
  const [note, setNote] = useState("");
  const [documentDiscountPercent, setDocumentDiscountPercent] = useState(0);
  const [addItemInput, setAddItemInput] = useState("");

  const [docId, setDocId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState("");
  const isEditing = !!documentId;
  const isReadOnly = isEditing && existingStatus !== "draft";

  const vatRegistered = clientProfile?.vat_registered ?? false;
  const vatRate = clientProfile?.vat_rate ?? 7.0;
  const whtRate = parseFloat(clientProfile?.default_wht_rate ?? "0") || 0;

  const taxCalcItems = items.map((it) => ({
    unit_price: it.unitPrice,
    quantity: it.quantity,
    discount_percent: it.discountPercent,
  }));
  const tax = calculateTax(taxCalcItems, vatRegistered, vatRate, whtRate, {
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
      setError("ไม่พบดีล");
      setLoading(false);
      return;
    }

    setCustomer((deal as any).customers || null);

    const { data: paidDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("deal_id", dealId)
      .eq("user_id", userId)
      .in("status", ["paid", "generated"])
      .order("created_at", { ascending: false });

    if (paidDocs && paidDocs.length > 0) {
      setPaidInvoices(paidDocs as unknown as Document[]);
      setRefInvoiceId(paidDocs[0].id);
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

    if (!doc || (doc as any).doc_type !== "credit_note") {
      setError("ไม่พบใบลดหนี้");
      setLoading(false);
      return;
    }

    setExistingStatus((doc as any).status);
    setDocId((doc as any).id);
    setNote((doc as any).note || "");
    setDocumentDiscountPercent((doc as any).discount_percent || 0);

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
          itemName: l.item_name,
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
  }, [documentId, userId]);

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

    setRefInvoiceLines((lines || []) as DocumentLineItem[]);

    if (!isEditing) {
      setItems(
        (lines || []).map((l: any) => ({
          key: uid(),
          itemId: l.item_id || "",
          itemName: l.item_name,
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
        itemName: cat.name,
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
    if (!userId || !customer) return;
    if (items.length === 0) {
      setError("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ");
      return;
    }

    setSaving(true);
    setError("");

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
    const now = new Date().toISOString().slice(0, 10);

    try {
      let targetDocId = docId;

      if (!isEditing) {
        const docNumber = await generateDocNumberBE(userId, "credit_note", now);
        const { data: newDoc, error: insertErr } = await supabase
          .from("documents")
          .insert({
            user_id: userId,
            deal_id: dealId || null,
            customer_id: customer.id,
            doc_type: "credit_note",
            doc_number: docNumber,
            status,
            issue_date: now,
            vat_registered: vatRegistered,
            vat_rate: vatRate,
            wht_rate: whtRate,
            discount_percent: documentDiscountPercent,
            discount_amount: taxResult.discountAmount,
            subtotal: taxResult.subtotal,
            vat_amount: taxResult.vatAmount,
            total_amount: taxResult.total,
            wht_amount: taxResult.whtAmount,
            net_payable: taxResult.netPayable,
            note: note || null,
            converted_from_id: refInvoiceId || null,
          })
          .select("id")
          .single();

        if (insertErr) throw insertErr;
        targetDocId = newDoc.id;
      } else {
        const { error: updateErr } = await supabase
          .from("documents")
          .update({
            status,
            vat_registered: vatRegistered,
            vat_rate: vatRate,
            wht_rate: whtRate,
            discount_percent: documentDiscountPercent,
            discount_amount: taxResult.discountAmount,
            subtotal: taxResult.subtotal,
            vat_amount: taxResult.vatAmount,
            total_amount: taxResult.total,
            wht_amount: taxResult.whtAmount,
            net_payable: taxResult.netPayable,
            note: note || null,
            converted_from_id: refInvoiceId || null,
          })
          .eq("id", docId);

        if (updateErr) throw updateErr;
      }

      if (isEditing) {
        await supabase.from("document_line_items").delete().eq("document_id", docId);
      }

      if (targetDocId) {
        const { error: linesErr } = await supabase.from("document_line_items").insert(
          items.map((it, idx) => {
            const lineCalc = calculateLineAmounts({
              unit_price: it.unitPrice,
              quantity: it.quantity,
              discount_percent: it.discountPercent,
            });

            return {
              document_id: targetDocId,
              user_id: userId,
              item_id: it.itemId || null,
              item_name: it.itemName,
              item_type: it.itemType,
              unit: it.unit,
              unit_price: it.unitPrice,
              quantity: it.quantity,
              discount_percent: it.discountPercent,
              discount_amount: lineCalc.discountAmount,
              qty_carton: null,
              carton_unit: null,
              line_total: lineCalc.lineTotal,
              sort_order: idx,
            };
          })
        );
        if (linesErr) throw linesErr;
      }

      toast.success(status === "issued" ? "ออกใบลดหนี้แล้ว" : "บันทึกฉบับร่างแล้ว");
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
      <AppShell title={isEditing ? "แก้ไขใบลดหนี้" : "ออกใบลดหนี้"} showBack>
        <Spinner />
      </AppShell>
    );
  }

  if (error && !customer) {
    return (
      <AppShell title="ออกใบลดหนี้" showBack>
        <p className="text-sm text-red-500">{error}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={isEditing ? "แก้ไขใบลดหนี้" : "ออกใบลดหนี้"} showBack>
      <div className="space-y-4">
        <Card>
          <div className="space-y-3">
            <div>
              <span className="text-[11px] text-[#888780]">ลูกค้า</span>
              <p className="text-sm font-medium">{customer?.name || "-"}</p>
            </div>

            {!isEditing && paidInvoices.length > 0 && (
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
            )}

            {isEditing && refInvoiceId && (
              <div>
                <span className="text-[11px] text-[#888780]">อ้างอิง</span>
                <p className="text-sm text-[#888780]">
                  {refInvoiceLines.length > 0
                    ? (paidInvoices.find((d) => d.id === refInvoiceId)?.doc_number || refInvoiceId)
                    : refInvoiceId}
                </p>
              </div>
            )}
          </div>
        </Card>

        {paidInvoices.length === 0 && !isEditing && (
          <Card>
            <p className="text-sm text-[#888780] text-center py-4">
              ไม่มีเอกสารที่ชำระแล้วในดีลนี้
            </p>
          </Card>
        )}

        <Card>
          <div className="text-[11px] uppercase font-semibold text-[#888780] tracking-wide mb-3">
            รายการ
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-[#888780] text-center py-4">
              ยังไม่มีรายการ — เลือกอ้างอิงใบแจ้งหนี้ด้านบนหรือเพิ่มรายการจากแค็ตตาล็อก
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E8E6DF] text-[#888780]">
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
                    <tr key={it.key} className="border-b border-[#E8E6DF]/50">
                      <td className="py-2 pr-1 text-[#888780]">{idx + 1}</td>
                      <td className="py-2 pr-2">
                        <div className="text-[13px] font-medium truncate max-w-[160px]">
                          {it.itemName}
                        </div>
                        <div className="text-[10px] text-[#888780]">{it.unit}</div>
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
              />
            </div>
          )}
        </Card>

        <Card>
          <div className="text-[11px] uppercase font-semibold text-[#888780] tracking-wide mb-3">
            สรุปยอดเงิน
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-[#888780]">ยอดรวม</span>
              <span>฿{tax.subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
            {vatRegistered && (
              <div className="flex justify-between">
                <span className="text-[#888780]">VAT {vatRate}%</span>
                <span>฿{tax.vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {whtRate > 0 && (
              <div className="flex justify-between">
                <span className="text-[#888780]">หัก ณ ที่จ่าย {whtRate}%</span>
                <span>฿{tax.whtAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="border-t border-[#E8E6DF] pt-1 flex justify-between font-semibold">
              <span>ยอดสุทธิ</span>
              <span>฿{tax.netPayable.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </Card>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            หมายเหตุ
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เหตุผลการลดหนี้ (เช่น สินค้าเสียหาย, คืนเงินบางส่วน)"
            rows={3}
            disabled={isReadOnly}
            className="w-full px-3 py-2 text-sm border border-[#E8E6DF] rounded-lg bg-white focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/20 placeholder:text-gray-400 resize-none disabled:bg-gray-50"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {!isReadOnly && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => handleSave("draft")}
              disabled={saving}
            >
              {saving ? "กำลังบันทึก..." : "บันทึกฉบับร่าง"}
            </Button>
            <Button
              className="flex-1"
              onClick={() => handleSave("issued")}
              disabled={saving}
            >
              {saving ? "กำลังออก..." : "ออกใบลดหนี้"}
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
