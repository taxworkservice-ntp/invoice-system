import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth, useClientProfile } from "../../../hooks/useAuth";
import { useCustomers } from "../../../hooks/useCustomers";
import { useItems } from "../../../hooks/useItems";
import { useToast } from "../../../hooks/useToast";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Card } from "../../../components/ui/Card";
import { CatalogAutocomplete } from "../../../components/CatalogAutocomplete";
import { Spinner } from "../../../components/ui/Spinner";
import { supabase } from "../../../lib/supabase";
import { generateDocNumberBE } from "../../../lib/docNumber";
import { calculateLineAmounts, calculateTax } from "../../../lib/tax";
import { formatBuddhistDate } from "../../../lib/dates";
import { cartonsToBase, deductStockOnDocumentSent, formatMixedStock, round3 } from "../../../lib/stock";
import { DOC_TYPE_LABELS, WHT_RATE_OPTIONS, VAT_DEFAULT, PAYMENT_METHOD_LABELS } from "../../../constants";
import type { DocumentType, Customer, WhtRate, PaymentMethod, Item } from "../../../types";

interface LineItemForm {
  id: string;
  item_id: string | null;
  item_sku?: string | null;
  item_name: string;
  item_type: string;
  unit_price: number;
  quantity: number;
  discount_percent?: number;
  unit: string;
  base_unit: string;
  carton_unit: string | null;
  qty_per_carton: number | null;
  base_unit_price: number | null;
}

function createEmptyLine(): LineItemForm {
  return {
    id: crypto.randomUUID(),
    item_id: null,
    item_sku: null,
    item_name: "",
    item_type: "product",
    unit_price: 0,
    quantity: 1,
    discount_percent: 0,
    unit: "ชิ้น",
    base_unit: "ชิ้น",
    carton_unit: null,
    qty_per_carton: null,
    base_unit_price: null,
  };
}

