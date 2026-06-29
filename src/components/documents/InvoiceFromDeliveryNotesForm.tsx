import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, FileStack } from "lucide-react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Input";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";
import { CustomerPickerModal } from "../customers/CustomerPickerModal";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { useCustomers } from "../../hooks/useCustomers";
import { useToast } from "../../hooks/useToast";
import { supabase } from "../../lib/supabase";
import { generateDocNumberBE } from "../../lib/docNumber";
import { calculateTax } from "../../lib/tax";
import { formatBuddhistDate } from "../../lib/dates";
import { formatCurrency } from "../../lib/format";
import { WHT_RATE_OPTIONS, VAT_DEFAULT } from "../../constants";
import type { Customer, Document, DocumentLineItem, DocumentStatus, WhtRate } from "../../types";

type DeliveryNoteOption = Document & {
  line_items: DocumentLineItem[];
  active_invoice_id?: string | null;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function defaultDeliveryNoteStartString() {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.toISOString().slice(0, 10);
}

function buildItemSummary(items: DocumentLineItem[]) {
  if (!items.length) return "ไม่มีรายการ";
  const summary = items.slice(0, 2).map((item) => `${item.item_name} × ${item.quantity}`).join(", ");
  return items.length > 2 ? `${summary} และอีก ${items.length - 2} รายการ` : summary;
}

function lineTaxInput(line: DocumentLineItem) {
  return {
    unit_price: line.unit_price,
    quantity: line.quantity,
    discount_percent: line.discount_percent || 0,
  };
}

export function InvoiceFromDeliveryNotesForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedDnId = searchParams.get("dnId");
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const { customers, loading: customersLoading, addCustomer } = useCustomers(userId);
  const toast = useToast();

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(defaultDeliveryNoteStartString());
  const [dateTo, setDateTo] = useState(todayString());
  const [issueDate, setIssueDate] = useState(todayString());
  const [whtRate, setWhtRate] = useState<WhtRate>("0");
  const [note, setNote] = useState("");

  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingDns, setLoadingDns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (clientProfile) {
      setWhtRate(clientProfile.default_wht_rate);
    }
  }, [clientProfile]);

  useEffect(() => {
    if (!preselectedDnId || !userId) return;

    let cancelled = false;
    async function loadPreselectedDeliveryNote() {
      const { data: dn } = await supabase
        .from("documents")
        .select("id, customer_id")
        .eq("id", preselectedDnId)
        .eq("user_id", userId)
        .eq("doc_type", "delivery_note")
        .eq("status", "sent")
        .maybeSingle();

      if (!cancelled && dn?.customer_id) {
        setSelectedCustomerId(dn.customer_id);
      }
    }

    loadPreselectedDeliveryNote();
    return () => {
      cancelled = true;
    };
  }, [preselectedDnId, userId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || null,
    [customers, selectedCustomerId],
  );

  useEffect(() => {
    if (!selectedCustomerId || !userId) {
      setDeliveryNotes([]);
      setSelectedIds(new Set());
      return;
    }

    let cancelled = false;
    async function loadDeliveryNotes() {
      setLoadingDns(true);
      setError("");

      const { data: docs, error: docsError } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", userId)
        .eq("customer_id", selectedCustomerId)
        .eq("doc_type", "delivery_note")
        .eq("status", "sent")
        .gte("issue_date", dateFrom)
        .lte("issue_date", dateTo)
        .order("issue_date", { ascending: true });

      if (docsError) {
        if (!cancelled) setError(docsError.message);
        if (!cancelled) setLoadingDns(false);
        return;
      }

      let docList = (docs || []) as DeliveryNoteOption[];
      if (preselectedDnId && !docList.some((doc) => doc.id === preselectedDnId)) {
        const { data: preselectedDoc } = await supabase
          .from("documents")
          .select("*")
          .eq("id", preselectedDnId)
          .eq("user_id", userId)
          .eq("customer_id", selectedCustomerId)
          .eq("doc_type", "delivery_note")
          .eq("status", "sent")
          .maybeSingle();
        if (preselectedDoc) {
          docList = [...docList, preselectedDoc as DeliveryNoteOption].sort((a, b) =>
            (a.issue_date || "").localeCompare(b.issue_date || ""),
          );
        }
      }
      const docIds = docList.map((doc) => doc.id);

      const [{ data: lineItems }, { data: activeLinks }] = await Promise.all([
        docIds.length
          ? supabase.from("document_line_items").select("*").in("document_id", docIds).order("sort_order", { ascending: true })
          : Promise.resolve({ data: [] as DocumentLineItem[] }),
        docIds.length
          ? supabase.from("invoice_delivery_notes").select("delivery_note_id, invoice_id").in("delivery_note_id", docIds).is("released_at", null)
          : Promise.resolve({ data: [] as { delivery_note_id: string; invoice_id: string }[] }),
      ]);

      if (cancelled) return;

      const linesByDoc = new Map<string, DocumentLineItem[]>();
      ((lineItems || []) as DocumentLineItem[]).forEach((line) => {
        const current = linesByDoc.get(line.document_id) || [];
        current.push(line);
        linesByDoc.set(line.document_id, current);
      });

      const activeByDn = new Map<string, string>();
      ((activeLinks || []) as { delivery_note_id: string; invoice_id: string }[]).forEach((link) => {
        activeByDn.set(link.delivery_note_id, link.invoice_id);
      });

      const options = docList
        .map((doc) => ({
          ...doc,
          line_items: linesByDoc.get(doc.id) || [],
          active_invoice_id: activeByDn.get(doc.id) || null,
        }))
        .filter((doc) => !doc.active_invoice_id);

      setDeliveryNotes(options);
      setSelectedIds(
        preselectedDnId && options.some((doc) => doc.id === preselectedDnId)
          ? new Set([preselectedDnId])
          : new Set(options.map((doc) => doc.id)),
      );
      setLoadingDns(false);
    }

    loadDeliveryNotes();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, preselectedDnId, selectedCustomerId, userId]);

  const selectedDeliveryNotes = useMemo(
    () => deliveryNotes.filter((doc) => selectedIds.has(doc.id)),
    [deliveryNotes, selectedIds],
  );

  const selectedLines = useMemo(
    () => selectedDeliveryNotes.flatMap((doc) => doc.line_items.map((line) => ({ doc, line }))),
    [selectedDeliveryNotes],
  );

  const selectedDealId = useMemo(() => {
    const dealIds = Array.from(new Set(selectedDeliveryNotes.map((doc) => doc.deal_id).filter(Boolean)));
    return dealIds.length === 1 ? dealIds[0] : null;
  }, [selectedDeliveryNotes]);

  const selectedDealIds = useMemo(
    () => Array.from(new Set(selectedDeliveryNotes.map((doc) => doc.deal_id).filter(Boolean))),
    [selectedDeliveryNotes],
  );

  const hasMixedDeals = selectedDealIds.length > 1;

  const taxSnapshot = useMemo(() => {
    if (selectedDeliveryNotes.length === 0) {
      return {
        vatRegistered: clientProfile?.vat_registered ?? false,
        vatRate: clientProfile?.vat_rate ?? VAT_DEFAULT,
        mixed: false,
      };
    }

    const first = selectedDeliveryNotes[0];
    const mixed = selectedDeliveryNotes.some(
      (doc) => doc.vat_registered !== first.vat_registered || Number(doc.vat_rate) !== Number(first.vat_rate),
    );

    return {
      vatRegistered: first.vat_registered,
      vatRate: first.vat_rate ?? VAT_DEFAULT,
      mixed,
    };
  }, [clientProfile?.vat_rate, clientProfile?.vat_registered, selectedDeliveryNotes]);

  const tax = useMemo(() => {
    return calculateTax(
      selectedLines.map(({ line }) => lineTaxInput(line)),
      taxSnapshot.vatRegistered,
      taxSnapshot.vatRate,
      parseFloat(whtRate),
    );
  }, [selectedLines, taxSnapshot.vatRate, taxSnapshot.vatRegistered, whtRate]);

  const toggleDn = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!userId || !selectedCustomer || selectedDeliveryNotes.length === 0) return;
    if (selectedLines.length === 0) {
      setError("ใบส่งของที่เลือกยังไม่มีรายการสินค้า");
      return;
    }

    setSaving(true);
    setError("");
    let invoiceId: string | null = null;
    let createdDealId: string | null = null;

    try {
      let invoiceDealId = selectedDealId || selectedDealIds[0] || null;
      if (!invoiceDealId) {
        const { data: deal, error: dealError } = await supabase
          .from("deals")
          .insert({
            user_id: userId,
            customer_id: selectedCustomer.id,
            title: selectedCustomer.name,
          })
          .select("id")
          .single();
        if (dealError || !deal) throw dealError || new Error("ไม่สามารถสร้างงานขายสำหรับใบแจ้งหนี้ได้");
        invoiceDealId = deal.id;
        createdDealId = deal.id;
      }

      const docNumber = await generateDocNumberBE(userId, "invoice", issueDate);
      const { data: invoice, error: invoiceError } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          deal_id: invoiceDealId,
          customer_id: selectedCustomer.id,
          doc_type: "invoice",
          doc_number: docNumber,
          status: "sent" as DocumentStatus,
          issue_date: issueDate,
          vat_registered: taxSnapshot.vatRegistered,
          vat_rate: taxSnapshot.vatRate,
          wht_rate: parseFloat(whtRate),
          discount_percent: 0,
          discount_amount: tax.discountAmount,
          subtotal: tax.subtotal,
          vat_amount: tax.vatAmount,
          total_amount: tax.total,
          wht_amount: tax.whtAmount,
          net_payable: tax.netPayable,
          note: note || null,
        })
        .select("*")
        .single();

      if (invoiceError || !invoice) throw invoiceError || new Error("ไม่สามารถสร้างใบแจ้งหนี้ได้");
      invoiceId = invoice.id;

      const lineRecords = selectedLines.map(({ doc, line }, index) => ({
        document_id: invoice.id,
        user_id: userId,
        item_id: line.item_id,
        item_name: line.item_name,
        item_sku: line.item_sku,
        item_type: line.item_type,
        unit: line.unit,
        unit_price: line.unit_price,
        quantity: line.quantity,
        base_quantity: line.base_quantity,
        discount_percent: line.discount_percent,
        discount_amount: line.discount_amount,
        qty_carton: line.qty_carton,
        carton_unit: line.carton_unit,
        line_total: line.line_total,
        source_document_id: doc.id,
        source_line_item_id: line.id,
        sort_order: index,
      }));

      const { error: lineError } = await supabase.from("document_line_items").insert(lineRecords);
      if (lineError) throw lineError;

      const linkRecords = selectedDeliveryNotes.map((dn) => ({
        invoice_id: invoice.id,
        delivery_note_id: dn.id,
        user_id: userId,
        delivery_note_number: dn.doc_number || dn.id.slice(0, 8),
        issue_date: dn.issue_date || null,
        subtotal: dn.subtotal || dn.line_items.reduce((sum, line) => sum + line.line_total, 0),
        vat_amount: dn.vat_amount || 0,
        total_amount: dn.total_amount || dn.line_items.reduce((sum, line) => sum + line.line_total, 0),
      }));

      const { error: linkError } = await supabase.from("invoice_delivery_notes").insert(linkRecords);
      if (linkError) throw linkError;

      const { error: updateError } = await supabase
        .from("documents")
        .update({ status: "converted" as DocumentStatus, deal_id: invoiceDealId })
        .in("id", selectedDeliveryNotes.map((dn) => dn.id));
      if (updateError) throw updateError;

      toast.success("สร้างใบแจ้งหนี้จากใบส่งของแล้ว");
      navigate(`/documents/${invoice.id}`);
    } catch (err: any) {
      if (invoiceId) {
        await supabase.from("documents").delete().eq("id", invoiceId);
      }
      if (createdDealId) {
        await supabase.from("deals").delete().eq("id", createdDealId);
      }
      setError(err.message || "เกิดข้อผิดพลาดในการสร้างใบแจ้งหนี้");
      toast.error(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  const canSave = Boolean(selectedCustomer && selectedDeliveryNotes.length > 0 && selectedLines.length > 0);

  return (
    <AppShell title="ออกใบแจ้งหนี้จากใบส่งของ" showBack>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {clientProfile?.vat_registered && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">โปรดยืนยันเวลาการออกใบกำกับภาษีกับบัญชีของคุณ</p>
            <p className="mt-0.5 text-xs leading-5">ระบบรองรับการรวมใบส่งของหลายใบเพื่อออกใบกำกับภาษีภายหลัง แต่กิจการ VAT ควรตรวจสอบจุดรับรู้ภาษีให้ถูกต้อง</p>
          </div>
        </div>
      )}

      {taxSnapshot.mixed && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">ใบส่งของที่เลือกมีการตั้งค่าภาษีไม่ตรงกัน</p>
            <p className="mt-0.5 text-xs leading-5">ระบบจะใช้การตั้งค่าภาษีจากใบส่งของใบแรกในรายการ โปรดตรวจสอบก่อนสร้างใบแจ้งหนี้</p>
          </div>
        </div>
      )}

      {hasMixedDeals && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <FileStack className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">ใบส่งของที่เลือกมาจากหลายงานขาย</p>
            <p className="mt-0.5 text-xs leading-5">ระบบจะรวมใบส่งของทั้งหมดไว้ในงานขายเดียวกับใบแจ้งหนี้ เพื่อให้มองเห็นขั้นตอนเอกสารต่อเนื่องบนหน้าหลัก</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <h3 className="mb-3 text-sm font-medium">ลูกค้าและรอบเอกสาร</h3>
          {customersLoading ? (
            <Spinner />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">ลูกค้า</label>
                {selectedCustomer ? (
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-card-border bg-[#FAF8F3] p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#1A1A18]">{selectedCustomer.name}</div>
                      {selectedCustomer.tax_id && <div className="mt-1 text-xs text-gray-500">เลขผู้เสียภาษี: {selectedCustomer.tax_id}</div>}
                      {selectedCustomer.address && <div className="mt-1 line-clamp-2 text-xs text-gray-500">{selectedCustomer.address}</div>}
                      {(!selectedCustomer.tax_id || !selectedCustomer.address) && (
                        <div className="mt-1 text-xs text-amber-600">ข้อมูลลูกค้ายังไม่ครบสำหรับเอกสารภาษี</div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setCustomerPickerOpen(true)}>เปลี่ยน</Button>
                  </div>
                ) : (
                  <Button variant="secondary" className="w-full justify-center" onClick={() => setCustomerPickerOpen(true)}>
                    เลือกลูกค้า
                  </Button>
                )}
                <CustomerPickerModal
                  open={customerPickerOpen}
                  customers={customers}
                  selectedCustomerId={selectedCustomerId}
                  taxSensitive
                  onClose={() => setCustomerPickerOpen(false)}
                  onSelect={(customer) => setSelectedCustomerId(customer.id)}
                  onCreate={async (customer) => addCustomer(customer)}
                />
              </div>
              <Input label="วันที่ใบแจ้งหนี้" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
              <Input label="ตั้งแต่วันที่ส่งของ" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <Input label="ถึงวันที่ส่งของ" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              <p className="text-xs leading-5 text-gray-500 sm:col-span-2">
                ระบบแสดงใบส่งของที่ยืนยันแล้วในช่วงวันที่นี้ ค่าเริ่มต้นย้อนหลัง 90 วัน และจะรวมใบที่เลือกจากปุ่มลัดไว้เสมอ
              </p>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">ใบส่งของที่พร้อมออกใบแจ้งหนี้</h3>
              <p className="mt-1 text-xs text-gray-500">เลือกทั้งใบเท่านั้น ระบบจะล็อกใบส่งของหลังสร้างใบแจ้งหนี้</p>
            </div>
            {deliveryNotes.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (selectedIds.size === deliveryNotes.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(deliveryNotes.map((dn) => dn.id)));
                }}
              >
                {selectedIds.size === deliveryNotes.length ? "ล้างที่เลือก" : "เลือกทั้งหมด"}
              </Button>
            )}
          </div>

          {loadingDns ? (
            <Spinner />
          ) : !selectedCustomerId ? (
            <EmptyState title="เลือกลูกค้าก่อน" description="ระบบจะแสดงใบส่งของที่ส่งแล้วและยังไม่ถูกนำไปออกใบแจ้งหนี้" />
          ) : deliveryNotes.length === 0 ? (
            <EmptyState title="ไม่พบใบส่งของที่พร้อมออกใบแจ้งหนี้" description="ลองเปลี่ยนช่วงวันที่ หรือเช็คว่าใบส่งของถูกทำเครื่องหมายว่าส่งแล้ว" />
          ) : (
            <div className="space-y-2">
              {deliveryNotes.map((dn) => (
                <button
                  key={dn.id}
                  type="button"
                  onClick={() => toggleDn(dn.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    selectedIds.has(dn.id)
                      ? "border-primary bg-blue-50"
                      : "border-card-border bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(dn.id)}
                      onChange={() => toggleDn(dn.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[#1A1A18]">{dn.doc_number || "ไม่มีเลขเอกสาร"}</span>
                        <span className="text-xs text-gray-500">{formatBuddhistDate(dn.issue_date)}</span>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-gray-500">{buildItemSummary(dn.line_items)}</div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-gray-500">
                      <div>{dn.line_items.length} รายการ</div>
                      <div className="mt-1 font-medium text-gray-700">฿{formatCurrency(dn.line_items.reduce((sum, line) => sum + line.line_total, 0))}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">รายการที่จะออกบิล</h3>
              <p className="mt-1 text-xs text-gray-500">แสดงทุกรายการจากใบส่งของที่เลือกก่อนสร้างใบแจ้งหนี้</p>
            </div>
            <div className="rounded-full bg-[#F3F0E8] px-2.5 py-1 text-xs text-[#5F5A52]">
              {selectedDeliveryNotes.length} ใบส่งของ / {selectedLines.length} รายการ
            </div>
          </div>

          {selectedLines.length === 0 ? (
            <EmptyState title="ยังไม่มีรายการที่จะออกบิล" description="เลือกใบส่งของด้านบนเพื่อดูรายการทั้งหมดก่อนสร้างใบแจ้งหนี้" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#E8E6DF]">
              <div className="hidden bg-[#FAF8F3] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_90px_110px] sm:gap-3">
                <div>ใบส่งของ</div>
                <div>รายการ</div>
                <div className="text-right">จำนวน</div>
                <div className="text-right">ยอด</div>
              </div>
              <div className="divide-y divide-[#E8E6DF]">
                {selectedLines.map(({ doc, line }) => (
                  <div
                    key={`${doc.id}-${line.id}`}
                    className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_90px_110px] sm:items-center sm:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#1A1A18]">{doc.doc_number || "ไม่มีเลขเอกสาร"}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{formatBuddhistDate(doc.issue_date)}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="break-words text-[#1A1A18]">{line.item_name}</div>
                      {line.item_sku && <div className="mt-0.5 text-xs text-gray-500">SKU {line.item_sku}</div>}
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm sm:block sm:text-right">
                      <span className="text-xs text-gray-500 sm:hidden">จำนวน</span>
                      <span>
                        {line.quantity} {line.unit || ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 font-medium text-[#1A1A18] sm:block sm:text-right">
                      <span className="text-xs font-normal text-gray-500 sm:hidden">ยอด</span>
                      <span>฿{formatCurrency(line.line_total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-medium">สรุปใบแจ้งหนี้</h3>
          <div className="space-y-3">
            <Select label="ภาษีหัก ณ ที่จ่าย" value={whtRate} onChange={(event) => setWhtRate(event.target.value as WhtRate)}>
              {WHT_RATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input label="หมายเหตุ" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น รวมใบส่งของประจำเดือนนี้" />
            <div className="rounded-xl border border-[#E8E6DF] bg-[#FAF8F3] p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
                <FileStack className="h-3.5 w-3.5" />
                รวม {selectedDeliveryNotes.length} ใบส่งของ / {selectedLines.length} รายการ
              </div>
              <div className="space-y-1">
                <div className="flex justify-between"><span>รวมก่อนภาษี</span><span>฿{formatCurrency(tax.subtotal)}</span></div>
                {clientProfile?.vat_registered && <div className="flex justify-between"><span>VAT {clientProfile.vat_rate}%</span><span>฿{formatCurrency(tax.vatAmount)}</span></div>}
                <div className="flex justify-between font-medium"><span>รวมทั้งสิ้น</span><span>฿{formatCurrency(tax.total)}</span></div>
                {tax.whtAmount > 0 && <div className="flex justify-between text-red-600"><span>หัก ณ ที่จ่าย {whtRate}%</span><span>-฿{formatCurrency(tax.whtAmount)}</span></div>}
                <div className="flex justify-between border-t border-[#E1DDD3] pt-2 text-base font-semibold"><span>ยอดชำระสุทธิ</span><span>฿{formatCurrency(tax.netPayable)}</span></div>
              </div>
            </div>
            <Button className="w-full justify-center" disabled={!canSave || saving} loading={saving} onClick={handleSave}>
              สร้างใบแจ้งหนี้จากใบส่งของ
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
