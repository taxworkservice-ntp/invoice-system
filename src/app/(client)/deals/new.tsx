import { useState, useMemo, useEffect, useRef } from "react";
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
import { DocumentOptionsCard, DocumentOptionRow } from "../../../components/documents/DocumentOptions";
import { StepHeading } from "../../../components/documents/FormStep";
import { Modal } from "../../../components/ui/Modal";
import { CatalogAutocomplete } from "../../../components/CatalogAutocomplete";
import { ItemCreateModal } from "../../../components/catalog/ItemCreateModal";
import { PoTaskFields } from "../../../components/documents/PoTaskFields";
import { CustomerPickerModal } from "../../../components/customers/CustomerPickerModal";
import { Spinner } from "../../../components/ui/Spinner";
import { supabase } from "../../../lib/supabase";
import { getDocNumberErrorMessage, resolveDocNumber } from "../../../lib/docNumber";
import { businessTodayString, localTodayString, monthStartString as getMonthStartString } from "../../../lib/devDate";
import { calculateLineAmounts, calculateTax } from "../../../lib/tax";
import { formatBuddhistDate } from "../../../lib/dates";
import { cartonsToBase, formatMixedStock, restoreStockOnVoid, round3 } from "../../../lib/stock";
import { DEFAULT_JOB_DETAIL_FIELDS, getJobDetailFieldLabel, normalizeJobDetailFields, type JobDetailFieldConfig } from "../../../lib/jobDetails";
import { LineImageUpload } from "../../../components/documents/LineImageUpload";
import { getWorkspaceExperience, getWorkspacePermissions } from "../../../lib/permissions";
import { useCustomerReferenceHistory } from "../../../hooks/useCustomerReferenceHistory";
import { DOC_TYPE_LABELS, WHT_RATE_OPTIONS, VAT_DEFAULT } from "../../../constants";
import { AlertTriangle, ChevronDown, Plus, PlusCircle, X, SlidersHorizontal, Trash2 } from "lucide-react";
import { EditableDocNumber } from "../../../components/documents/EditableDocNumber";
import type { Document, DocumentLineItem, DocumentType, DocumentStatus, Customer, WhtRate, Item, ItemJobDetailField, ItemJobDetailPreset, JobDetailPresetField } from "../../../types";