interface UnpaidInvoice {
  id: string;
  doc_number: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  net_payable: number;
  issue_date: string;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function hasCartonOption(lineItem: LineItemForm) {
  return Boolean(lineItem.carton_unit && lineItem.qty_per_carton && lineItem.qty_per_carton > 0);
}

function isCartonUnitSelected(lineItem: LineItemForm) {
  return hasCartonOption(lineItem) && lineItem.unit === lineItem.carton_unit;
}

function getLineBaseQuantity(lineItem: LineItemForm) {
  if (isCartonUnitSelected(lineItem) && lineItem.qty_per_carton) {
    return cartonsToBase(lineItem.quantity, lineItem.qty_per_carton);
  }

  return round3(lineItem.quantity);
}

function getSuggestedUnitPrice(baseUnitPrice: number, unit: string, cartonUnit?: string | null, qtyPerCarton?: number | null) {
  if (cartonUnit && qtyPerCarton && qtyPerCarton > 0 && unit === cartonUnit) {
    return Math.round(baseUnitPrice * qtyPerCarton * 100) / 100;
  }

  return baseUnitPrice;
}

function applyCatalogItemToLine(lineItem: LineItemForm, catalogItem: Item): LineItemForm {
  const unit = catalogItem.base_unit;
  return {
    ...lineItem,
    item_name: catalogItem.name,
    item_id: catalogItem.id,
    item_sku: catalogItem.sku,
    item_type: catalogItem.item_type,
    unit,
    base_unit: catalogItem.base_unit,
    carton_unit: catalogItem.carton_unit,
    qty_per_carton: catalogItem.qty_per_carton,
    base_unit_price: catalogItem.unit_price,
    unit_price: getSuggestedUnitPrice(
      catalogItem.unit_price,
      unit,
      catalogItem.carton_unit,
      catalogItem.qty_per_carton,
    ),
  };
}

export default function NewDealPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const type = (searchParams.get("type") || "quotation") as DocumentType;
  const label = DOC_TYPE_LABELS[type]?.th || "เอกสารใหม่";
  const isBillingNote = type === "billing_note";
  const isTaxInvoiceReceipt = type === "tax_invoice_receipt";
  const isQuotationOrInvoice = type === "quotation" || type === "invoice" || isTaxInvoiceReceipt;

  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const { customers, addCustomer } = useCustomers(userId);
  const { items } = useItems(userId);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", tax_id: "", address: "" });
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [lineItems, setLineItems] = useState<LineItemForm[]>([createEmptyLine()]);
  const [showMore, setShowMore] = useState(false);
  const [vatRegistered, setVatRegistered] = useState(clientProfile?.vat_registered ?? false);
  const [vatRate, setVatRate] = useState<number>(clientProfile?.vat_rate ?? VAT_DEFAULT);
  const [whtRate, setWhtRate] = useState<WhtRate>(clientProfile?.default_wht_rate ?? "0");
  const [documentDiscountPercent, setDocumentDiscountPercent] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [issueDate, setIssueDate] = useState(todayString());
  const [paymentDate, setPaymentDate] = useState(todayString());
  const [showIssueDatePicker, setShowIssueDatePicker] = useState(false);
  const [showPaymentDatePicker, setShowPaymentDatePicker] = useState(false);

  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (clientProfile) {
      setVatRegistered(clientProfile.vat_registered);
      setVatRate(clientProfile.vat_rate);
      setWhtRate(clientProfile.default_wht_rate);
    }
  }, [clientProfile]);

  useEffect(() => {
    if (!isTaxInvoiceReceipt) return;
    setVatRegistered(true);
    if (clientProfile?.vat_rate) {
      setVatRate(clientProfile.vat_rate);
    }
  }, [clientProfile?.vat_rate, isTaxInvoiceReceipt]);

  useEffect(() => {
    if (isBillingNote && selectedCustomer && userId) {
      setLoadingInvoices(true);
      supabase
        .from("documents")
        .select("id, doc_number, subtotal, vat_amount, total_amount, net_payable, issue_date")
        .eq("user_id", userId)
        .eq("customer_id", selectedCustomer.id)
        .eq("doc_type", "invoice")
        .eq("status", "sent")
        .order("issue_date", { ascending: true })
        .then(({ data, error: fetchError }) => {
          if (!fetchError && data) {
            const invoices = data as unknown as UnpaidInvoice[];
            setUnpaidInvoices(invoices);
            setSelectedInvoiceIds(new Set(invoices.map((inv) => inv.id)));
          }
          setLoadingInvoices(false);
        });
    } else {
      setUnpaidInvoices([]);
      setSelectedInvoiceIds(new Set());
    }
  }, [isBillingNote, selectedCustomer, userId]);

  const toggleInvoice = (id: string) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.tax_id && c.tax_id.includes(q)));
  }, [customers, customerSearch]);

  const lineItemsWithTotals = useMemo(() => {
    return lineItems.map((lineItem) => ({
      ...lineItem,
      ...calculateLineAmounts(lineItem),
    }));
  }, [lineItems]);

  const billingNoteSummary = useMemo(() => {
    const selected = unpaidInvoices.filter((inv) => selectedInvoiceIds.has(inv.id));
    return {
      subtotal: selected.reduce((sum, inv) => sum + inv.subtotal, 0),
      vatAmount: selected.reduce((sum, inv) => sum + inv.vat_amount, 0),
      totalAmount: selected.reduce((sum, inv) => sum + inv.total_amount, 0),
    };
  }, [unpaidInvoices, selectedInvoiceIds]);

  const tax = useMemo(() => {
    if (isBillingNote) {
      const { subtotal, vatAmount, totalAmount } = billingNoteSummary;
      const whtPct = parseFloat(whtRate);
      const whtAmount = whtPct > 0 ? Math.round(subtotal * whtPct) / 100 : 0;
      return {
        grossSubtotal: Math.round(subtotal * 100) / 100,
        lineDiscountAmount: 0,
        subtotalBeforeDiscount: Math.round(subtotal * 100) / 100,
        discountAmount: 0,
        subtotal: Math.round(subtotal * 100) / 100,
        vatAmount: Math.round(vatAmount * 100) / 100,
        total: Math.round(totalAmount * 100) / 100,
        whtAmount: Math.round(whtAmount * 100) / 100,
        netPayable: Math.round((totalAmount - whtAmount) * 100) / 100,
      };
    }

    return calculateTax(
      lineItemsWithTotals.map((lineItem) => ({
        unit_price: lineItem.unit_price,
        quantity: lineItem.quantity,
        discount_percent: lineItem.discount_percent,
      })),
      vatRegistered,
      vatRate,
      parseFloat(whtRate),
      { discountPercent: documentDiscountPercent }
    );
  }, [lineItemsWithTotals, vatRegistered, vatRate, whtRate, isBillingNote, billingNoteSummary, documentDiscountPercent]);

  const updateLineItem = (id: string, field: keyof LineItemForm, value: string | number) => {
    setLineItems((prev) =>
      prev.map((lineItem) => {
        if (lineItem.id !== id) return lineItem;
        const updated = { ...lineItem, [field]: value } as LineItemForm;

        if (field === "item_name") {
          const name = (value as string).trim();
          const catalogItem = items.find(
            (c) => c.name.toLowerCase() === name.toLowerCase(),
          );
          if (catalogItem) {
            return applyCatalogItemToLine(updated, catalogItem);
          } else {
            updated.item_id = null;
            updated.item_sku = null;
            updated.item_type = "product";
            updated.base_unit = updated.unit || "ชิ้น";
            updated.carton_unit = null;
            updated.qty_per_carton = null;
            updated.base_unit_price = null;
          }
        }

        return updated;
      }),
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, createEmptyLine()]);
  };

  const removeLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((lineItem) => lineItem.id !== id));
  };

  const selectCatalogItem = (lineItemId: string, catalogItem: Item) => {
    setLineItems((prev) =>
      prev.map((lineItem) => {
        if (lineItem.id !== lineItemId) return lineItem;
        return applyCatalogItemToLine(lineItem, catalogItem);
      }),
    );
  };

  const updateLineUnit = (id: string, nextUnit: string) => {
    setLineItems((prev) =>
      prev.map((lineItem) => {
        if (lineItem.id !== id) return lineItem;
        return {
          ...lineItem,
          unit: nextUnit,
          unit_price: getSuggestedUnitPrice(
            lineItem.base_unit_price ?? lineItem.unit_price,
            nextUnit,
            lineItem.carton_unit,
            lineItem.qty_per_carton,
          ),
        };
      }),
    );
  };

  const handleAddNewCustomer = async () => {
    if (!newCustomer.name.trim()) return;
    setSavingCustomer(true);
    try {
      const customer = await addCustomer({
        name: newCustomer.name,
        tax_id: newCustomer.tax_id || null,
        address: newCustomer.address || null,
      });
      setSelectedCustomer(customer);
      setShowNewCustomerForm(false);
      setNewCustomer({ name: "", tax_id: "", address: "" });
      setCustomerSearch(customer.name);
      setShowCustomerDropdown(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCustomer || !userId) return;
    setError(null);

    if (isQuotationOrInvoice) {
      const validItems = lineItems.filter((lineItem) => lineItem.item_name.trim());
      if (validItems.length === 0) {
        setError("กรุณาเพิ่มอย่างน้อย 1 รายการ");
        return;
      }
    }

    if (isBillingNote && selectedInvoiceIds.size === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 ใบแจ้งหนี้");
      return;
    }

    if (isTaxInvoiceReceipt && !clientProfile?.vat_registered) {
      setError("เอกสารประเภทนี้ใช้ได้สำหรับกิจการที่จด VAT แล้วเท่านั้น");
      return;
    }

    setSaving(true);
    let createdDealId: string | null = null;
    try {
      let dealId: string | null = null;
      if (!isBillingNote) {
        const { data: deal, error: dealError } = await supabase
          .from("deals")
          .insert({
            user_id: userId,
            customer_id: selectedCustomer.id,
            title: null,
          })
          .select("*")
          .single();

        if (dealError) throw dealError;
        dealId = deal.id;
        createdDealId = deal.id;
      }

      const now = todayString();
      const documentIssueDate = isTaxInvoiceReceipt ? paymentDate : issueDate;
      const docNumber = await generateDocNumberBE(userId, type, documentIssueDate);

      const docPayload: Record<string, unknown> = {
        user_id: userId,
        deal_id: dealId,
        customer_id: selectedCustomer.id,
        doc_type: type,
        doc_number: docNumber,
        status: isTaxInvoiceReceipt ? "issued" : "draft",
        issue_date: documentIssueDate,
        vat_registered: isTaxInvoiceReceipt ? true : vatRegistered,
        vat_rate: vatRate,
        wht_rate: parseFloat(whtRate),
        discount_percent: documentDiscountPercent,
        discount_amount: tax.discountAmount,
        subtotal: tax.subtotal,
        vat_amount: tax.vatAmount,
        total_amount: tax.total,
        wht_amount: tax.whtAmount,
        net_payable: tax.netPayable,
        payment_method: isTaxInvoiceReceipt ? paymentMethod : null,
        paid_at: isTaxInvoiceReceipt ? new Date(`${paymentDate}T00:00:00`).toISOString() : null,
        amount_received: isTaxInvoiceReceipt ? tax.netPayable : null,
      };

      const { data: document, error: docError } = await supabase
        .from("documents")
        .insert(docPayload)
        .select("*")
        .single();

      if (docError) throw docError;

      if (isQuotationOrInvoice) {
        const validItems = lineItems.filter((lineItem) => lineItem.item_name.trim());
        if (validItems.length > 0) {
          const lineItemRecords = validItems.map((lineItem, idx) => {
            const lineCalc = calculateLineAmounts(lineItem);
            const baseQuantity = getLineBaseQuantity(lineItem);
            const soldByCarton = isCartonUnitSelected(lineItem);
            return {
              document_id: document.id,
              user_id: userId,
              item_id: lineItem.item_id,
              item_name: lineItem.item_name,
              item_sku: lineItem.item_sku || null,
              item_type: lineItem.item_type,
              unit: lineItem.unit,
              unit_price: lineItem.unit_price,
              quantity: lineItem.quantity,
              base_quantity: baseQuantity,
              discount_percent: lineItem.discount_percent || 0,
              discount_amount: lineCalc.discountAmount,
              qty_carton: soldByCarton ? lineItem.quantity : null,
              carton_unit: soldByCarton ? lineItem.carton_unit : null,
              line_total: lineCalc.lineTotal,
              sort_order: idx,
            };
          });
          const { error: itemsError } = await supabase.from("document_line_items").insert(lineItemRecords);
          if (itemsError) throw itemsError;
        }
      }

      if (isTaxInvoiceReceipt) {
        await deductStockOnDocumentSent(document.id, userId);
      }

      if (isBillingNote) {
        const selectedInvoices = unpaidInvoices.filter((inv) => selectedInvoiceIds.has(inv.id));
        if (selectedInvoices.length > 0) {
          const billingRecords = selectedInvoices.map((inv) => ({
            billing_note_id: document.id,
            invoice_id: inv.id,
            user_id: userId,
            invoice_number: inv.doc_number,
            issue_date: inv.issue_date || null,
            subtotal: inv.subtotal,
            vat_amount: inv.vat_amount,
            total_amount: inv.total_amount,
          }));
          const { error: bnError } = await supabase.from("billing_note_invoices").insert(billingRecords);
          if (bnError) throw bnError;
        }
      }

      if (dealId) {
        toast.success("บันทึกดีลสำเร็จ");
        navigate(`/deals/${dealId}`);
      } else {
        toast.success("สร้างเอกสารสำเร็จ");
        navigate("/home");
      }
    } catch (err: unknown) {
      if (createdDealId) {
        await supabase.from("deals").delete().eq("id", createdDealId);
      }
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  };

  const canSave = selectedCustomer && (isBillingNote ? selectedInvoiceIds.size > 0 : lineItems.some((lineItem) => lineItem.item_name.trim()));
  const isIssueDateToday = issueDate === todayString();
  const isPaymentDateToday = paymentDate === todayString();

  return (
    <AppShell title={label} showBack>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {(type === "invoice" || isTaxInvoiceReceipt) && clientProfile?.vat_registered && !clientProfile?.tax_id && (
        <div className="mb-4 p-3 bg-[#FAEEDA] border-[0.5px] border-[#E6C776] rounded-lg text-sm text-[#633806] flex items-center gap-3">
          <span>⚠</span>
          <div className="flex-1">
            <p className="font-medium">คุณเป็นผู้ประกอบการจดทะเบียน VAT แต่ยังไม่ได้ตั้งค่าเลขผู้เสียภาษี</p>
            <p className="text-[12px] mt-0.5">เลขผู้เสียภาษีจำเป็นสำหรับใบกำกับภาษี</p>
          </div>
          <button
            onClick={() => navigate("/settings/profile")}
            className="shrink-0 text-[12px] text-[#378ADD] hover:underline font-medium"
          >
            ตั้งค่าเลย →
          </button>
        </div>
      )}

      {isTaxInvoiceReceipt && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          เอกสารนี้จะออกเป็นใบกำกับภาษี/ใบเสร็จรับเงินทันที และถือว่ารับชำระแล้วในขั้นตอนเดียว
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <h3 className="text-sm font-medium mb-3">ลูกค้า</h3>
          {selectedCustomer ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{selectedCustomer.name}</p>
                {selectedCustomer.tax_id && (
                  <p className="text-xs text-gray-500">เลขผู้เสียภาษี: {selectedCustomer.tax_id}</p>
                )}
                {selectedCustomer.address && (
                  <p className="text-xs text-gray-500">{selectedCustomer.address}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedCustomer(null);
                  setCustomerSearch("");
                }}
              >
                เปลี่ยน
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="ค้นหาหรือเพิ่มลูกค้าใหม่..."
                value={customerSearch}
                onFocus={() => setShowCustomerDropdown(true)}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                }}
              />
              {showCustomerDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-card-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerSearch(customer.name);
                        setShowCustomerDropdown(false);
                      }}
                    >
                      <span className="font-medium">{customer.name}</span>
                      {customer.tax_id && (
                        <span className="text-gray-400 ml-2 text-xs">{customer.tax_id}</span>
                      )}
                    </button>
                  ))}
                  {customerSearch && !filteredCustomers.length && (
                    <button
                      className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-blue-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setNewCustomer((prev) => ({ ...prev, name: customerSearch }));
                        setShowNewCustomerForm(true);
                        setShowCustomerDropdown(false);
                      }}
                    >
                      + {`เพิ่ม "${customerSearch}" เป็นลูกค้าใหม่`}
                    </button>
                  )}
                </div>
              )}
                            {showNewCustomerForm && (
                <div className="mt-3 border-t pt-3 space-y-2">
                  <Input
                    label="�����١���"
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="���ͺ���ѷ���ͪ����١���"
                  />
                  <Input
                    label="�Ţ�����������"
                    value={newCustomer.tax_id}
                    onChange={(e) =>
                      setNewCustomer((prev) => ({ ...prev, tax_id: e.target.value }))
                    }
                    placeholder="�Ţ 13 ��ѡ"
                  />
                  <Input
                    label="�������"
                    value={newCustomer.address}
                    onChange={(e) =>
                      setNewCustomer((prev) => ({ ...prev, address: e.target.value }))
                    }
                    placeholder="�������"
                  />
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowNewCustomerForm(false)}>
                      ¡��ԡ
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddNewCustomer}
                      disabled={!newCustomer.name.trim() || savingCustomer}
                    >
                      {savingCustomer ? "���ѧ�ѹ�֡..." : "�ѹ�֡"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {!isBillingNote && (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-[#1A1A18]">
                  {isTaxInvoiceReceipt ? "วันที่เอกสารและรับชำระ" : "วันที่ออกเอกสาร"}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  ค่าเริ่มต้นเป็นวันนี้ และเปลี่ยนได้เมื่อต้องการออกย้อนหลัง
                </p>
              </div>
              {((isTaxInvoiceReceipt && !isPaymentDateToday) || (!isTaxInvoiceReceipt && !isIssueDateToday)) && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                  ย้อนหลัง
                </span>
              )}
            </div>

            {!isTaxInvoiceReceipt ? (
              <div className="mt-4 rounded-xl border border-[#E7E5DE] bg-[#FBFAF7] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-gray-500">วันที่ที่ใช้บนเอกสาร</div>
                    <div className="mt-1 text-sm font-semibold text-[#1A1A18]">{formatBuddhistDate(issueDate)}</div>
                  </div>
                  <div className="flex gap-2">
                    {!isIssueDateToday && (
                      <button
                        type="button"
                        onClick={() => {
                          setIssueDate(todayString());
                          setShowIssueDatePicker(false);
                        }}
                        className="rounded-lg border border-[#D7DEE7] px-3 py-2 text-xs font-medium text-[#475467] transition-colors hover:bg-white"
                      >
                        ใช้วันนี้
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowIssueDatePicker((prev) => !prev)}
                      className="rounded-lg border border-[#D7DEE7] bg-white px-3 py-2 text-xs font-medium text-[#1A1A18] transition-colors hover:bg-gray-50"
                    >
                      {showIssueDatePicker || !isIssueDateToday ? "เปลี่ยนวันที่" : "ออกย้อนหลัง"}
                    </button>
                  </div>
                </div>
                {(showIssueDatePicker || !isIssueDateToday) && (
                  <div className="mt-3 border-t border-[#ECE8DE] pt-3">
                    <Input
                      id="issueDate"
                      label="วันที่ออกเอกสาร"
                      type="date"
                      value={issueDate}
                      max={todayString()}
                      onChange={(e) => setIssueDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-[#E7E5DE] bg-[#FBFAF7] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-gray-500">วันที่รับชำระและวันที่บนเอกสาร</div>
                    <div className="mt-1 text-sm font-semibold text-[#1A1A18]">{formatBuddhistDate(paymentDate)}</div>
                  </div>
                  <div className="flex gap-2">
                    {!isPaymentDateToday && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentDate(todayString());
                          setShowPaymentDatePicker(false);
                        }}
                        className="rounded-lg border border-[#D7DEE7] px-3 py-2 text-xs font-medium text-[#475467] transition-colors hover:bg-white"
                      >
                        ใช้วันนี้
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPaymentDatePicker((prev) => !prev)}
                      className="rounded-lg border border-[#D7DEE7] bg-white px-3 py-2 text-xs font-medium text-[#1A1A18] transition-colors hover:bg-gray-50"
                    >
                      {showPaymentDatePicker || !isPaymentDateToday ? "เปลี่ยนวันที่" : "ออกย้อนหลัง"}
                    </button>
                  </div>
                </div>
                {(showPaymentDatePicker || !isPaymentDateToday) && (
                  <div className="mt-3 border-t border-[#ECE8DE] pt-3">
                    <Input
                      id="paymentDateSummary"
                      label="วันที่รับชำระ"
                      type="date"
                      value={paymentDate}
                      max={todayString()}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {isQuotationOrInvoice && (
          <Card>
            <h3 className="text-sm font-medium mb-3">รายการ</h3>
            <div className="space-y-2">
              {lineItems.map((item) => {
                const matchedItem = item.item_id ? items.find((catalogItem) => catalogItem.id === item.item_id) : null;
                const soldByCarton = isCartonUnitSelected(item);
                const baseQuantity = getLineBaseQuantity(item);

                return (
                <div key={item.id} className="pb-3 border-b border-gray-100 last:border-0">
                  <div className="flex gap-1 mb-2">
                    <CatalogAutocomplete
                      items={items}
                      value={item.item_name}
                      onChange={(val) => updateLineItem(item.id, "item_name", val)}
                      onSelect={(catalogItem) => selectCatalogItem(item.id, catalogItem)}
                      matched={!!item.item_id}
                      placeholder="ชื่อรายการ"
                    />
                  </div>
                  <div className="flex gap-1 items-start">
                    <label className="w-[100px] block">
                      <span className="text-[10px] text-gray-400 block mb-0.5">ราคา</span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={item.unit_price || ""}
                        onChange={(e) =>
                          updateLineItem(item.id, "unit_price", parseFloat(e.target.value) || 0)
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="w-[64px] block">
                      <span className="text-[10px] text-gray-400 block mb-0.5">จำนวน</span>
                      <Input
                        type="number"
                        placeholder="1"
                        min="0"
                        value={item.quantity || ""}
                        onChange={(e) =>
                          updateLineItem(item.id, "quantity", parseFloat(e.target.value) || 0)
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="w-[68px] block">
                      <span className="text-[10px] text-gray-400 block mb-0.5">ส่วนลด</span>
                      <Input
                        type="number"
                        placeholder="0"
                        min="0"
                        max="100"
                        value={item.discount_percent || ""}
                        onChange={(e) =>
                          updateLineItem(item.id, "discount_percent", parseFloat(e.target.value) || 0)
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="w-[72px] block">
                      <span className="text-[10px] text-gray-400 block mb-0.5">หน่วย</span>
                      <Input
                        placeholder="ชิ้น"
                        value={item.unit}
                        onChange={(e) => updateLineItem(item.id, "unit", e.target.value)}
                        className="w-full"
                      />
                    </label>
                    <div className="flex-1 text-right text-xs font-medium text-gray-700 min-w-[70px] pt-[22px]">
                      ฿{calculateLineAmounts(item).lineTotal.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                    {lineItems.length > 1 && (
                      <button
                        className="text-gray-400 hover:text-red-500 px-1 text-sm pt-[22px]"
                        onClick={() => removeLineItem(item.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {hasCartonOption(item) && (
                    <div className="mt-2 rounded-lg border border-[#ECE8DE] bg-[#FBFAF7] px-3 py-2 text-xs text-gray-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateLineUnit(item.id, item.base_unit)}
                          className={`rounded-full px-2.5 py-1 transition-colors ${
                            !soldByCarton ? "bg-[#1A1A18] text-white" : "bg-white text-gray-600 border border-[#D7DEE7]"
                          }`}
                        >
                          ขายเป็น {item.base_unit}
                        </button>
                        <button
                          type="button"
                          onClick={() => item.carton_unit && updateLineUnit(item.id, item.carton_unit)}
                          className={`rounded-full px-2.5 py-1 transition-colors ${
                            soldByCarton ? "bg-[#1A1A18] text-white" : "bg-white text-gray-600 border border-[#D7DEE7]"
                          }`}
                        >
                          ขายเป็น {item.carton_unit}
                        </button>
                      </div>
                      <div className="mt-2">1 {item.carton_unit} = {item.qty_per_carton} {item.base_unit}</div>
                      <div className="mt-1">
                        ตัดสต็อกเป็น {baseQuantity.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {item.base_unit}
                        {soldByCarton ? ` จาก ${item.quantity.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${item.carton_unit}` : ""}
                      </div>
                      {matchedItem && (
                        <div className="mt-1 text-gray-500">
                          คงเหลือ {formatMixedStock(
                            matchedItem.stock_count,
                            matchedItem.base_unit,
                            matchedItem.carton_unit,
                            matchedItem.qty_per_carton,
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
              <Button variant="secondary" size="sm" onClick={addLineItem}>
                + เพิ่มรายการ
              </Button>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200 text-right text-sm space-y-0.5">
              {tax.lineDiscountAmount > 0 && (
                <>
                  <p className="text-gray-500">
                    ยอดก่อนส่วนลด: ฿{tax.grossSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-red-500">
                    ส่วนลดรายรายการ: -฿{tax.lineDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </>
              )}
              <div className="flex items-center justify-end gap-2">
                <span className="text-gray-500">ส่วนลดท้ายบิล (%)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={documentDiscountPercent || ""}
                  onChange={(e) => setDocumentDiscountPercent(parseFloat(e.target.value) || 0)}
                  className="w-[92px] text-right"
                />
              </div>
              {tax.discountAmount > 0 && (
                <p className="text-red-500">
                  ส่วนลดท้ายบิล: -฿{tax.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="text-gray-500">
                ราคารวม: ฿{tax.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              {vatRegistered && (
                <p className="text-gray-500">
                  VAT {vatRate}%: ฿{tax.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="font-medium">
                รวมทั้งสิ้น: ฿{tax.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              {parseFloat(whtRate) > 0 && (
                <p className="text-red-500">
                  หัก ณ ที่จ่าย {whtRate}%: -฿{tax.whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="font-semibold text-base mt-1">
                ยอดที่ต้องชำระ: ฿{tax.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
              {false && (
            <div className="mt-4 pt-3 border-t border-gray-200 text-right text-sm space-y-0.5">
              {tax.lineDiscountAmount > 0 && (
                <>
                  <p className="text-gray-500">
                    เธขเธญเธ”เธเนเธญเธเธชเนเธงเธเธฅเธ”: เธฟ{tax.grossSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-red-500">
                    เธชเนเธงเธเธฅเธ”เธฃเธฒเธขเธเธฒเธฃ: -เธฟ{tax.lineDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </>
              )}
              <div className="flex items-center justify-end gap-2">
                <span className="text-gray-500">เธชเนเธงเธเธฅเธ”เธ—เนเธฒเธขเธเธดเธฅ (%)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={documentDiscountPercent || ""}
                  onChange={(e) => setDocumentDiscountPercent(parseFloat(e.target.value) || 0)}
                  className="w-[92px] text-right"
                />
              </div>
              {tax.discountAmount > 0 && (
                <p className="text-red-500">
                  เธชเนเธงเธเธฅเธ”เธ—เนเธฒเธขเธเธดเธฅ: -เธฟ{tax.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="text-gray-500">
                ราคารวม: ฿{tax.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              {vatRegistered && (
                <p className="text-gray-500">
                  VAT {vatRate}%: ฿{tax.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="font-medium">
                รวมทั้งสิ้น: ฿{tax.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              {parseFloat(whtRate) > 0 && (
                <p className="text-red-500">
                  หัก ณ ที่จ่าย {whtRate}%: -฿{tax.whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="font-semibold text-base mt-1">
                ยอดที่ต้องชำระ: ฿{tax.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
              )}
          </Card>
        )}

        {isBillingNote && (
          <Card>
            <h3 className="text-sm font-medium mb-3">ใบแจ้งหนี้ที่ยังไม่ได้ชำระ</h3>
            {!selectedCustomer ? (
              <p className="text-sm text-gray-400">กรุณาเลือกลูกค้าก่อน</p>
            ) : loadingInvoices ? (
              <Spinner />
            ) : unpaidInvoices.length === 0 ? (
              <p className="text-sm text-gray-400">
                ไม่พบใบแจ้งหนี้ที่ยังไม่ได้ชำระสำหรับลูกค้านี้
              </p>
            ) : (
              <div className="space-y-2">
                {unpaidInvoices.map((invoice) => (
                  <label
                    key={invoice.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedInvoiceIds.has(invoice.id)}
                      onChange={() => toggleInvoice(invoice.id)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{invoice.doc_number}</p>
                      <p className="text-xs text-gray-500">{formatBuddhistDate(invoice.issue_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        ฿{invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {selectedInvoiceIds.size > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200 text-right text-sm space-y-0.5">
                <p className="text-gray-500">
                  ราคารวม: ฿{billingNoteSummary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="text-gray-500">
                  VAT: ฿{billingNoteSummary.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="font-medium">
                  รวมทั้งสิ้น: ฿{tax.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                {parseFloat(whtRate) > 0 && (
                  <>
                    <p className="text-red-500">
                      หัก ณ ที่จ่าย {whtRate}%: -฿{tax.whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="font-semibold text-base mt-1">
                      ยอดที่ต้องชำระ: ฿{tax.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </>
                )}
              </div>
            )}
          </Card>
        )}

        {isTaxInvoiceReceipt && (
          <Card>
            <h3 className="text-sm font-medium mb-3">ข้อมูลการรับชำระ</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  วิธีชำระเงิน
                </label>
                <select
                  className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white focus:outline-none focus:border-primary"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg bg-stone-50 px-3 py-3 text-sm text-stone-700">
                <div className="flex items-center justify-between">
                  <span>ยอดที่จะบันทึกรับชำระ</span>
                  <span className="font-semibold">
                    ฿{tax.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <button
            className="w-full flex items-center justify-between text-sm font-medium"
            onClick={() => setShowMore(!showMore)}
          >
            <span>รายละเอียดเพิ่มเติม</span>
            <span className="text-gray-400">{showMore ? "▾" : "▸"}</span>
          </button>
          {showMore && (
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={vatRegistered}
                  disabled={isTaxInvoiceReceipt}
                  onChange={(e) => setVatRegistered(e.target.checked)}
                  className="rounded"
                />
                จดทะเบียน VAT
              </label>
              {isTaxInvoiceReceipt && (
                <p className="text-xs text-gray-500">
                  เอกสารประเภทนี้ใช้ VAT เสมอ เพราะเป็นใบกำกับภาษี/ใบเสร็จรับเงิน
                </p>
              )}
              {vatRegistered && (
                <Input
                  label="อัตรา VAT (%)"
                  type="number"
                  step="0.01"
                  value={vatRate}
                  onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                />
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  หัก ณ ที่จ่าย
                </label>
                <select
                  className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white focus:outline-none focus:border-primary"
                  value={whtRate}
                  onChange={(e) => setWhtRate(e.target.value as WhtRate)}
                >
                  {WHT_RATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </Card>

        <Button className="w-full" disabled={!canSave || saving} onClick={handleSave}>
          {saving ? "กำลังบันทึก..." : isTaxInvoiceReceipt ? "บันทึกและออกเอกสาร" : "บันทึก"}
        </Button>
      </div>
    </AppShell>
  );
}



