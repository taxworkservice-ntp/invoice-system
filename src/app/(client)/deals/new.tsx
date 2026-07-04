import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useClientProfile, useWorkspaceRole } from "../../../hooks/useAuth";
import { useCustomers } from "../../../hooks/useCustomers";
import { useItems } from "../../../hooks/useItems";
import { useClientFeatures } from "../../../hooks/useClientFeatures";
import { useToast } from "../../../hooks/useToast";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Card } from "../../../components/ui/Card";
import { CatalogAutocomplete } from "../../../components/CatalogAutocomplete";
import { CustomerPickerModal } from "../../../components/customers/CustomerPickerModal";
import { Spinner } from "../../../components/ui/Spinner";
import { supabase } from "../../../lib/supabase";
import { generateDocNumberBE } from "../../../lib/docNumber";
import { calculateLineAmounts, calculateTax } from "../../../lib/tax";
import { formatBuddhistDate } from "../../../lib/dates";
import { cartonsToBase, deductStockOnDocumentSent, formatMixedStock, restoreStockOnVoid, round3 } from "../../../lib/stock";
import { DEFAULT_JOB_DETAIL_FIELDS, getJobDetailFieldLabel, normalizeJobDetailFields, type JobDetailFieldConfig } from "../../../lib/jobDetails";
import { getWorkspacePermissions } from "../../../lib/permissions";
import { DOC_TYPE_LABELS, WHT_RATE_OPTIONS, VAT_DEFAULT, PAYMENT_METHOD_LABELS } from "../../../constants";
import { AlertTriangle, ChevronDown, Copy, X, SlidersHorizontal } from "lucide-react";
import { EditableDocNumber } from "../../../components/documents/EditableDocNumber";
import type { Document, DocumentLineItem, DocumentType, Customer, WhtRate, PaymentMethod, Item, ItemJobDetailField, ItemJobDetailPreset, JobDetailPresetField } from "../../../types";

interface LineItemForm {
  id: string;
  item_id: string | null;
  item_sku?: string | null;
  item_name: string;
  line_note: string;
  item_type: string;
  unit_price: number;
  quantity: number;
  discount_percent?: number;
  unit: string;
  base_unit: string;
  carton_unit: string | null;
  qty_per_carton: number | null;
  base_unit_price: number | null;
  job_details_open: boolean;
  job_color: string;
  job_width: string;
  job_height: string;
  job_position: string;
  job_material: string;
  job_remark: string;
  job_detail_values: Record<string, string>;
}

type JobDetailSuggestions = Record<string, string[]>;

interface JobDetailPresetInputProps {
  label: string;
  value: string;
  placeholder: string;
  presets: string[];
  onChange: (value: string) => void;
  onDeletePreset: (value: string) => void;
}