interface LineItemForm {
  id: string;
  image_url?: string | null;
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
  hide_amounts_on_print: boolean;
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

function CommaInput({ value, onChange, ...props }: { value: number; onChange: (val: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [focus, setFocus] = useState(false);
  const [text, setText] = useState("");

  const formatted = !value
    ? ""
    : (Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { minimumFractionDigits: 2 }));

  const display = focus ? text : formatted;

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={() => {
        setFocus(true);
        setText(value ? String(value) : "");
      }}
      onBlur={() => {
        setFocus(false);
        const raw = text.replace(/,/g, "");
        const num = parseFloat(raw);
        if (!isNaN(num)) onChange(num);
        else if (raw === "" || raw === "-") onChange(0);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "");
        setText(raw);
        const num = parseFloat(raw);
        if (!isNaN(num)) onChange(num);
      }}
      className="w-full px-3 py-2 text-sm border rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors border-card-border"
      placeholder="0"
      {...props}
    />
  );
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
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
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
          className="w-full rounded-lg border border-card-border bg-white py-2 pl-3 pr-8 text-xs text-ink-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {presets.length > 0 && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpen((current) => !current)}
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-gray-400 transition-colors hover:bg-cool-50 hover:text-ink-900"
            aria-label={`แสดงตัวเลือก${label}`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-cool-200 bg-white shadow-lg">
          <div className="max-h-44 overflow-y-auto py-1">
            {filteredPresets.map((preset) => {
              const selected = preset === value;
              return (
                <div
                  key={preset}
                  className={`group flex items-center justify-between gap-2 px-2 py-1.5 text-xs ${
                    selected
                      ? "bg-primary-soft text-primary-deep"
                      : "bg-white text-ink-900 hover:bg-cool-25"
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
    image_url: null,
    hide_amounts_on_print: false,
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
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(start: string, end: string) {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function lineItemAmount(li: LineItemForm) {
  const discount = (li.discount_percent || 0) / 100;
  return li.unit_price * li.quantity * (1 - discount);
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
    job_details_open: hasJobDetails ? true : false,
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
        const unit = lineItem.job_detail_values[`${field.field_key}_unit`] || field.default_unit || "มม.";
        return size ? `${field.label}: ${size} ${unit}` : "";
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
        const unit = lineItem.job_detail_values[`${field.field_key}_unit`] || field.default_unit || "มม.";
        return size ? `${size} ${unit}` : "";
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
  const isClassicMode = searchParams.get("mode") === "classic";
  const requestedType = initialType || searchParams.get("type") || "quotation";
  const isUtilityBill = requestedType === "utility_bill";
  const type = (isUtilityBill ? "invoice" : requestedType) as DocumentType;
  const isEditingDraft = Boolean(documentId);
  const label = isEditingDraft && type === "invoice"
    ? "แก้ไขร่างใบแจ้งหนี้"
    : isEditingDraft && type === "quotation"
      ? "แก้ไขร่างใบเสนอราคา"
      : isEditingDraft && type === "delivery_note"
        ? "แก้ไขร่างใบส่งของ"
        : isUtilityBill ? "ออกบิลประจำรอบ" : DOC_TYPE_LABELS[type]?.th || "เอกสารใหม่";
  const isBillingNote = type === "billing_note";
  const isDeliveryNote = type === "delivery_note";
  const isLineItemDocument = type === "quotation" || type === "invoice" || isDeliveryNote;

  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const experience = getWorkspaceExperience(workspaceRole, permissions);
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const { hasFeature } = useClientFeatures(userId);
  const { customers, loading: customersLoading, addCustomer } = useCustomers(userId);
  const { items, addItem, refetch: refetchItems } = useItems(userId);
  const jobDetailsFeatureEnabled = hasFeature("service_job_details");
  const businessToday = businessTodayString(clientProfile);
  const todayString = () => businessToday;

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  // In-form full catalog creation (ItemCreateModal): targetLineId = the line
  // whose picker opened it (auto-select into that line), or null = the
  // section-level "+ สร้าง" button (apply to the last empty line, else append).
  const [itemCreateModal, setItemCreateModal] = useState<{ open: boolean; targetLineId: string | null }>({
    open: false,
    targetLineId: null,
  });

  const [lineItems, setLineItems] = useState<LineItemForm[]>([]);
  const [serviceJobDetailFields, setServiceJobDetailFields] = useState<Record<string, JobDetailFieldConfig[]>>({});
  const [serviceJobDetailPresets, setServiceJobDetailPresets] = useState<Record<string, JobDetailSuggestions>>({});
  const [vatRegistered, setVatRegistered] = useState(clientProfile?.vat_registered ?? false);
  const [vatRate, setVatRate] = useState<number>(clientProfile?.vat_rate ?? VAT_DEFAULT);
  const [whtRate, setWhtRate] = useState<WhtRate>(clientProfile?.default_wht_rate ?? "0");
  const [documentDiscountPercent, setDocumentDiscountPercent] = useState(0);
  const [issueDate, setIssueDate] = useState(() => businessTodayString(clientProfile));
  const [showIssueDatePicker, setShowIssueDatePicker] = useState(false);

  const [note, setNote] = useState("");
  // Optional PO reference + task name, printed on the document (classic V2).
  const [customerPo, setCustomerPo] = useState("");
  const [taskName, setTaskName] = useState("");
  // Distinct past values for this customer — recurring jobs become pick-not-type.
  const referenceHistory = useCustomerReferenceHistory(selectedCustomer?.id || null);
  const [utilityServiceItemId, setUtilityServiceItemId] = useState<string | null>(null);
  const [utilityServiceName, setUtilityServiceName] = useState("");
  const [utilityUnit, setUtilityUnit] = useState("หน่วย");
  const [utilityPeriodStart, setUtilityPeriodStart] = useState(() => getMonthStartString(businessTodayString(clientProfile)));
  const [utilityPeriodEnd, setUtilityPeriodEnd] = useState(() => businessTodayString(clientProfile));
  const [utilityPreviousReading, setUtilityPreviousReading] = useState("");
  const [utilityCurrentReading, setUtilityCurrentReading] = useState("");
  const [utilityRate, setUtilityRate] = useState("");
  const [utilityLastHint, setUtilityLastHint] = useState<string | null>(null);
  const [loadingUtilityLast, setLoadingUtilityLast] = useState(false);
  const [hideAmountsOnPrint, setHideAmountsOnPrint] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("invoice-system.hideAmountsOnPrint") !== "false";
  });
  const [isBlankForm, setIsBlankForm] = useState(false);
  // DN full-totals is settings-only (ตั้งค่า › ใบส่งของ): new docs follow the
  // workspace setting, draft edits keep their saved value frozen at hydrate.
  const frozenShowFullTotals = useRef<boolean | null>(null);
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(false);

  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loadingLastInvoice, setLoadingLastInvoice] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string[] | null>(null);
  const [editLoading, setEditLoading] = useState(Boolean(documentId));
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  // Section 4 starts collapsed; auto-expand once when it holds non-default
  // content (draft note / changed WHT) so it gets attention.
  const detailsAutoExpanded = useRef(false);
  useEffect(() => {
    if (detailsAutoExpanded.current || editLoading) return;
    detailsAutoExpanded.current = true;
    if (note.trim() || whtRate !== (clientProfile?.default_wht_rate ?? "0")) {
      setShowAdditionalDetails(true);
    }
  }, [editLoading, note, whtRate, clientProfile]);
  const useAtomicCreate = !documentId && !editingDealId && !isBillingNote && isLineItemDocument;
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (documentId) return;
    const realToday = businessTodayString(null);
    if (issueDate === realToday) setIssueDate(businessToday);
    if (utilityPeriodEnd === realToday) setUtilityPeriodEnd(businessToday);
    if (utilityPeriodStart === getMonthStartString(realToday)) {
      setUtilityPeriodStart(getMonthStartString(businessToday));
    }
  }, [businessToday, documentId, issueDate, utilityPeriodEnd, utilityPeriodStart]);

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

  const loadLatestInvoiceLines = async () => {
    if (!selectedCustomer || !userId || loadingLastInvoice) return;
    setLoadingLastInvoice(true);
    try {
      const { data: invoices } = await supabase
        .from("documents")
        .select("id, customer_po_number, task_name")
        .eq("user_id", userId)
        .eq("customer_id", selectedCustomer.id)
        .eq("doc_type", "invoice")
        .in("status", ["sent", "paid", "partially_paid"])
        .order("issue_date", { ascending: false })
        .limit(1);
      const latest = invoices?.[0];
      if (!latest) {
        toast.error("ลูกค้านี้ยังไม่มีใบแจ้งหนี้");
        return;
      }
      const { data: lines, error: linesError } = await supabase
        .from("document_line_items")
        .select("*")
        .eq("document_id", latest.id)
        .order("sort_order", { ascending: true });
      if (linesError) throw linesError;
      const mapped = ((lines || []) as DocumentLineItem[]).map((line) => ({
        id: line.id || crypto.randomUUID(),
        item_id: line.item_id,
        item_sku: line.item_sku,
        item_name: line.item_name,
        line_note: line.line_note || "",
        image_url: line.image_url || null,
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
        hide_amounts_on_print: line.hide_amounts_on_print,
      }));
      if (mapped.length === 0) {
        toast.error("ใบแจ้งหนี้ล่าสุดไม่มีรายการ");
        return;
      }
      setLineItems(mapped);
      // Carry the PO/job reference along with the lines — same customer,
      // same job context.
      if ((latest as { customer_po_number?: string | null }).customer_po_number) {
        setCustomerPo((latest as { customer_po_number: string }).customer_po_number);
      }
      if ((latest as { task_name?: string | null }).task_name) {
        setTaskName((latest as { task_name: string }).task_name);
      }
      toast.success("โหลดรายการจากใบแจ้งหนี้ล่าสุดแล้ว");
    } catch (err: any) {
      toast.error(err.message || "โหลดรายการไม่สำเร็จ");
    } finally {
      setLoadingLastInvoice(false);
    }
  };

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
        if (draftDoc.doc_type !== "quotation" && draftDoc.doc_type !== "invoice" && draftDoc.doc_type !== "delivery_note") {
          throw new Error("แก้ไขได้เฉพาะร่างใบเสนอราคา ใบแจ้งหนี้ หรือใบส่งของ");
        }
        if (draftDoc.status !== "draft") {
          throw new Error("แก้ไขได้เฉพาะเอกสารฉบับร่าง");
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
        setCustomerPo(draftDoc.customer_po_number || "");
        setTaskName(draftDoc.task_name || "");
        setDocNumberOverride(draftDoc.doc_number || "");
        if (draftDoc.doc_type === "delivery_note" && draftDoc.hide_amounts_on_print != null) {
          setHideAmountsOnPrint(draftDoc.hide_amounts_on_print);
        }
        if (draftDoc.doc_type === "delivery_note" && draftDoc.is_blank_form != null) {
          setIsBlankForm(draftDoc.is_blank_form);
        }
        if (draftDoc.doc_type === "delivery_note" && draftDoc.show_full_totals != null) {
          frozenShowFullTotals.current = draftDoc.show_full_totals;
        }
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
          hide_amounts_on_print: line.hide_amounts_on_print,
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

  const updateLineItem = (id: string, field: keyof LineItemForm, value: string | number | boolean) => {
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

  // Full catalog creation from the deal form (ItemCreateModal): refresh the
  // picker list, then fill the target line — or, for the section-level entry,
  // the last still-empty line, appending a fresh pre-filled line otherwise.
  const handleFullCreateItem = (created: Item) => {
    void refetchItems();
    const targetLineId = itemCreateModal.targetLineId;
    if (targetLineId) {
      selectCatalogItem(targetLineId, created);
      return;
    }
    setLineItems((prev) => {
      const last = prev[prev.length - 1];
      if (last && !last.item_id && !last.item_name.trim() && !last.unit_price) {
        return prev.map((lineItem) =>
          lineItem.id === last.id
            ? applyCatalogItemToLine(lineItem, created, jobDetailsFeatureEnabled)
            : lineItem,
        );
      }
      return [...prev, applyCatalogItemToLine(createEmptyLine(), created, jobDetailsFeatureEnabled)];
    });
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

    if (!permissions.canCreateEditDocuments) {
      setError("คุณไม่มีสิทธิ์จัดทำเอกสาร");
      return;
    }
    if (experience.isSimpleMode && !experience.canShowAdvancedDealOptions && !["quotation", "delivery_note"].includes(requestedType)) {
      setError("งานประเภทนี้ต้องให้ผู้จัดการเป็นผู้จัดทำ");
      return;
    }

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

    // Duplicate-invoice guard: warn (non-blocking) when an invoice with the
    // same total was issued to the same customer within the last 30 days.
    setDuplicateWarning(null);
    if (type === "invoice" && userId) {
      try {
        // 30-day cutoff anchored to Bangkok today (issue_date is date-only).
        const cutoff = addDaysString(localTodayString(), -30);
        let dupQuery = supabase
          .from("documents")
          .select("doc_number, issue_date, total_amount")
          .eq("user_id", userId)
          .eq("customer_id", selectedCustomer.id)
          .eq("doc_type", "invoice")
          .in("status", ["sent", "paid", "partially_paid"])
          .gte("issue_date", cutoff)
          .neq("total_amount", 0)
          .order("issue_date", { ascending: false })
          .limit(5);
        if (documentId) dupQuery = dupQuery.neq("id", documentId);
        const { data: duplicates } = await dupQuery;
        const matches = (duplicates || []).filter(
          (d) => Math.abs(Number(d.total_amount ?? 0) - tax.total) < 0.01,
        );
        if (matches.length > 0) {
          setDuplicateWarning(
            matches.map((m) => `${m.doc_number} (${formatBuddhistDate(m.issue_date)})`),
          );
        }
      } catch {
        // Warning is best-effort; never block saving on lookup failure.
      }
    }

    setShowConfirmModal(true);
  };

  const executeSave = async () => {
    if (!selectedCustomer || !userId) return;
    setShowConfirmModal(false);
    setSaving(true);
    let createdDealId: string | null = null;
    let createdDocumentId: string | null = null;
    try {
      let dealId: string | null = editingDealId;
      if (!documentId && !isBillingNote && !useAtomicCreate) {
        const { data: deal, error: dealError } = await supabase
          .from("deals")
          .insert({
            user_id: userId,
            customer_id: selectedCustomer.id,
            title: null,
          })
          .select("id")
          .single();

        if (dealError) throw dealError;
        dealId = deal.id;
        createdDealId = deal.id;
      }

      const documentIssueDate = issueDate;
      const docNumber = await resolveDocNumber(userId, type, documentIssueDate, docNumberOverride, documentId);

      const docPayload: Record<string, unknown> = {
        user_id: userId,
        deal_id: dealId,
        customer_id: selectedCustomer.id,
        doc_type: type,
        doc_number: docNumber,
        status: "draft",
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
        payment_method: null,
        bank_account_id: null,
        paid_at: null,
        amount_received: null,
        note: note.trim() ? note : null,
        customer_po_number: customerPo.trim() || null,
        task_name: taskName.trim() || null,
        ...(isDeliveryNote ? { hide_amounts_on_print: hideAmountsOnPrint, is_blank_form: isBlankForm, show_full_totals: documentId && frozenShowFullTotals.current != null ? frozenShowFullTotals.current : clientProfile?.delivery_note_show_full_totals === true } : {}),
      };

      let savedDocumentId = documentId || "";
      if (isBillingNote && !documentId) {
        // Transactional path: billing note + links + invoice state changes
        // commit together or not at all (see create_billing_note_with_links).
        const selectedInvoices = unpaidInvoices.filter((inv) => selectedInvoiceIds.has(inv.id));
        if (selectedInvoices.length === 0) {
          throw new Error("กรุณาเลือกอย่างน้อย 1 ใบแจ้งหนี้");
        }
        const { data: createdBn, error: bnCreateError } = await supabase.rpc("create_billing_note_with_links", {
          p_user_id: userId,
          p_document: {
            ...docPayload,
            title: selectedCustomer ? `ใบวางบิลรวม ${selectedCustomer.name}` : null,
          },
          p_invoice_ids: selectedInvoices.map((inv) => inv.id),
        });
        const bnRecord = Array.isArray(createdBn) ? createdBn[0] : createdBn;
        if (bnCreateError || !bnRecord?.document_id) throw bnCreateError || new Error("ไม่สามารถบันทึกใบวางบิลได้");
        savedDocumentId = bnRecord.document_id;
        createdDocumentId = bnRecord.document_id;
        createdDealId = bnRecord.deal_id;
        dealId = bnRecord.deal_id;
      } else if (useAtomicCreate) {
        const validItems = lineItems.filter((lineItem) => lineItem.item_name.trim());
        const lineItemRecords = validItems.map((lineItem, idx) => {
          const lineCalc = calculateLineAmounts(lineItem);
          const baseQuantity = getLineBaseQuantity(lineItem);
          const soldByCarton = isCartonUnitSelected(lineItem);
          return {
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
            image_url: lineItem.image_url || null,
            hide_amounts_on_print: lineItem.hide_amounts_on_print,
            sort_order: idx,
          };
        });
        const { data: created, error: createError } = await supabase.rpc("create_deal_document", {
          p_user_id: userId,
          p_customer_id: selectedCustomer.id,
          p_document: docPayload,
          p_line_items: lineItemRecords,
          p_title: null,
        });
        const createdRecord = Array.isArray(created) ? created[0] : created;
        if (createError || !createdRecord?.document_id) throw createError || new Error("ไม่สามารถสร้างเอกสารได้");
        savedDocumentId = createdRecord.document_id;
        createdDocumentId = createdRecord.document_id;
        createdDealId = createdRecord.deal_id;
      } else if (documentId) {
        const { error: docError } = await supabase
          .from("documents")
          .update(docPayload)
          .eq("id", documentId)
          .eq("user_id", userId)
          .eq("doc_type", type)
          .eq("status", "draft");

        if (docError) throw docError;
        const { error: deleteItemsError } = await supabase.from("document_line_items").delete().eq("document_id", documentId);
        if (deleteItemsError) throw deleteItemsError;
      } else {
        const { data: document, error: docError } = await supabase
          .from("documents")
          .insert(docPayload)
          .select("id")
          .single();

        if (docError || !document) throw docError || new Error("ไม่สามารถสร้างเอกสารได้");
        savedDocumentId = document.id;
        createdDocumentId = document.id;
      }

      if (isLineItemDocument && !useAtomicCreate) {
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
              image_url: lineItem.image_url || null,
              hide_amounts_on_print: lineItem.hide_amounts_on_print,
              sort_order: idx,
            };
          });
          const { error: itemsError } = await supabase.from("document_line_items").insert(lineItemRecords);
          if (itemsError) throw itemsError;
        }
      }

      if (documentId) {
        toast.success(
          type === "quotation"
            ? "บันทึกร่างใบเสนอราคาแล้ว"
            : type === "delivery_note"
              ? "บันทึกร่างใบส่งของแล้ว"
              : "บันทึกร่างใบแจ้งหนี้แล้ว",
        );
      } else {
        toast.success("บันทึกงานขายสำเร็จ");
      }
      const targetDealId = dealId || createdDealId || editingDealId;
      if (targetDealId) {
        navigate(`/deals/${targetDealId}`);
      } else if (documentId) {
        navigate(`/documents/${documentId}`);
      } else {
        navigate("/home");
      }
    } catch (err: any) {
      if (createdDocumentId) {
        await restoreStockOnVoid(createdDocumentId, userId).catch(() => undefined);
        await supabase.from("billing_note_invoices").delete().eq("billing_note_id", createdDocumentId);
        await supabase.from("document_line_items").delete().eq("document_id", createdDocumentId);
        await supabase.from("documents").delete().eq("id", createdDocumentId);
      }
      if (createdDealId) {
        await supabase.from("deals").delete().eq("id", createdDealId);
      }
      const friendlyMessage = getDocNumberErrorMessage(err);
      toast.error(friendlyMessage);
      setError(friendlyMessage);
      return;
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  };

  const canSave = selectedCustomer && (isBillingNote ? selectedInvoiceIds.size > 0 : lineItems.some((lineItem) => lineItem.item_name.trim()));
  const isIssueDateToday = issueDate === todayString();

  useEffect(() => {
    window.localStorage.setItem("invoice-system.hideAmountsOnPrint", String(hideAmountsOnPrint));
  }, [hideAmountsOnPrint]);

  useEffect(() => {
    const hasUnsavedInput = Boolean(
      selectedCustomer ||
      lineItems.some((lineItem) => lineItem.item_name.trim()) ||
      note.trim() ||
      documentDiscountPercent > 0,
    );
    if (!hasUnsavedInput || saving) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [documentDiscountPercent, lineItems, note, saving, selectedCustomer]);

  if (editLoading) {
    return (
      <AppShell title={label} showBack>
        <Spinner />
      </AppShell>
    );
  }

  return (
    <AppShell title={label} showBack>
      {!isClassicMode && (
        <div className="mb-4 rounded-xl border border-card-border bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink-900">{experience.isSimpleMode ? "บันทึกงานขาย" : "กรอกข้อมูลตามลำดับ"}</div>
              <div className="mt-0.5 text-xs text-gray-500">{experience.isSimpleMode ? "กรอกข้อมูลที่จำเป็น ระบบจะบันทึกเป็นร่างให้ผู้จัดการดำเนินการต่อ" : "กรอกข้อมูลในแต่ละส่วนจากบนลงล่าง ระบบจะคำนวณยอดให้ทันที"}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-gray-500">
            <span className="rounded-full bg-page-bg px-2.5 py-1">1 ลูกค้า</span>
            <span className="rounded-full bg-page-bg px-2.5 py-1">2 วันที่</span>
            <span className="rounded-full bg-page-bg px-2.5 py-1">3 รายการ</span>
            <span className="rounded-full bg-page-bg px-2.5 py-1">4 รายละเอียด</span>
            <span className="rounded-full bg-page-bg px-2.5 py-1">5 ตรวจสอบและบันทึก</span>
          </div>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {type === "invoice" && clientProfile?.vat_registered && !clientProfile?.tax_id && (
        <div className="mb-4 p-3 bg-warning-soft border-[0.5px] border-warning-border rounded-lg text-sm text-pending-text flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">คุณเป็นผู้ประกอบการจดทะเบียน VAT แต่ยังไม่ได้ตั้งค่าเลขผู้เสียภาษี</p>
            <p className="text-[12px] mt-0.5">เลขผู้เสียภาษีจำเป็นสำหรับใบกำกับภาษี</p>
          </div>
          <button
            onClick={() => navigate("/settings/profile")}
            className="shrink-0 text-[12px] text-primary hover:underline font-medium"
          >
            ตั้งค่าเลย →
          </button>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <StepHeading number={1} title="ลูกค้า" />
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-medium text-blue-700">จำเป็น</span>
          </div>
          {selectedCustomer ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-card-border bg-paper-soft p-3">
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
            <div className="rounded-xl border border-primary-border bg-primary-soft px-4 py-4 text-center">
              <p className="text-sm font-medium text-ink-900">เลือกลูกค้าก่อนสร้างเอกสาร</p>
              <p className="mt-1 text-xs text-cool-500">ระบบจะใช้ข้อมูลลูกค้าในเอกสารและการคำนวณภาษี</p>
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
                <StepHeading number={2} title="วันที่ออกเอกสาร" />
                <p className="mt-1 text-xs text-gray-500">
                  ค่าเริ่มต้นเป็นวันนี้ และเปลี่ยนได้เมื่อต้องการออกย้อนหลัง
                </p>
              </div>
              {!isIssueDateToday && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                  ย้อนหลัง
                </span>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-line-soft bg-paper-field px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-gray-500">วันที่ที่ใช้บนเอกสาร</div>
                    <div className="mt-1 text-sm font-semibold text-ink-900">{formatBuddhistDate(issueDate)}</div>
                  </div>
                  <div className="flex gap-2">
                    {!isIssueDateToday && (
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
                      onClick={() => setIssueDate(addDaysString(issueDate, 1))}
                      className="rounded-lg border border-cool-200 px-3 py-2 text-xs font-medium text-cool-500 transition-colors hover:bg-white"
                    >
                      เลือกวันถัดไป
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowIssueDatePicker((prev) => !prev)}
                      className="rounded-lg border border-cool-200 bg-white px-3 py-2 text-xs font-medium text-ink-900 transition-colors hover:bg-gray-50"
                    >
                      {showIssueDatePicker || !isIssueDateToday ? "เปลี่ยนวันที่" : "ออกย้อนหลัง"}
                    </button>
                  </div>
                </div>
                {(showIssueDatePicker || !isIssueDateToday) && (
                  <div className="mt-3 border-t border-line-faint pt-3">
                      <Input
                        id="issueDate"
                        label="วันที่ออกเอกสาร"
                        type="date"
                        value={issueDate}
                        max={addDaysString(todayString(), 365)}
                        onChange={(e) => setIssueDate(e.target.value)}
                      />
                  </div>
                )}
              </div>
          </Card>
        )}

        <Card>
          <div className="mb-3">
            <span className="block text-sm font-medium">
              ชื่องาน / เลขที่ใบสั่งซื้อ <span className="font-normal text-gray-400">(ไม่บังคับ)</span>
            </span>
          </div>
          <PoTaskFields
            taskName={taskName}
            onTaskNameChange={setTaskName}
            customerPo={customerPo}
            onCustomerPoChange={setCustomerPo}
            taskSuggestions={referenceHistory.taskValues}
            poSuggestions={referenceHistory.poValues}
          />
        </Card>

        {isUtilityBill && (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <StepHeading number={3} title="ข้อมูลรอบบิล" />
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
                <span className="mb-1 block text-sm text-ink-900">ค่าบริการ</span>
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
                <span className="mb-1.5 block text-sm text-ink-900">รอบบิล</span>
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
                <span className="mb-1.5 block text-sm text-ink-900">มาตรวัด</span>
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

            <div className="mt-4 rounded-xl border border-line-soft bg-paper-soft px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-600">ยอดก่อนภาษี</span>
                <span className="text-base font-semibold text-ink-900">
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
            <div className="mb-3 flex items-center justify-between gap-2">
              <StepHeading number={3} title={isUtilityBill ? "รายการบนใบแจ้งหนี้" : "รายการสินค้าและบริการ"} />
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-medium text-blue-700">จำเป็น</span>
                {permissions.canManageCatalog && (
                  <button
                    type="button"
                    onClick={() => setItemCreateModal({ open: true, targetLineId: null })}
                    title="สร้างสินค้า/บริการใหม่ในแคตตาล็อก"
                    className="inline-flex items-center gap-1 rounded-lg border border-card-border bg-white px-2.5 py-1.5 text-xs font-medium text-[#5F5B54] transition-colors hover:border-[#378ADD] hover:text-[#1A56DB]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    สร้าง
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {!isUtilityBill && lineItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-cool-200 bg-paper-field px-4 py-4 text-center text-xs text-gray-400 space-y-2">
                  <div>ยังไม่มีรายการ — เพิ่มสินค้าหรือบริการโดยคลิกปุ่มด้านล่าง</div>
                  {selectedCustomer && !documentId && (
                    <button
                      type="button"
                      onClick={loadLatestInvoiceLines}
                      disabled={loadingLastInvoice}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#378ADD] hover:underline disabled:opacity-50"
                    >
                      {loadingLastInvoice ? "กำลังโหลด..." : "ใช้รายการจากใบแจ้งหนี้ล่าสุดของลูกค้านี้"}
                    </button>
                  )}
                </div>
              )}
              {lineItems.map((item, idx) => {
                const matchedItem = item.item_id ? items.find((catalogItem) => catalogItem.id === item.item_id) : null;
                const soldByCarton = isCartonUnitSelected(item);
                const baseQuantity = getLineBaseQuantity(item);
                const jobDetailsEnabled = jobDetailsFeatureEnabled && matchedItem?.item_type === "service" && matchedItem.has_job_details;
                const jobDetailFields = matchedItem?.id
                  ? serviceJobDetailFields[matchedItem.id] || DEFAULT_JOB_DETAIL_FIELDS
                  : DEFAULT_JOB_DETAIL_FIELDS;
                const jobDetailsSummary = getJobDetailsSummary(item, jobDetailFields);
                const enabledJobDetailFields = jobDetailFields.filter((field) => field.is_enabled);
                const filledJobDetailFields = enabledJobDetailFields.filter((field) => {
                  if (field.field_type === "dimension") {
                    const dimension = getJobDetailDimension(item, field.field_key);
                    return Boolean(dimension.width.trim() || dimension.height.trim());
                  }
                  return Boolean(getJobDetailValue(item, field.field_key).trim());
                }).length;

                if (isUtilityBill && idx === 0) {
                  const amounts = calculateLineAmounts(item);
                  const hasData = utilityServiceName.trim() || parseAmount(utilityRate) > 0;
                  return (
                    <div key={item.id} className="pb-3 border-b border-gray-100">
                      {hasData ? (
                        <div className="rounded-lg border border-card-border bg-paper-soft px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-ink-900">{item.item_name}</span>
                            <span className="text-sm font-semibold text-ink-900">
                              ฿{amounts.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="mt-1.5 whitespace-pre-line text-xs leading-5 text-ink-600">
                            {getUtilityDisplayNote(item.line_note)}
                          </div>
                          <div className="mt-1.5 text-[11px] text-gray-500">
                            {item.quantity.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {item.unit} × ฿{item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}/หน่วย
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-card-border bg-paper-field px-3 py-3 text-center text-xs text-gray-400">
                          กรุณากรอกข้อมูลรอบบิลด้านบน ระบบจะแสดงตัวอย่างรายการที่นี่
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                <div key={item.id} className="pb-3 border-b border-gray-100 last:border-0">
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-primary-soft border border-primary-border flex items-center justify-center text-[11px] font-semibold text-primary leading-none">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1 mb-2">
                      <div className="flex-1 min-w-0">
                      <CatalogAutocomplete
                        items={items}
                        value={item.item_name}
                        onChange={(val) => updateLineItem(item.id, "item_name", val)}
                        onSelect={(catalogItem) => selectCatalogItem(item.id, catalogItem)}
                        matched={!!item.item_id}
                        placeholder="พิมพ์ชื่อสินค้าหรือบริการ..."
                        onCreate={async (input) => {
                          try {
                            return await addItem(input);
                          } catch (err: unknown) {
                            setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
                            throw err;
                          }
                        }}
                        onFullCreate={
                          permissions.canManageCatalog
                            ? () => setItemCreateModal({ open: true, targetLineId: item.id })
                            : undefined
                        }
                      />
                      </div>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.id)}
                          aria-label="ลบรายการ"
                          title="ลบรายการ"
                          className="flex-shrink-0 mt-0.5 text-gray-400 transition-colors hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  {isUtilityBill && item.line_note.includes("[USAGE_BILL]") ? (
                    <div className="mb-2 whitespace-pre-line rounded-lg border border-card-border bg-paper-field px-3 py-2 text-xs leading-5 text-ink-600">
                      {getUtilityDisplayNote(item.line_note)}
                    </div>
                  ) : jobDetailsEnabled ? (
                    <div className="mb-2 rounded-lg border border-card-border bg-paper-field px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleJobDetails(item.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-cool-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-900 transition-colors hover:border-primary hover:text-primary"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            {jobDetailsSummary ? "แก้ไขรายละเอียดงาน" : "เพิ่มรายละเอียดงาน"}
                          </button>
                        <span className="max-w-full truncate text-[11px] text-ink-600">
                          {filledJobDetailFields}/{enabledJobDetailFields.length} ช่อง
                          {jobDetailsSummary ? ` · ${jobDetailsSummary}` : " · ยังไม่มีรายละเอียด"}
                        </span>
                      </div>
                      {item.job_details_open && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {matchedItem?.id ? (
                            jobDetailFields.map((field) => {
                              if (field.field_type === "dimension") {
                                const { width, height } = getJobDetailDimension(item, field.field_key);
                                return (
                                  <div key={field.field_key}>
                                    <span className="mb-1 block text-xs font-medium text-gray-700">{field.label}</span>
                                    <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                                      <input
                                        type="number"
                                        min="0"
                                        value={width}
                                        onChange={(event) => updateJobDetail(item.id, `${field.field_key}_width`, event.target.value)}
                                        placeholder="24"
                                        className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                      />
                                      <span className="text-xs text-gray-400">x</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={height}
                                        onChange={(event) => updateJobDetail(item.id, `${field.field_key}_height`, event.target.value)}
                                        placeholder="35"
                                        className="w-full rounded-lg border border-card-border bg-white px-3 py-2 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                      />
                                      <select
                                        value={getJobDetailValue(item, `${field.field_key}_unit`) || field.default_unit || "มม."}
                                        onChange={(e) => updateJobDetail(item.id, `${field.field_key}_unit`, e.target.value)}
                                        className="rounded-lg border border-card-border bg-white px-2 py-1.5 text-[11px]"
                                      >
                                        <option value="มม.">มม.</option>
                                        <option value="ซม.">ซม.</option>
                                        <option value="นิ้ว">นิ้ว</option>
                                        <option value="เมตร">เมตร</option>
                                      </select>
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
                      className="mb-2 w-full rounded-lg border border-card-border bg-white px-3 py-2 text-xs text-ink-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  )}
                  {type === "quotation" && (
                    <LineImageUpload
                      userId={userId!}
                      imageKey={item.image_url || null}
                      onKeyChange={(key: string | null) => updateLineItem(item.id, "image_url", key ?? "")}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-2 items-start sm:flex sm:gap-1">
                    <label className="col-span-1 block sm:w-[160px]">
                      <span className="text-2xs text-gray-400 block mb-0.5">จำนวน</span>
                      <CommaInput
                        value={item.quantity}
                        onChange={(v) => updateLineItem(item.id, "quantity", v)}
                        placeholder="1"
                      />
                    </label>
                    <label className="col-span-1 block sm:w-[72px]">
                      <span className="text-2xs text-gray-400 block mb-0.5">หน่วย</span>
                      <Input
                        placeholder="ชิ้น"
                        value={item.unit}
                        onChange={(e) => updateLineItem(item.id, "unit", e.target.value)}
                        className="w-full"
                      />
                    </label>
                    <label className="col-span-1 block sm:w-[160px]">
                      <span className="text-2xs text-gray-400 block mb-0.5">ราคา/หน่วย</span>
                      <CommaInput
                        value={item.unit_price}
                        onChange={(v) => updateLineItem(item.id, "unit_price", v)}
                        placeholder="0"
                      />
                    </label>
                    <label className="col-span-1 block sm:w-[68px]">
                      <span className="text-2xs text-gray-400 block mb-0.5">ส่วนลด %</span>
                      <CommaInput
                        value={item.discount_percent ?? 0}
                        onChange={(v) => updateLineItem(item.id, "discount_percent", v)}
                        placeholder="0"
                      />
                    </label>
                    <div className="col-span-2 flex items-center justify-between text-right sm:flex-1 sm:min-w-[70px] sm:block sm:pt-[16px]">
                      <div className="text-xs font-medium text-gray-700">
                        ฿{calculateLineAmounts(item).lineTotal.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                      {item.unit_price > 0 && item.quantity > 0 && (
                        <div className="text-2xs text-gray-400 leading-tight">
                          {item.unit_price.toLocaleString()} × {item.quantity.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  {hasCartonOption(item) && (
                    <div className="mt-2 rounded-lg border border-line-faint bg-paper-field px-3 py-2 text-xs text-gray-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateLineUnit(item.id, item.base_unit)}
                          className={`rounded-full px-2.5 py-1 transition-colors ${
                            !soldByCarton ? "bg-ink-900 text-white" : "bg-white text-gray-600 border border-cool-200"
                          }`}
                        >
                          ขายเป็น {item.base_unit}
                        </button>
                        <button
                          type="button"
                          onClick={() => item.carton_unit && updateLineUnit(item.id, item.carton_unit)}
                          className={`rounded-full px-2.5 py-1 transition-colors ${
                            soldByCarton ? "bg-ink-900 text-white" : "bg-white text-gray-600 border border-cool-200"
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
                  </div>
                </div>
                );
              })}
              <button
                type="button"
                onClick={addLineItem}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-soft border border-primary-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft transition-colors active:translate-y-[1px]"
              >
                <PlusCircle className="h-4 w-4" />
                เพิ่มสินค้าหรือบริการ
              </button>
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
          </Card>
        )}

        {isBillingNote && (
          <Card>
            <div className="mb-3"><StepHeading number={3} title="ใบแจ้งหนี้ที่ยังไม่ได้ชำระ" /></div>
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

        <Card>
          <button
            type="button"
            onClick={() => setShowAdditionalDetails((current) => !current)}
            aria-expanded={showAdditionalDetails}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-sm font-medium">4. รายละเอียดเพิ่มเติม (VAT, หัก ณ ที่จ่าย และหมายเหตุ)</span>
              {!showAdditionalDetails && (
                <span className="mt-0.5 block text-[11px] text-gray-500">
                  VAT {vatRate}% · หัก ณ ที่จ่าย {WHT_RATE_OPTIONS.find((o) => o.value === whtRate)?.label ?? whtRate} · {note.trim() ? "มีหมายเหตุ" : "ไม่มีหมายเหตุ"}
                </span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${showAdditionalDetails ? "rotate-180" : ""}`} />
          </button>
          {showAdditionalDetails && <div className="mt-3 space-y-3">
            {vatRegistered && (
              <Input
                label="อัตรา VAT (%)"
                type="number"
                step="0.01"
                value={vatRate}
                disabled
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
          </div>}
        </Card>

        {isDeliveryNote && (
          <DocumentOptionsCard>
            {(!isBlankForm || hideAmountsOnPrint) && (
            <DocumentOptionRow
              label="ซ่อนจำนวนเงินใน PDF"
              badge="ซ่อนยอดเงินเมื่อพิมพ์"
              description="เมื่อเปิดใช้งาน PDF ใบส่งของจะแสดงเฉพาะชื่อสินค้า จำนวน และหน่วย โดยไม่แสดงราคา ส่วนลด และยอดรวม"
              checked={hideAmountsOnPrint}
              onChange={(checked) => {
                if (!checked) {
                  const ok = window.confirm("การแสดงจำนวนเงินใน PDF ใบส่งของจะทำให้ผู้รับเห็นราคาและยอดรวม คุณแน่ใจหรือไม่?");
                  if (!ok) return;
                }
                setHideAmountsOnPrint(checked);
              }}
            />
            )}
            {(!hideAmountsOnPrint || isBlankForm) && (
            <DocumentOptionRow
              label="ออกเป็นฟอร์มเปล่า (กรอกด้วยมือ)"
              badge="พิมพ์แล้วส่งพนักงานไปกรอก"
              description="เมื่อเปิดใช้งาน ช่องจำนวนและราคาใน PDF ใบส่งของจะเว้นว่างไว้ให้พนักงานส่งของเขียนด้วยมือ จากนั้นให้คุณนำตัวเลขมาบันทึกในระบบอีกครั้งเมื่อได้รับใบส่งของคืน"
              checked={isBlankForm}
              onChange={setIsBlankForm}
            />
            )}
          </DocumentOptionsCard>
        )}

        <div className="sticky bottom-3 z-10 rounded-xl bg-page-bg/95 pb-2 pt-1 backdrop-blur">
          <div className="mb-2 flex items-end justify-between gap-3 px-1">
            <div>
              <div className="text-sm font-medium text-ink-900">5. ตรวจสอบและบันทึก</div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                {selectedCustomer?.name || "ยังไม่ได้เลือกลูกค้า"} · {isBillingNote ? `${selectedInvoiceIds.size} ใบแจ้งหนี้` : `${lineItems.filter((line) => line.item_name.trim()).length} รายการ`}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-2xs text-gray-500">ยอดสุทธิ</div>
              <div className="text-base font-semibold tabular-nums text-ink-900">฿{tax.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
          {!experience.isSimpleMode && <EditableDocNumber
            value={docNumberOverride}
            onChange={setDocNumberOverride}
            placeholder="เลขที่เอกสาร (เว้นว่าง = สร้างอัตโนมัติ)"
            autoGenerate={async () => await resolveDocNumber(userId!, type, issueDate)}
            className="mb-3"
          />}

          <Button className="w-full" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? "กำลังบันทึก..." : isEditingDraft ? "บันทึกร่าง" : experience.isSimpleMode ? "บันทึกร่าง" : "ตรวจสอบและบันทึก"}
          </Button>
        </div>


        <Modal open={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="ยืนยันการบันทึก">
          <div className="space-y-4">
            <div className="rounded-lg border border-card-border bg-paper-field p-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">ประเภท</span><span className="font-medium text-ink-900">{DOC_TYPE_LABELS[type]?.th || type}</span></div>
              <div className="flex justify-between mt-1.5"><span className="text-gray-500">เลขที่เอกสาร</span><span className="font-medium text-ink-900">{docNumberOverride.trim() || "สร้างอัตโนมัติ"}</span></div>
              <div className="flex justify-between mt-1.5">
                <span className="text-gray-500">วันที่ออกเอกสาร</span>
                <span className="font-medium text-ink-900">
                  {formatBuddhistDate(issueDate)}
                  {!isIssueDateToday && (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">{issueDate > todayString() ? "ล่วงหน้า" : "ย้อนหลัง"}</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between mt-1.5"><span className="text-gray-500">ลูกค้า</span><span className="font-medium text-ink-900 text-right">{selectedCustomer?.name}</span></div>
            </div>

            {duplicateWarning && duplicateWarning.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <p className="font-medium">พบใบแจ้งหนี้ที่อาจซ้ำกัน — โปรดตรวจสอบก่อนบันทึก</p>
                <ul className="mt-1 list-disc ml-4">
                  {duplicateWarning.map((line) => (<li key={line}>{line}</li>))}
                </ul>
              </div>
            )}

            {isBillingNote ? (
              <div className="rounded-lg border border-card-border p-3 text-sm">
                <div className="text-[11px] uppercase tracking-[0.12em] text-gray-500">ใบแจ้งหนี้ที่รวม ({selectedInvoiceIds.size})</div>
              </div>
            ) : (
              <div className="rounded-lg border border-card-border p-3 text-sm">
                <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-gray-500">รายการ ({lineItems.filter((li) => li.item_name.trim()).length})</div>
                <div className="space-y-2">
                  {lineItems.filter((li) => li.item_name.trim()).map((li) => (
                    <div key={li.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink-900">{li.item_name}</div>
                        <div className="text-[11px] text-gray-500">{li.quantity} {li.unit || li.base_unit} × ฿{li.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div className="shrink-0 font-medium text-ink-900">฿{lineItemAmount(li).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-card-border bg-paper-field p-3 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-gray-500">ก่อน VAT</span><span className="font-medium text-ink-900">฿{tax.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              {vatRegistered && tax.vatAmount > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">VAT {vatRate}%</span><span className="font-medium text-ink-900">฿{tax.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              )}
              {vatRegistered && tax.vatAmount > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">ยอดรวม</span><span className="font-medium text-ink-900">฿{(tax.subtotal + tax.vatAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              )}
              {tax.whtAmount > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">หัก ณ ที่จ่าย</span><span className="font-medium text-danger">-฿{tax.whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              )}
              <div className="flex justify-between border-t border-card-border pt-1.5 mt-1.5"><span className="text-gray-700 font-medium">ยอดสุทธิ</span><span className="font-semibold text-ink-900">฿{tax.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowConfirmModal(false)} disabled={saving}>ยกเลิก</Button>
              <Button onClick={executeSave} loading={saving}>{"บันทึก"}</Button>
            </div>
          </div>
        </Modal>

        <ItemCreateModal
          open={itemCreateModal.open}
          onClose={() => setItemCreateModal({ open: false, targetLineId: null })}
          onCreated={handleFullCreateItem}
        />
      </div>
    </AppShell>
  );
}