function JobDetailPresetInput({
  label,
  value,
  placeholder,
  presets,
  onChange,
  onDeletePreset,
}: JobDetailPresetInputProps) {
  const [open, setOpen] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const filteredPresets = presets.filter((preset) =>
    normalizedValue ? preset.toLowerCase().includes(normalizedValue) : true,
  );
  const showPanel = open && filteredPresets.length > 0;

  return (
    <label className="relative block">
      <span className="mb-1 block text-[10px] text-gray-400">{label}</span>
      <div className="relative">
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showPanel}
          className="w-full rounded-lg border border-[#E8E6DF] bg-white py-2 pl-3 pr-8 text-xs text-[#1A1A18] placeholder:text-gray-400 focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20"
        />
        {presets.length > 0 && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpen((current) => !current)}
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-gray-400 transition-colors hover:bg-[#F1F5F9] hover:text-[#1A1A18]"
            aria-label={`แสดงตัวเลือก${label}`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[#D7DEE7] bg-white shadow-lg">
          <div className="max-h-44 overflow-y-auto py-1">
            {filteredPresets.map((preset) => {
              const selected = preset === value;
              return (
                <div
                  key={preset}
                  className={`group flex items-center justify-between gap-2 px-2 py-1.5 text-xs ${
                    selected
                      ? "bg-[#EAF4FF] text-[#0C447C]"
                      : "bg-white text-[#1A1A18] hover:bg-[#F8FAFC]"
                  }`}
                >
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(preset);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {preset}
                  </button>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onDeletePreset(preset)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    aria-label={`ลบ ${preset}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </label>
  );
}

function createEmptyLine(): LineItemForm {
  return {
    id: crypto.randomUUID(),
    item_id: null,
    item_sku: null,
    item_name: "",
    line_note: "",
    item_type: "product",
    unit_price: 0,
    quantity: 1,
    discount_percent: 0,
    unit: "ชิ้น",
    base_unit: "ชิ้น",
    carton_unit: null,
    qty_per_carton: null,
    base_unit_price: null,
    job_details_open: false,
    job_color: "",
    job_width: "",
    job_height: "",
    job_position: "",
    job_material: "",
    job_remark: "",
    job_detail_values: {},
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

function monthStartString() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function parseAmount(value: string) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getUtilityDisplayNote(note: string) {
  return note
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "[USAGE_BILL]")
    .join("\n")
    .trim();
}

function addDaysString(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function getUsageBillDetail(note: string) {
  const currentReading = note.match(/เลขปัจจุบัน:\s*([\d,.]+)/)?.[1]?.replace(/,/g, "") || "";
  const periodMatch = note.match(/รอบบิล:\s*([0-9-]+)\s*-\s*([0-9-]+)/);
  const usageMatch = note.match(/ใช้ไป:\s*[\d,.]+\s*(.+)$/m);
  return {
    currentReading,
    periodStart: periodMatch?.[1] || "",
    periodEnd: periodMatch?.[2] || "",
    unit: usageMatch?.[1]?.trim() || "",
  };
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

function applyCatalogItemToLine(lineItem: LineItemForm, catalogItem: Item, jobDetailsFeatureEnabled: boolean): LineItemForm {
  const unit = catalogItem.base_unit;
  const hasJobDetails = jobDetailsFeatureEnabled && catalogItem.item_type === "service" && catalogItem.has_job_details;
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
    job_details_open: hasJobDetails ? lineItem.job_details_open : false,
    job_color: hasJobDetails ? lineItem.job_color : "",
    job_width: hasJobDetails ? lineItem.job_width : "",
    job_height: hasJobDetails ? lineItem.job_height : "",
    job_position: hasJobDetails ? lineItem.job_position : "",
    job_material: hasJobDetails ? lineItem.job_material : "",
    job_remark: hasJobDetails ? lineItem.job_remark : "",
    job_detail_values: hasJobDetails ? lineItem.job_detail_values : {},
    line_note: hasJobDetails ? lineItem.line_note : "",
    unit_price: getSuggestedUnitPrice(
      catalogItem.unit_price,
      unit,
      catalogItem.carton_unit,
      catalogItem.qty_per_carton,
    ),
  };
}

function getJobDetailValue(lineItem: LineItemForm, fieldKey: string) {
  if (lineItem.job_detail_values[fieldKey] !== undefined) return lineItem.job_detail_values[fieldKey];
  if (fieldKey === "color") return lineItem.job_color;
  if (fieldKey === "position") return lineItem.job_position;
  if (fieldKey === "material") return lineItem.job_material;
  if (fieldKey === "remark") return lineItem.job_remark;
  return "";
}

function getJobDetailDimension(lineItem: LineItemForm, fieldKey: string) {
  if (fieldKey === "size") {
    return {
      width: lineItem.job_detail_values.size_width ?? lineItem.job_width,
      height: lineItem.job_detail_values.size_height ?? lineItem.job_height,
    };
  }
  return {
    width: lineItem.job_detail_values[`${fieldKey}_width`] || "",
    height: lineItem.job_detail_values[`${fieldKey}_height`] || "",
  };
}

function buildJobDetailsNote(lineItem: LineItemForm, fields = DEFAULT_JOB_DETAIL_FIELDS) {
  return fields
    .filter((field) => field.is_enabled)
    .map((field) => {
      if (field.field_type === "dimension") {
        const { width, height } = getJobDetailDimension(lineItem, field.field_key);
        const size = [width.trim(), height.trim()].filter(Boolean).join(" x ");
        return size ? `${field.label}: ${size} มม.` : "";
      }
      const value = getJobDetailValue(lineItem, field.field_key).trim();
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function getJobDetailsSummary(lineItem: LineItemForm, fields = DEFAULT_JOB_DETAIL_FIELDS) {
  return fields
    .filter((field) => field.is_enabled)
    .map((field) => {
      if (field.field_type === "dimension") {
        const { width, height } = getJobDetailDimension(lineItem, field.field_key);
        const size = [width.trim(), height.trim()].filter(Boolean).join("x");
        return size ? `${size} mm` : "";
      }
      return getJobDetailValue(lineItem, field.field_key).trim();
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
}

interface NewDealPageProps {
  documentId?: string;
  initialType?: DocumentType;
}

export default function NewDealPage({ documentId, initialType }: NewDealPageProps = {}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedType = initialType || searchParams.get("type") || "quotation";
  const isUtilityBill = requestedType === "utility_bill";
  const type = (isUtilityBill ? "invoice" : requestedType) as DocumentType;
  const isEditingDraft = Boolean(documentId);
  const label = isEditingDraft && type === "invoice"
    ? "แก้ไขร่างใบแจ้งหนี้"
    : isUtilityBill ? "ออกบิลประจำรอบ" : DOC_TYPE_LABELS[type]?.th || "เอกสารใหม่";
  const isBillingNote = type === "billing_note";
  const isTaxInvoiceReceipt = type === "tax_invoice_receipt";
  const isDeliveryNote = type === "delivery_note";
  const isLineItemDocument = type === "quotation" || type === "invoice" || isTaxInvoiceReceipt || isDeliveryNote;

  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const { hasFeature } = useClientFeatures(userId);
  const { customers, loading: customersLoading, addCustomer } = useCustomers(userId);
  const { items, addItem } = useItems(userId);
  const jobDetailsFeatureEnabled = hasFeature("service_job_details");

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const [lineItems, setLineItems] = useState<LineItemForm[]>([createEmptyLine()]);
  const [serviceJobDetailFields, setServiceJobDetailFields] = useState<Record<string, JobDetailFieldConfig[]>>({});
  const [serviceJobDetailPresets, setServiceJobDetailPresets] = useState<Record<string, JobDetailSuggestions>>({});
  const [vatRegistered, setVatRegistered] = useState(clientProfile?.vat_registered ?? false);
  const [vatRate, setVatRate] = useState<number>(clientProfile?.vat_rate ?? VAT_DEFAULT);
  const [whtRate, setWhtRate] = useState<WhtRate>(clientProfile?.default_wht_rate ?? "0");
  const [documentDiscountPercent, setDocumentDiscountPercent] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [issueDate, setIssueDate] = useState(todayString());
  const [paymentDate, setPaymentDate] = useState(todayString());
  const [showIssueDatePicker, setShowIssueDatePicker] = useState(false);
  const [showPaymentDatePicker, setShowPaymentDatePicker] = useState(false);
  const [note, setNote] = useState("");
  const [utilityServiceItemId, setUtilityServiceItemId] = useState<string | null>(null);
  const [utilityServiceName, setUtilityServiceName] = useState("");
  const [utilityUnit, setUtilityUnit] = useState("หน่วย");
  const [utilityPeriodStart, setUtilityPeriodStart] = useState(monthStartString());
  const [utilityPeriodEnd, setUtilityPeriodEnd] = useState(todayString());
  const [utilityPreviousReading, setUtilityPreviousReading] = useState("");
  const [utilityCurrentReading, setUtilityCurrentReading] = useState("");
  const [utilityRate, setUtilityRate] = useState("");
  const [utilityLastHint, setUtilityLastHint] = useState<string | null>(null);
  const [loadingUtilityLast, setLoadingUtilityLast] = useState(false);
  const [hideAmountsOnPrint, setHideAmountsOnPrint] = useState(true);

  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [saving, setSaving] = useState(false);
  const [editLoading, setEditLoading] = useState(Boolean(documentId));
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const serviceItems = useMemo(() => items.filter((item) => item.item_type === "service"), [items]);
  const jobDetailServiceItems = useMemo(
    () => jobDetailsFeatureEnabled ? serviceItems.filter((item) => item.has_job_details) : [],
    [jobDetailsFeatureEnabled, serviceItems],
  );
  const selectedUtilityService = useMemo(
    () => serviceItems.find((item) => item.id === utilityServiceItemId) || null,
    [serviceItems, utilityServiceItemId],
  );

  useEffect(() => {
    if (clientProfile) {
      setVatRegistered(clientProfile.vat_registered);
      setVatRate(clientProfile.vat_rate);
      setWhtRate(clientProfile.default_wht_rate);
    }
  }, [clientProfile]);

  useEffect(() => {
    if (!documentId || !userId) return;

    let cancelled = false;

    async function loadDraftInvoice() {
      setEditLoading(true);
      setError(null);
      try {
        const [{ data: documentData, error: documentError }, { data: lineData, error: lineError }] = await Promise.all([
          supabase
            .from("documents")
            .select("*, customer:customer_id(*)")
            .eq("id", documentId)
            .eq("user_id", userId)
            .single(),
          supabase
            .from("document_line_items")
            .select("*")
            .eq("document_id", documentId)
            .order("sort_order", { ascending: true }),
        ]);

        if (documentError || !documentData) throw documentError || new Error("ไม่พบเอกสาร");
        if (lineError) throw lineError;

        const draftDoc = documentData as Document & { customer?: Customer };
        if (draftDoc.doc_type !== "invoice" || draftDoc.status !== "draft") {
          throw new Error("แก้ไขได้เฉพาะร่างใบแจ้งหนี้");
        }

        if (cancelled) return;
        setSelectedCustomer(draftDoc.customer || null);
        setEditingDealId(draftDoc.deal_id);
        setIssueDate(draftDoc.issue_date || todayString());
        setVatRegistered(draftDoc.vat_registered);
        setVatRate(draftDoc.vat_rate);
        setWhtRate(String(draftDoc.wht_rate) as WhtRate);
        setDocumentDiscountPercent(draftDoc.discount_percent || 0);
        setNote(draftDoc.note || "");
        setDocNumberOverride(draftDoc.doc_number || "");
        setLineItems(((lineData || []) as DocumentLineItem[]).map((line) => ({
          id: line.id || crypto.randomUUID(),
          item_id: line.item_id,
          item_sku: line.item_sku,
          item_name: line.item_name,
          line_note: line.line_note || "",
          item_type: line.item_type,
          unit_price: line.unit_price,
          quantity: line.quantity,
          discount_percent: line.discount_percent || 0,
          unit: line.unit,
          base_unit: line.unit,
          carton_unit: line.carton_unit,
          qty_per_carton: line.qty_carton && line.quantity ? line.base_quantity ? line.base_quantity / line.quantity : null : null,
          base_unit_price: null,
          job_details_open: false,
          job_color: "",
          job_width: "",
          job_height: "",
          job_position: "",
          job_material: "",
          job_remark: "",
          job_detail_values: {},
        })));
      } catch (err: any) {
        if (!cancelled) setError(err.message || "โหลดร่างใบแจ้งหนี้ไม่สำเร็จ");
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    }

    void loadDraftInvoice();
    return () => {
      cancelled = true;
    };
  }, [documentId, userId]);

  useEffect(() => {
    const customerId = searchParams.get("customer_id");
    if (!customerId || customersLoading || selectedCustomer) return;
    const match = customers.find((c) => c.id === customerId);
    if (match) {
      setSelectedCustomer(match);
    }
  }, [searchParams, customers, customersLoading, selectedCustomer]);

  useEffect(() => {
    if (!isTaxInvoiceReceipt) return;
    setVatRegistered(clientProfile?.vat_registered ?? false);
    if (clientProfile?.vat_rate) {
      setVatRate(clientProfile.vat_rate);
    }
  }, [clientProfile?.vat_rate, clientProfile?.vat_registered, isTaxInvoiceReceipt]);

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

  useEffect(() => {
    const itemIds = jobDetailServiceItems.map((item) => item.id);
    if (!userId || itemIds.length === 0) {
      setServiceJobDetailFields({});
      setServiceJobDetailPresets({});
      return;
    }

    let cancelled = false;
    async function loadServiceJobDetailSetup() {
      const [{ data: fieldData }, { data: presetData }] = await Promise.all([
        supabase
          .from("item_job_detail_fields")
          .select("*")
          .eq("user_id", userId)
          .in("item_id", itemIds)
          .order("sort_order", { ascending: true }),
        supabase
          .from("item_job_detail_presets")
          .select("*")
          .eq("user_id", userId)
          .in("item_id", itemIds)
          .order("sort_order", { ascending: true }),
      ]);

      if (cancelled) return;
      const fieldsByItem: Record<string, JobDetailFieldConfig[]> = {};
      const rawFieldsByItem: Record<string, ItemJobDetailField[]> = {};
      itemIds.forEach((itemId) => {
        rawFieldsByItem[itemId] = [];
      });
      ((fieldData || []) as ItemJobDetailField[]).forEach((field) => {
        if (!rawFieldsByItem[field.item_id]) rawFieldsByItem[field.item_id] = [];
        rawFieldsByItem[field.item_id].push(field);
      });
      itemIds.forEach((itemId) => {
        fieldsByItem[itemId] = normalizeJobDetailFields(rawFieldsByItem[itemId]).filter((field) => field.is_enabled);
      });

      const presetsByItem: Record<string, JobDetailSuggestions> = {};
      itemIds.forEach((itemId) => {
        presetsByItem[itemId] = {};
      });
      ((presetData || []) as ItemJobDetailPreset[]).forEach((preset) => {
        if (!presetsByItem[preset.item_id]) presetsByItem[preset.item_id] = {};
        if (!presetsByItem[preset.item_id][preset.field_key]) presetsByItem[preset.item_id][preset.field_key] = [];
        presetsByItem[preset.item_id][preset.field_key].push(preset.value);
      });

      setServiceJobDetailFields(fieldsByItem);
      setServiceJobDetailPresets(presetsByItem);
    }

    void loadServiceJobDetailSetup();
    return () => {
      cancelled = true;
    };
  }, [jobDetailServiceItems, userId]);

  async function removeServiceJobDetailPreset(itemId: string, fieldKey: JobDetailPresetField, value: string) {
    if (!userId) return;
    const label = getJobDetailFieldLabel(serviceJobDetailFields[itemId] || DEFAULT_JOB_DETAIL_FIELDS, fieldKey);
    const confirmed = window.confirm(`ลบ "${value}" ออกจากตัวเลือก${label}ของบริการนี้?`);
    if (!confirmed) return;

    const { error: deleteError } = await supabase
      .from("item_job_detail_presets")
      .delete()
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .eq("field_key", fieldKey)
      .eq("value", value);

    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }

    setServiceJobDetailPresets((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [fieldKey]: (prev[itemId]?.[fieldKey] || []).filter((presetValue) => presetValue !== value),
      },
    }));
    toast.success("ลบตัวเลือกแล้ว");
  }

  useEffect(() => {
    if (!isUtilityBill || !selectedCustomer || !userId) {
      setUtilityLastHint(null);
      return;
    }
    const service = utilityServiceName.trim().toLowerCase();
    if (!utilityServiceItemId && !service) {
      setUtilityLastHint("เลือกค่าบริการเพื่อดึงเลขรอบก่อนของลูกค้ารายนี้");
      return;
    }

    let cancelled = false;
    const customerId = selectedCustomer.id;
    async function loadLastUsageBill() {
      setLoadingUtilityLast(true);
      try {
        const { data: docs, error: docsError } = await supabase
          .from("documents")
          .select("id, doc_number, issue_date")
          .eq("user_id", userId)
          .eq("customer_id", customerId)
          .eq("doc_type", "invoice")
          .neq("status", "voided")
          .order("issue_date", { ascending: false })
          .limit(12);

        if (cancelled) return;
        if (docsError || !docs?.length) {
          setUtilityLastHint("ยังไม่พบประวัติรอบก่อนของลูกค้ารายนี้");
          return;
        }

        const docIds = docs.map((doc) => doc.id);
        const { data: lines, error: linesError } = await supabase
          .from("document_line_items")
          .select("document_id, item_id, item_name, line_note, unit, unit_price")
          .in("document_id", docIds)
          .order("created_at", { ascending: false });

        if (cancelled) return;
        if (linesError || !lines?.length) {
          setUtilityLastHint("ยังไม่พบรายการบิลประจำรอบก่อนหน้า");
          return;
        }

        const matchedLine = lines.find((line) => {
          const note = String(line.line_note || "");
          const itemName = String(line.item_name || "").trim().toLowerCase();
          const itemId = String(line.item_id || "");
          const sameCatalogService = utilityServiceItemId ? itemId === utilityServiceItemId : false;
          const sameNamedService = !utilityServiceItemId && itemName === service;
          return note.includes("[USAGE_BILL]") && (sameCatalogService || sameNamedService);
        });

        if (!matchedLine) {
          setUtilityLastHint("ยังไม่พบรายการบิลประจำรอบก่อนหน้าของบริการนี้");
          return;
        }

        const note = String(matchedLine.line_note || "");
        const detail = getUsageBillDetail(note);
        if (detail.currentReading) {
          setUtilityPreviousReading(detail.currentReading);
        }
        if (matchedLine.unit_price != null) {
          setUtilityRate(String(matchedLine.unit_price));
        }
        const rememberedUnit = String(matchedLine.unit || detail.unit || "").trim();
        if (rememberedUnit) {
          setUtilityUnit(rememberedUnit);
        }
        if (detail.periodEnd) {
          const nextStart = addDaysString(detail.periodEnd, 1);
          if (nextStart) {
            setUtilityPeriodStart(nextStart);
            if (detail.periodStart) {
              const spanDays = daysBetween(detail.periodStart, detail.periodEnd);
              if (spanDays > 0) {
                const nextEnd = addDaysString(nextStart, spanDays);
                if (nextEnd) setUtilityPeriodEnd(nextEnd);
              }
            }
          }
        }

        const sourceDoc = docs.find((doc) => doc.id === matchedLine.document_id);
        setUtilityLastHint(
          detail.currentReading
            ? `ดึงเลขครั้งก่อน ${detail.currentReading} จาก ${sourceDoc?.doc_number || "บิลก่อนหน้า"}`
            : `พบประวัติจาก ${sourceDoc?.doc_number || "บิลก่อนหน้า"} แต่ไม่พบเลขปัจจุบัน`,
        );
      } finally {
        if (!cancelled) setLoadingUtilityLast(false);
      }
    }

    void loadLastUsageBill();

    return () => {
      cancelled = true;
    };
  }, [isUtilityBill, selectedCustomer, userId, utilityServiceItemId, utilityServiceName, selectedUtilityService]);

  useEffect(() => {
    if (!isUtilityBill) return;

    const previous = parseAmount(utilityPreviousReading);
    const current = parseAmount(utilityCurrentReading);
    const rate = parseAmount(utilityRate);
    const usage = Math.max(0, Math.round((current - previous) * 1000) / 1000);
    const serviceName = utilityServiceName.trim() || "ค่าบริการประจำรอบ";
    const catalogService = selectedUtilityService || serviceItems.find((item) => item.name.trim().toLowerCase() === serviceName.toLowerCase()) || null;
    const unit = utilityUnit.trim() || catalogService?.base_unit || "หน่วย";
    const lineNote = [
      "[USAGE_BILL]",
      `รอบบิล: ${utilityPeriodStart || "-"} - ${utilityPeriodEnd || "-"}`,
      `เลขก่อนหน้า: ${utilityPreviousReading || "0"}`,
      `เลขปัจจุบัน: ${utilityCurrentReading || "0"}`,
      ...(utilityCurrentReading ? [`ใช้ไป: ${usage.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unit}`] : []),
    ].join("\n");

    setLineItems((prev) => {
      const currentLine = prev[0] || createEmptyLine();
      const utilityLine: LineItemForm = {
        ...currentLine,
        item_id: catalogService?.id || null,
        item_sku: catalogService?.sku || null,
        item_name: serviceName,
        item_type: "service",
        line_note: lineNote,
        unit,
        base_unit: unit,
        carton_unit: null,
        qty_per_carton: null,
        base_unit_price: null,
        unit_price: rate,
        quantity: usage,
        discount_percent: 0,
      };
      return [utilityLine, ...prev.slice(1)];
    });
  }, [
    isUtilityBill,
    utilityCurrentReading,
    utilityPeriodEnd,
    utilityPeriodStart,
    utilityPreviousReading,
    utilityRate,
    utilityServiceName,
    utilityUnit,
    selectedUtilityService,
    serviceItems,
  ]);

  const handleUtilityServiceChange = (value: string) => {
    setUtilityServiceName(value);
    setUtilityPreviousReading("");
    setUtilityCurrentReading("");
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
    setUtilityPreviousReading("");
    setUtilityCurrentReading("");
  };

  const toggleInvoice = (id: string) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const utilityValidation = useMemo(() => {
    if (!isUtilityBill) return { readingError: undefined, rateError: undefined, periodError: undefined };
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
  }, [isUtilityBill, utilityPreviousReading, utilityCurrentReading, utilityRate, utilityPeriodStart, utilityPeriodEnd]);

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
            return applyCatalogItemToLine(updated, catalogItem, jobDetailsFeatureEnabled);
          } else {
            updated.item_id = null;
            updated.item_sku = null;
            updated.item_type = "product";
            updated.base_unit = updated.unit || "ชิ้น";
            updated.carton_unit = null;
            updated.qty_per_carton = null;
            updated.base_unit_price = null;
            updated.job_details_open = false;
            updated.job_color = "";
            updated.job_width = "";
            updated.job_height = "";
            updated.job_position = "";
            updated.job_material = "";
            updated.job_remark = "";
            updated.job_detail_values = {};
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

  const duplicateLineItem = (id: string) => {
    setLineItems((prev) => {
      const sourceIndex = prev.findIndex((lineItem) => lineItem.id === id);
      if (sourceIndex < 0) return prev;
      const copy = {
        ...prev[sourceIndex],
        id: crypto.randomUUID(),
        job_details_open: false,
        job_detail_values: { ...prev[sourceIndex].job_detail_values },
      };
      return [
        ...prev.slice(0, sourceIndex + 1),
        copy,
        ...prev.slice(sourceIndex + 1),
      ];
    });
  };

  const updateJobDetail = (
    id: string,
    field: string,
    value: string,
  ) => {
    setLineItems((prev) =>
      prev.map((lineItem) => {
        if (lineItem.id !== id) return lineItem;
        const matchedItem = items.find((catalogItem) => catalogItem.id === lineItem.item_id);
        const fields = matchedItem?.id ? serviceJobDetailFields[matchedItem.id] || DEFAULT_JOB_DETAIL_FIELDS : DEFAULT_JOB_DETAIL_FIELDS;
        const legacyUpdates: Partial<LineItemForm> = {};
        if (field === "color") legacyUpdates.job_color = value;
        if (field === "position") legacyUpdates.job_position = value;
        if (field === "material") legacyUpdates.job_material = value;
        if (field === "remark") legacyUpdates.job_remark = value;
        if (field === "size_width") legacyUpdates.job_width = value;
        if (field === "size_height") legacyUpdates.job_height = value;
        const updated = {
          ...lineItem,
          ...legacyUpdates,
          job_detail_values: {
            ...lineItem.job_detail_values,
            [field]: value,
          },
        } as LineItemForm;
        return { ...updated, line_note: buildJobDetailsNote(updated, fields) };
      }),
    );
  };

  const toggleJobDetails = (id: string) => {
    setLineItems((prev) =>
      prev.map((lineItem) =>
        lineItem.id === id
          ? { ...lineItem, job_details_open: !lineItem.job_details_open }
          : lineItem,
      ),
    );
  };

  const selectCatalogItem = (lineItemId: string, catalogItem: Item) => {
    setLineItems((prev) =>
      prev.map((lineItem) => {
        if (lineItem.id !== lineItemId) return lineItem;
        return applyCatalogItemToLine(lineItem, catalogItem, jobDetailsFeatureEnabled);
      }),
    );
  };

  const renderJobDetailPresetInput = (
    lineItemId: string,
    itemId: string,
    fieldKey: JobDetailPresetField,
    value: string,
    label: string,
    placeholder: string,
  ) => {
    const presets = serviceJobDetailPresets[itemId]?.[fieldKey] || [];

    return (
      <JobDetailPresetInput
        label={label}
        value={value}
        placeholder={placeholder}
        presets={presets}
        onChange={(nextValue) => updateJobDetail(lineItemId, fieldKey, nextValue)}
        onDeletePreset={(presetValue) => void removeServiceJobDetailPreset(itemId, fieldKey, presetValue)}
      />
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

  const handleSave = async () => {
    if (!selectedCustomer || !userId) return;
    setError(null);

    if (isUtilityBill) {
      const previous = parseAmount(utilityPreviousReading);
      const current = parseAmount(utilityCurrentReading);
      const rate = parseAmount(utilityRate);
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
      if (current <= previous) {
        setError("เลขปัจจุบันต้องมากกว่าเลขก่อนหน้า");
        return;
      }
      if (rate <= 0) {
        setError("กรุณาระบุราคา/หน่วย");
        return;
      }
    }

    if (isLineItemDocument) {
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

    if (isTaxInvoiceReceipt && !permissions.canRecordPayments) {
      setError("สิทธิ์นี้ทำได้เฉพาะ Owner หรือ Manager");
      return;
    }

    setSaving(true);
    let createdDealId: string | null = null;
    let createdDocumentId: string | null = null;
    try {
      let dealId: string | null = editingDealId;
      if (!documentId && !isBillingNote) {
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
      const docNumber = docNumberOverride || await generateDocNumberBE(userId, type, documentIssueDate);

      const docPayload: Record<string, unknown> = {
        user_id: userId,
        deal_id: dealId,
        customer_id: selectedCustomer.id,
        doc_type: type,
        doc_number: docNumber,
        status: isTaxInvoiceReceipt ? "issued" : "draft",
        issue_date: documentIssueDate,
        vat_registered: vatRegistered,
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
        note: note.trim() ? note : null,
        hide_amounts_on_print: isDeliveryNote ? hideAmountsOnPrint : null,
      };

      let savedDocumentId = documentId || "";
      if (documentId) {
        const { error: docError } = await supabase
          .from("documents")
          .update(docPayload)
          .eq("id", documentId)
          .eq("user_id", userId)
          .eq("doc_type", "invoice")
          .eq("status", "draft");

        if (docError) throw docError;
        const { error: deleteItemsError } = await supabase.from("document_line_items").delete().eq("document_id", documentId);
        if (deleteItemsError) throw deleteItemsError;
      } else {
        const { data: document, error: docError } = await supabase
          .from("documents")
          .insert(docPayload)
          .select("*")
          .single();

        if (docError || !document) throw docError || new Error("ไม่สามารถสร้างเอกสารได้");
        savedDocumentId = document.id;
        createdDocumentId = document.id;
      }

      if (isLineItemDocument) {
        const validItems = lineItems.filter((lineItem) => lineItem.item_name.trim());
        if (validItems.length > 0) {
          const lineItemRecords = validItems.map((lineItem, idx) => {
            const lineCalc = calculateLineAmounts(lineItem);
            const baseQuantity = getLineBaseQuantity(lineItem);
            const soldByCarton = isCartonUnitSelected(lineItem);
            return {
              document_id: savedDocumentId,
              user_id: userId,
              item_id: lineItem.item_id,
              item_name: lineItem.item_name,
              line_note: lineItem.line_note.trim() || null,
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
        await deductStockOnDocumentSent(savedDocumentId, userId);
      }

      if (isBillingNote) {
        const selectedInvoices = unpaidInvoices.filter((inv) => selectedInvoiceIds.has(inv.id));
        if (selectedInvoices.length > 0) {
          const billingRecords = selectedInvoices.map((inv) => ({
            billing_note_id: savedDocumentId,
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

      if (documentId) {
        toast.success("บันทึกร่างใบแจ้งหนี้แล้ว");
        navigate(`/documents/${documentId}`);
      } else if (dealId) {
        toast.success("บันทึกงานขายสำเร็จ");
        navigate(`/deals/${dealId}`);
      } else {
        toast.success("สร้างเอกสารสำเร็จ");
        navigate("/home");
      }
    } catch (err: unknown) {
      if (createdDocumentId) {
        await restoreStockOnVoid(createdDocumentId, userId).catch(() => undefined);
        await supabase.from("billing_note_invoices").delete().eq("billing_note_id", createdDocumentId);
        await supabase.from("document_line_items").delete().eq("document_id", createdDocumentId);
        await supabase.from("documents").delete().eq("id", createdDocumentId);
      }
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

  if (editLoading) {
    return (
      <AppShell title={label} showBack>
        <Spinner />
      </AppShell>
    );
  }

  return (
    <AppShell title={label} showBack>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {(type === "invoice" || isTaxInvoiceReceipt) && clientProfile?.vat_registered && !clientProfile?.tax_id && (
        <div className="mb-4 p-3 bg-[#FAEEDA] border-[0.5px] border-[#E6C776] rounded-lg text-sm text-[#633806] flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
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
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          vatRegistered
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-blue-200 bg-blue-50 text-blue-900"
        }`}>
          <p className="font-medium">เอกสารนี้ไม่มีฉบับร่าง</p>
          <p className="mt-1 text-xs leading-5">
            {vatRegistered
              ? "เมื่อบันทึก ระบบจะออกใบกำกับภาษี/ใบเสร็จรับเงินทันที และถือว่ารับชำระแล้วในขั้นตอนเดียว"
              : "บัญชีนี้ไม่ได้จด VAT เมื่อบันทึก ระบบจะออกเป็นใบเสร็จรับเงินทันที ไม่มีรายการ VAT และถือว่ารับชำระแล้วในขั้นตอนเดียว"}
          </p>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <h3 className="text-sm font-medium mb-3">ลูกค้า</h3>
          {selectedCustomer ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-card-border bg-[#FAF8F3] p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{selectedCustomer.name}</p>
                {selectedCustomer.tax_id && (
                  <p className="text-xs text-gray-500">เลขผู้เสียภาษี: {selectedCustomer.tax_id}</p>
                )}
                {selectedCustomer.address && (
                  <p className="line-clamp-2 text-xs text-gray-500">{selectedCustomer.address}</p>
                )}
                {type !== "delivery_note" && (!selectedCustomer.tax_id || !selectedCustomer.address) && (
                  <p className="mt-1 text-xs text-amber-600">ข้อมูลลูกค้ายังไม่ครบสำหรับเอกสารภาษี</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustomerPickerOpen(true)}
              >
                เปลี่ยน
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-[#B8D7F4] bg-[#F3F8FE] px-4 py-4 text-center">
              <p className="text-sm font-medium text-[#1A1A18]">เลือกลูกค้าก่อนสร้างเอกสาร</p>
              <p className="mt-1 text-xs text-[#5B6B7A]">ระบบจะใช้ข้อมูลลูกค้าในเอกสารและการคำนวณภาษี</p>
              <Button className="mt-3 w-full justify-center shadow-md" onClick={() => setCustomerPickerOpen(true)}>
                เลือกลูกค้า
              </Button>
            </div>
          )}
          <CustomerPickerModal
            open={customerPickerOpen}
            customers={customers}
            selectedCustomerId={selectedCustomer?.id}
            taxSensitive={type !== "delivery_note"}
            onClose={() => setCustomerPickerOpen(false)}
            onSelect={(customer) => {
              setSelectedCustomer(customer);
            }}
            onCreate={async (customer) => {
              try {
                return await addCustomer(customer);
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
                throw err;
              }
            }}
          />
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

        {isUtilityBill && (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-[#1A1A18]">ข้อมูลรอบบิล</h3>
                <p className="mt-1 text-xs text-gray-500">
                  ระบบจะคำนวณจำนวนหน่วย และบันทึกรายละเอียดไว้ในหมายเหตุรายการ
                </p>
              </div>
              {loadingUtilityLast ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">กำลังดูรอบก่อน</span>
              ) : null}
            </div>

            {utilityLastHint && utilityLastHint.includes("ดึงเลขครั้งก่อน") && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-1.5">
                <span className="text-emerald-600 font-bold">&#10003;</span>
                {utilityLastHint}
              </div>
            )}

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
                <span className="mt-1 block text-[11px] text-gray-500">
                  เลือกบริการเดิมเพื่อดึงราคา หน่วย เลขครั้งก่อน และรอบบิลถัดไปของลูกค้ารายนี้
                </span>
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
                    ใช้ไป {Math.max(0, Math.round((parseAmount(utilityCurrentReading) - parseAmount(utilityPreviousReading)) * 1000) / 1000).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {utilityUnit || "หน่วย"}
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
                  ฿{(
                    Math.max(0, Math.round((parseAmount(utilityCurrentReading) - parseAmount(utilityPreviousReading)) * 1000) / 1000) *
                    parseAmount(utilityRate)
                  ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              {parseAmount(utilityCurrentReading) > parseAmount(utilityPreviousReading) && parseAmount(utilityRate) > 0 && (
                <div className="mt-1 text-xs text-gray-500">
                  {Math.max(0, Math.round((parseAmount(utilityCurrentReading) - parseAmount(utilityPreviousReading)) * 1000) / 1000).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {utilityUnit || "หน่วย"} × ฿{parseAmount(utilityRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}/หน่วย
                </div>
              )}
              {utilityLastHint && !utilityLastHint.includes("ดึงเลขครั้งก่อน") && (
                <p className="mt-2 text-xs text-gray-500">{utilityLastHint}</p>
              )}
            </div>
          </Card>
        )}

        {isLineItemDocument && (
          <Card>
            <h3 className="text-sm font-medium mb-3">{isUtilityBill ? "รายการบนใบแจ้งหนี้" : "รายการ"}</h3>
            <div className="space-y-2">
              {lineItems.map((item, idx) => {
                const matchedItem = item.item_id ? items.find((catalogItem) => catalogItem.id === item.item_id) : null;
                const soldByCarton = isCartonUnitSelected(item);
                const baseQuantity = getLineBaseQuantity(item);
                const jobDetailsEnabled = jobDetailsFeatureEnabled && matchedItem?.item_type === "service" && matchedItem.has_job_details;
                const jobDetailFields = matchedItem?.id
                  ? serviceJobDetailFields[matchedItem.id] || DEFAULT_JOB_DETAIL_FIELDS
                  : DEFAULT_JOB_DETAIL_FIELDS;
                const jobDetailsSummary = getJobDetailsSummary(item, jobDetailFields);

                if (isUtilityBill && idx === 0) {
                  const amounts = calculateLineAmounts(item);
                  const hasData = utilityServiceName.trim() || parseAmount(utilityRate) > 0;
                  return (
                    <div key={item.id} className="pb-3 border-b border-gray-100">
                      {hasData ? (
                        <div className="rounded-lg border border-[#E8E6DF] bg-[#FAF8F3] px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-[#1A1A18]">{item.item_name}</span>
                            <span className="text-sm font-semibold text-[#1A1A18]">
                              ฿{amounts.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="mt-1.5 whitespace-pre-line text-xs leading-5 text-[#5F5A52]">
                            {getUtilityDisplayNote(item.line_note)}
                          </div>
                          <div className="mt-1.5 text-[11px] text-gray-500">
                            {item.quantity.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {item.unit} × ฿{item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}/หน่วย
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-[#E8E6DF] bg-[#FBFAF7] px-3 py-3 text-center text-xs text-gray-400">
                          กรุณากรอกข้อมูลรอบบิลด้านบน ระบบจะแสดงตัวอย่างรายการที่นี่
                        </div>
                      )}
                    </div>
                  );
                }

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
                      onCreate={async (input) => {
                        try {
                          return await addItem(input);
                        } catch (err: unknown) {
                          setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
                          throw err;
                        }
                      }}
                    />
                  </div>
                  {isUtilityBill && item.line_note.includes("[USAGE_BILL]") ? (
                    <div className="mb-2 whitespace-pre-line rounded-lg border border-[#E8E6DF] bg-[#FBFAF7] px-3 py-2 text-xs leading-5 text-[#5F5A52]">
                      {getUtilityDisplayNote(item.line_note)}
                    </div>
                  ) : jobDetailsEnabled ? (
                    <div className="mb-2 rounded-lg border border-[#E8E6DF] bg-[#FBFAF7] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleJobDetails(item.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1A1A18] transition-colors hover:text-primary"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          {jobDetailsSummary ? "รายละเอียดงาน" : "เพิ่มรายละเอียด"}
                        </button>
                        {jobDetailsSummary ? (
                          <span className="max-w-full truncate text-[11px] text-[#5F5A52]">
                            {jobDetailsSummary}
                          </span>
                        ) : null}
                      </div>
                      {item.job_details_open && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-[10px] text-gray-400">เทคนิค</span>
                            <input
                              value={item.item_name}
                              readOnly
                              className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3 py-2 text-xs text-[#5F5A52]"
                            />
                          </label>
                          {matchedItem?.id ? (
                            jobDetailFields.map((field) => {
                              if (field.field_type === "dimension") {
                                const { width, height } = getJobDetailDimension(item, field.field_key);
                                return (
                                  <div key={field.field_key}>
                                    <span className="mb-1 block text-[10px] text-gray-400">{field.label}</span>
                                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                      <input
                                        type="number"
                                        min="0"
                                        value={width}
                                        onChange={(event) => updateJobDetail(item.id, `${field.field_key}_width`, event.target.value)}
                                        placeholder="24"
                                        className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3 py-2 text-xs focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20"
                                      />
                                      <span className="text-xs text-gray-400">x</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={height}
                                        onChange={(event) => updateJobDetail(item.id, `${field.field_key}_height`, event.target.value)}
                                        placeholder="35"
                                        className="w-full rounded-lg border border-[#E8E6DF] bg-white px-3 py-2 text-xs focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20"
                                      />
                                    </div>
                                  </div>
                                );
                              }

                              const input = renderJobDetailPresetInput(
                                item.id,
                                matchedItem.id,
                                field.field_key,
                                getJobDetailValue(item, field.field_key),
                                field.label,
                                field.placeholder,
                              );
                              return field.field_key === "remark" ? (
                                <div key={field.field_key} className="md:col-span-2">
                                  {input}
                                </div>
                              ) : (
                                <div key={field.field_key}>{input}</div>
                              );
                            })
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : (
                    <textarea
                      value={item.line_note}
                      onChange={(e) => updateLineItem(item.id, "line_note", e.target.value)}
                      placeholder="หมายเหตุของรายการนี้ (ถ้ามี)"
                      rows={2}
                      className="mb-2 w-full rounded-lg border border-[#E8E6DF] bg-white px-3 py-2 text-xs text-[#1A1A18] placeholder:text-gray-400 focus:border-[#378ADD] focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20"
                    />
                  )}
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
                    <button
                      type="button"
                      className="px-1 pt-[22px] text-gray-400 transition-colors hover:text-primary"
                      onClick={() => duplicateLineItem(item.id)}
                      aria-label="ทำซ้ำรายการ"
                      title="ทำซ้ำรายการ"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        className="text-gray-400 hover:text-red-500 px-1 text-sm pt-[22px]"
                        onClick={() => removeLineItem(item.id)}
                        aria-label="Remove line"
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
          <h3 className="text-sm font-medium">รายละเอียดเพิ่มเติม</h3>
          <div className="mt-3 space-y-3">
            {isTaxInvoiceReceipt && (
              <p className="rounded-lg bg-[#FAF8F3] px-3 py-2 text-xs text-gray-600">
                {vatRegistered
                  ? "บัญชีนี้จด VAT เอกสารจึงเป็นใบกำกับภาษี/ใบเสร็จรับเงินและคำนวณ VAT ตามอัตราที่ตั้งไว้"
                  : "บัญชีนี้ไม่ได้จด VAT เอกสารจึงเป็นใบเสร็จรับเงินและไม่คำนวณ VAT"}
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
            <div className="border-t border-card-border pt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                หมายเหตุ
              </label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="เช่น ชำระภายใน 30 วัน โอนก่อนส่งของ"
                className="w-full px-3 py-2 text-sm border border-card-border rounded-lg bg-white focus:outline-none focus:border-primary whitespace-pre-line"
              />
            </div>
          </div>
        </Card>

        {isDeliveryNote && (
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
                <span className="text-[11px] text-gray-400 ml-2">Hide amounts on print</span>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  เมื่อเปิดใช้งาน PDF ใบส่งของจะแสดงเฉพาะชื่อสินค้า จำนวน และหน่วย โดยไม่แสดงราคา ส่วนลด และยอดรวม
                </p>
              </div>
            </label>
          </Card>
        )}

        <EditableDocNumber
          value={docNumberOverride}
          onChange={setDocNumberOverride}
          placeholder="เลขที่เอกสาร (เว้นว่าง = สร้างอัตโนมัติ)"
          autoGenerate={async () => await generateDocNumberBE(userId!, type, isTaxInvoiceReceipt ? paymentDate : issueDate)}
          className="mb-3"
        />

        <Button className="w-full" disabled={!canSave || saving} onClick={handleSave}>
          {saving ? "กำลังบันทึก..." : isTaxInvoiceReceipt ? "ออกเอกสารทันที" : isEditingDraft ? "บันทึกร่าง" : "บันทึก"}
        </Button>
      </div>
    </AppShell>
  );
}
