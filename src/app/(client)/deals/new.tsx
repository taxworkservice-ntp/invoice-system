import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, Navigate } from "react-router-dom";
import { useClientProfile, useWorkspaceRole } from "../../../hooks/useAuth";
import { useCustomers } from "../../../hooks/useCustomers";
import { useItems } from "../../../hooks/useItems";
import { useClientFeatures } from "../../../hooks/useClientFeatures";
import { useToast } from "../../../hooks/useToast";
import { AppShell } from "../../../components/layout/AppShell";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { Card } from "../../../components/ui/Card";
import {
  DocumentOptionsCard,
  DnAmountDisplayPicker,
  type DnAmountDisplay,
} from "../../../components/documents/DocumentOptions";
import {
  FormProgress,
  FormStep,
  FormStepRail,
  StepHeading,
  useScrollSpy,
  type FormProgressStep,
} from "../../../components/documents/FormStep";
import { Modal } from "../../../components/ui/Modal";
import { CatalogAutocomplete } from "../../../components/CatalogAutocomplete";
import { ItemCreateModal } from "../../../components/catalog/ItemCreateModal";
import { NextStepBanner, type NextStepState } from "../../../components/documents/NextStepBanner";
import { PoTaskFields } from "../../../components/documents/PoTaskFields";
import { Switch } from "../../../components/ui/Switch";
import { calculateLineAmounts, calculateTax } from "../../../lib/tax";
import {
  DN_SECTION_TAG,
  countSectionItems,
  findInsertIndexAboveLine,
  findSectionEndIndex,
  getDnSectionDisplayNumbers,
  getDnSectionMarkersWithoutChildren,
  getLegacyDnHeaderForConversion,
  isDnSectionMarker,
} from "../../../lib/dnGroups";
import {
  PRINT_TITLE_PRESETS,
  readLastPrintTitleVariant,
  writeLastPrintTitleVariant,
} from "../../../lib/docLabels";
import {
  DnSectionMarkerRow,
  LineMoveButtons,
} from "../../../components/documents/DnSectionMarkerRow";
import { CustomerPickerModal } from "../../../components/customers/CustomerPickerModal";
import { Spinner } from "../../../components/ui/Spinner";
import { supabase } from "../../../lib/supabase";
import { getDocNumberErrorMessage, resolveDocNumber } from "../../../lib/docNumber";
import { resolveCreation } from "../../../lib/docCreation";
import { focusLineInput, moveLine, removeLine } from "../../../lib/lineDraft";
import { NumericInput } from "../../../components/ui/NumericInput";
import { isDiscountEnabled } from "../../../lib/discounts";
import type { DocumentLine } from "../../../lib/documentLine";
import {
  countPendingPriceReviews,
  countReviewableLines,
  findNextPendingPriceReview,
  hasCartonOption,
  isCartonUnitSelected,
  isPriceReviewRequired,
  lineBaseQuantity as getLineBaseQuantity,
  priceDeviation,
  suggestedUnitPrice as getSuggestedUnitPrice,
} from "../../../lib/documentLine";
import {
  businessTodayString,
  localTodayString,
  monthStartString as getMonthStartString,
} from "../../../lib/devDate";
import { useDocDate } from "../../../components/YearEraProvider";
import { restoreStockOnVoid } from "../../../lib/stock";
import {
  DEFAULT_JOB_DETAIL_FIELDS,
  getJobDetailFieldLabel,
  normalizeJobDetailFields,
  normalizeJobDetailsNote,
  type JobDetailFieldConfig,
} from "../../../lib/jobDetails";
import { LineImageUpload } from "../../../components/documents/LineImageUpload";
import { getWorkspaceExperience, getWorkspacePermissions } from "../../../lib/permissions";
import { useCustomerReferenceHistory } from "../../../hooks/useCustomerReferenceHistory";
import { DOC_TYPE_LABELS, WHT_RATE_OPTIONS, VAT_DEFAULT } from "../../../constants";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Heading,
  PlusCircle,
  X,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { priceHintKey, usePriceHints } from "../../../hooks/usePriceHints";
import { PriceHistorySheet } from "../../../components/documents/PriceHistorySheet";
import { PriceHint } from "../../../components/documents/PriceHint";
import { LineItemEditorModal } from "../../../components/documents/LineItemEditorModal";
import { EditableDocNumber } from "../../../components/documents/EditableDocNumber";
import type {
  Document,
  DocumentLineItem,
  DocumentType,
  DocumentStatus,
  Customer,
  WhtRate,
  Item,
  ItemJobDetailField,
  ItemJobDetailPreset,
  JobDetailPresetField,
} from "../../../types";

/** This form's line: the shared line plus its job-detail and carton drafting fields. */
interface LineItemForm extends DocumentLine {
  base_unit: string;
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
  // When the input exactly matches a preset (i.e. a value was already
  // selected), show the full list on reopen instead of filtering down
  // to just the selected value — otherwise the dropdown looks empty /
  // stuck until the user deletes the text.
  const isExactMatch = presets.some((preset) => preset.toLowerCase() === normalizedValue);
  const filteredPresets =
    normalizedValue && !isExactMatch
      ? presets.filter((preset) => preset.toLowerCase().includes(normalizedValue))
      : presets;
  const showPanel = open && filteredPresets.length > 0;

  return (
    <label className="relative block">
      <span className="mb-1 block text-label font-medium text-ink-700">{label}</span>
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
          className="w-full rounded-control border border-card-border bg-white py-2 pl-3 pr-8 text-label text-ink-900 placeholder:text-ink-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {presets.length > 0 && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpen((current) => !current)}
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-400 transition-colors hover:bg-paper-field hover:text-ink-900"
            aria-label={`แสดงตัวเลือก${label}`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-control border border-line bg-white">
          <div className="max-h-44 overflow-y-auto py-1">
            {filteredPresets.map((preset) => {
              const selected = preset === value;
              return (
                <div
                  key={preset}
                  className={`group flex items-center justify-between gap-2 px-2 py-1.5 text-label ${selected ? "bg-primary-soft text-primary-deep" : "bg-white text-ink-900 hover:bg-paper-field"}`}
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
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-400 transition-colors hover:bg-red-50 hover:text-red-500"
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
    price_confirmed: false,
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
    isSectionMarker: false,
  };
}

function createSectionMarker(header: string): LineItemForm {
  return {
    ...createEmptyLine(),
    item_name: header,
    line_note: DN_SECTION_TAG,
    unit: "",
    base_unit: "",
    unit_price: 0,
    quantity: 0,
    discount_percent: 0,
    price_confirmed: true,
    hide_amounts_on_print: false,
    isSectionMarker: true,
  };
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

/** Delivery-note print modes — how much money the PDF shows. Copy lives in DocumentOptions. */
type AmountDisplay = DnAmountDisplay;

function applyCatalogItemToLine(
  lineItem: LineItemForm,
  catalogItem: Item,
  jobDetailsFeatureEnabled: boolean,
): LineItemForm {
  const unit = catalogItem.base_unit;
  const hasJobDetails =
    jobDetailsFeatureEnabled && catalogItem.item_type === "service" && catalogItem.has_job_details;
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
    // Newly inherited catalog price — officer must review it again.
    price_confirmed: false,
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
  if (lineItem.job_detail_values[fieldKey] !== undefined)
    return lineItem.job_detail_values[fieldKey];
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
        const unit =
          lineItem.job_detail_values[`${field.field_key}_unit`] || field.default_unit || "มม.";
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
        const unit =
          lineItem.job_detail_values[`${field.field_key}_unit`] || field.default_unit || "มม.";
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
  const docDate = useDocDate();
  const isClassicMode = searchParams.get("mode") === "classic";
  const requestedType = initialType || searchParams.get("type") || "quotation";
  const isUtilityBill = requestedType === "utility_bill";
  const type = (isUtilityBill ? "invoice" : requestedType) as DocumentType;
  const isEditingDraft = Boolean(documentId);
  const label =
    isEditingDraft && type === "invoice"
      ? "แก้ไขร่างใบแจ้งหนี้"
      : isEditingDraft && type === "quotation"
        ? "แก้ไขร่างใบเสนอราคา"
        : isEditingDraft && type === "delivery_note"
          ? "แก้ไขร่างใบส่งของ"
          : isUtilityBill
            ? "ออกบิลประจำรอบ"
            : DOC_TYPE_LABELS[type]?.th || "เอกสารใหม่";
  const isDeliveryNote = type === "delivery_note";
  const isLineItemDocument = type === "quotation" || type === "invoice" || isDeliveryNote;

  const { profile, workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const experience = getWorkspaceExperience(workspaceRole, permissions);
  // Self-guard: this page only hosts the deal-form modes. Anything else
  // (billing note, conversion forms, unknown values) is redirected to the
  // screen that actually owns it — see src/lib/docCreation.ts.
  const creation = resolveCreation({
    type: requestedType,
    params: searchParams,
    experience,
  });
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const { hasFeature } = useClientFeatures(userId);
  const { customers, loading: customersLoading, addCustomer } = useCustomers(userId);
  const { items, addItem, refetch: refetchItems } = useItems(userId);
  const jobDetailsFeatureEnabled = hasFeature("service_job_details");
  // Owner-configurable threshold (ตั้งค่า › รูปแบบเอกสาร): warn when a typed
  // unit price deviates from catalog by more than this %. 0 = off.
  const priceWarnPct = clientProfile?.price_deviation_warn_pct ?? 10;
  // Mandatory DN price review (opt-in per client, default off).
  const requireDnPriceReview = clientProfile?.require_dn_price_review === true;
  const businessToday = businessTodayString(clientProfile);
  const todayString = () => businessToday;

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  // In-form full catalog creation (ItemCreateModal): targetLineId = the line
  // whose picker opened it (auto-select into that line), or null = the
  // section-level "+ สร้าง" button (apply to the last empty line, else append).
  const [itemCreateModal, setItemCreateModal] = useState<{
    open: boolean;
    targetLineId: string | null;
  }>({
    open: false,
    targetLineId: null,
  });

  const [lineItems, setLineItems] = useState<LineItemForm[]>([]); // Price-history ("ราคาที่เคยขาย"): which line's sheet is open, plus a
  // cache of last-price hints keyed `${itemId}|${customerId ?? "-"}`.
  const [priceHistoryLineId, setPriceHistoryLineId] = useState<string | null>(null);
  // Read-only rows + one shared line editor: which line is open, and which
  // lines are still new (an untouched new line is dropped on close).
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const newLineIdsRef = useRef<Set<string>>(new Set());
  // Last-price hints (เคยขาย…) — shared with the delivery-note form.
  const priceHints = usePriceHints({
    userId,
    customerId: selectedCustomer?.id ?? null,
    itemIds: lineItems.map((line) => line.item_id),
    excludeDocumentId: documentId || null,
    enabled: isLineItemDocument,
  });
  const [serviceJobDetailFields, setServiceJobDetailFields] = useState<
    Record<string, JobDetailFieldConfig[]>
  >({});
  // Known job-detail labels (defaults + every loaded custom config) — used to
  // self-heal legacy blob notes back into one-field-per-line on restore.
  const knownJobDetailLabels = useMemo(() => {
    const labels = new Set(DEFAULT_JOB_DETAIL_FIELDS.map((f) => f.label));
    for (const fields of Object.values(serviceJobDetailFields)) {
      for (const f of fields) {
        if (f.label) labels.add(f.label);
      }
    }
    return [...labels];
  }, [serviceJobDetailFields]);
  const [serviceJobDetailPresets, setServiceJobDetailPresets] = useState<
    Record<string, JobDetailSuggestions>
  >({});
  const [vatRegistered, setVatRegistered] = useState(clientProfile?.vat_registered ?? false);
  const [vatRate, setVatRate] = useState<number>(clientProfile?.vat_rate ?? VAT_DEFAULT);
  const [whtRate, setWhtRate] = useState<WhtRate>(clientProfile?.default_wht_rate ?? "0");
  const [documentDiscountPercent, setDocumentDiscountPercent] = useState(0);
  const [issueDate, setIssueDate] = useState("");

  const [note, setNote] = useState("");
  // Optional PO reference + task name, printed on the document (classic V2).
  const [customerPo, setCustomerPo] = useState("");
  const [taskName, setTaskName] = useState("");
  // Caption shown when an old draft's single SO header was converted into a
  // section-marker line on load (forms no longer write dn_so_header).
  const [legacyHeaderConverted, setLegacyHeaderConverted] = useState(false);
  // Section grouping is opt-in per DN (default off = today's flat flow).
  // UI-only state, initialized from data — never persisted on its own.
  const [groupingEnabled, setGroupingEnabled] = useState(false);
  // Distinct past values for this customer — recurring jobs become pick-not-type.
  const referenceHistory = useCustomerReferenceHistory(selectedCustomer?.id || null);
  const [utilityServiceItemId, setUtilityServiceItemId] = useState<string | null>(null);
  const [utilityServiceName, setUtilityServiceName] = useState("");
  const [utilityUnit, setUtilityUnit] = useState("หน่วย");
  const [utilityPeriodStart, setUtilityPeriodStart] = useState(() =>
    getMonthStartString(businessTodayString(clientProfile)),
  );
  const [utilityPeriodEnd, setUtilityPeriodEnd] = useState(() =>
    businessTodayString(clientProfile),
  );
  const [utilityPreviousReading, setUtilityPreviousReading] = useState("");
  const [utilityCurrentReading, setUtilityCurrentReading] = useState("");
  const [utilityRate, setUtilityRate] = useState("");
  const [utilityLastHint, setUtilityLastHint] = useState<string | null>(null);
  const [loadingUtilityLast, setLoadingUtilityLast] = useState(false);
  // Required DN amount-display mode; null = not chosen yet (workspace default unset).
  // Required amount-display mode — never pre-selected. The officer picks
  // explicitly on every delivery note (draft edits hydrate the saved mode).
  const [amountDisplay, setAmountDisplay] = useState<AmountDisplay | null>(null);
  // Pending hidden→full switch awaiting modal confirmation (reveals prices to
  // the recipient — never a silent switch).
  const [pendingAmount, setPendingAmount] = useState<AmountDisplay | null>(null);
  // Turns the picker's hint red only after a save was attempted with no choice.
  const [amountDisplaySubmitAttempted, setAmountDisplaySubmitAttempted] = useState(false);
  const hideAmountsOnPrint = amountDisplay === "hidden";
  const isBlankForm = amountDisplay === "blank";
  // Mandatory DN price review (workspace setting) — real delivery notes only.
  const dnPriceReviewRequired =
    isDeliveryNote && isPriceReviewRequired({ requireDnPriceReview, isBlankForm });
  // Only named product lines count — section markers carry no price, and
  // unnamed placeholder rows are not reviewable yet (matches the save gate).
  const priceReviewableCount = dnPriceReviewRequired ? countReviewableLines(lineItems) : 0;
  const pendingPriceReviewCount = dnPriceReviewRequired
    ? countPendingPriceReviews(lineItems)
    : 0;

  function goToNextUnconfirmedPrice() {
    const target = findNextPendingPriceReview(lineItems);
    if (!target) return;
    // Rows are read-only now: open the editor so the confirm control is in
    // front of the officer, and scroll the row into view behind it.
    setEditingLineId(target.id);
    const el = document.getElementById(`dn-line-${target.id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("rounded-control", "ring-2", "ring-warning-border");
    window.setTimeout(
      () => el.classList.remove("rounded-control", "ring-2", "ring-warning-border"),
      1600,
    );
  }
  // Tax-invoice printed-header title preset ("" = standard "ใบกำกับภาษี").
  // New invoices default to the last selection (per browser); editing an
  // existing draft overrides this from its stored value below.
  const discountsEnabled = isDiscountEnabled(clientProfile);

  const [printTitleVariant, setPrintTitleVariant] = useState(() => readLastPrintTitleVariant());
  // DN full-totals is settings-only (ตั้งค่า › ใบส่งของ): new docs follow the
  // workspace setting, draft edits keep their saved value frozen at hydrate.
  const frozenShowFullTotals = useRef<boolean | null>(null);
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(false);

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
  const useAtomicCreate = !documentId && !editingDealId && isLineItemDocument;
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
    () => (jobDetailsFeatureEnabled ? serviceItems.filter((item) => item.has_job_details) : []),
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
        line_note: normalizeJobDetailsNote(line.line_note || "", knownJobDetailLabels),
        image_url: line.image_url || null,
        item_type: line.item_type,
        unit_price: line.unit_price,
        quantity: line.quantity,
        discount_percent: line.discount_percent || 0,
        unit: line.unit,
        base_unit: line.unit,
        carton_unit: line.carton_unit,
        qty_per_carton:
          line.qty_carton && line.quantity
            ? line.base_quantity
              ? line.base_quantity / line.quantity
              : null
            : null,
        base_unit_price: null,
        price_confirmed: false,
        job_details_open: false,
        job_color: "",
        job_width: "",
        job_height: "",
        job_position: "",
        job_material: "",
        job_remark: "",
        job_detail_values: {},
        hide_amounts_on_print: line.hide_amounts_on_print,
        isSectionMarker: false,
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
        const [{ data: documentData, error: documentError }, { data: lineData, error: lineError }] =
          await Promise.all([
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
        if (
          draftDoc.doc_type !== "quotation" &&
          draftDoc.doc_type !== "invoice" &&
          draftDoc.doc_type !== "delivery_note"
        ) {
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
        if (draftDoc.doc_type === "delivery_note") {
          setAmountDisplay(
            draftDoc.is_blank_form
              ? "blank"
              : draftDoc.hide_amounts_on_print === false
                ? "full"
                : "hidden",
          );
        }
        if (draftDoc.doc_type === "delivery_note" && draftDoc.show_full_totals != null) {
          frozenShowFullTotals.current = draftDoc.show_full_totals;
        }
        setPrintTitleVariant(draftDoc.print_title_variant || "");
        const hydrated: LineItemForm[] = ((lineData || []) as DocumentLineItem[]).map((line) => {
          if (draftDoc.doc_type === "delivery_note" && isDnSectionMarker(line)) {
            return {
              id: line.id || crypto.randomUUID(),
              item_id: null,
              item_sku: null,
              item_name: line.item_name,
              line_note: DN_SECTION_TAG,
              item_type: "product",
              unit_price: 0,
              quantity: 0,
              discount_percent: 0,
              unit: "",
              base_unit: "",
              carton_unit: null,
              qty_per_carton: null,
              base_unit_price: null,
              price_confirmed: true,
              job_details_open: false,
              job_color: "",
              job_width: "",
              job_height: "",
              job_position: "",
              job_material: "",
              job_remark: "",
              job_detail_values: {},
              hide_amounts_on_print: false,
              isSectionMarker: true,
            };
          }
          return {
            id: line.id || crypto.randomUUID(),
            item_id: line.item_id,
            item_sku: line.item_sku,
            item_name: line.item_name,
            line_note: normalizeJobDetailsNote(line.line_note || "", knownJobDetailLabels),
            item_type: line.item_type,
            unit_price: line.unit_price,
            quantity: line.quantity,
            discount_percent: line.discount_percent || 0,
            unit: line.unit,
            base_unit: line.unit,
            carton_unit: line.carton_unit,
            qty_per_carton:
              line.qty_carton && line.quantity
                ? line.base_quantity
                  ? line.base_quantity / line.quantity
                  : null
                : null,
            base_unit_price: null,
            price_confirmed: false,
            job_details_open: false,
            job_color: "",
            job_width: "",
            job_height: "",
            job_position: "",
            job_material: "",
            job_remark: "",
            job_detail_values: {},
            hide_amounts_on_print: line.hide_amounts_on_print,
            isSectionMarker: false,
          };
        });
        // Legacy single SO header becomes one marker line (forms no longer
        // write dn_so_header — the printed single group is identical).
        const legacyHeader =
          draftDoc.doc_type === "delivery_note"
            ? getLegacyDnHeaderForConversion(
                (lineData || []) as DocumentLineItem[],
                draftDoc.dn_so_header,
              )
            : null;
        if (legacyHeader) {
          hydrated.unshift(createSectionMarker(legacyHeader));
          setLegacyHeaderConverted(true);
        }
        if (legacyHeader || hydrated.some((lineItem) => lineItem.isSectionMarker)) {
          setGroupingEnabled(true);
        }
        setLineItems(hydrated);
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
        fieldsByItem[itemId] = normalizeJobDetailFields(rawFieldsByItem[itemId]).filter(
          (field) => field.is_enabled,
        );
      });

      const presetsByItem: Record<string, JobDetailSuggestions> = {};
      itemIds.forEach((itemId) => {
        presetsByItem[itemId] = {};
      });
      ((presetData || []) as ItemJobDetailPreset[]).forEach((preset) => {
        if (!presetsByItem[preset.item_id]) presetsByItem[preset.item_id] = {};
        if (!presetsByItem[preset.item_id][preset.field_key])
          presetsByItem[preset.item_id][preset.field_key] = [];
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

  // Last-price hints are fetched by `usePriceHints` (shared with the
  // delivery-note form) — see the hook beside `lineItems` above.

  async function removeServiceJobDetailPreset(
    itemId: string,
    fieldKey: JobDetailPresetField,
    value: string,
  ) {
    if (!userId) return;
    const label = getJobDetailFieldLabel(
      serviceJobDetailFields[itemId] || DEFAULT_JOB_DETAIL_FIELDS,
      fieldKey,
    );
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
          const itemName = String(line.item_name || "")
            .trim()
            .toLowerCase();
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
  }, [
    isUtilityBill,
    selectedCustomer,
    userId,
    utilityServiceItemId,
    utilityServiceName,
    selectedUtilityService,
  ]);

  useEffect(() => {
    if (!isUtilityBill) return;

    const previous = parseAmount(utilityPreviousReading);
    const current = parseAmount(utilityCurrentReading);
    const rate = parseAmount(utilityRate);
    const usage = Math.max(0, Math.round((current - previous) * 1000) / 1000);
    const serviceName = utilityServiceName.trim() || "ค่าบริการประจำรอบ";
    const catalogService =
      selectedUtilityService ||
      serviceItems.find((item) => item.name.trim().toLowerCase() === serviceName.toLowerCase()) ||
      null;
    const unit = utilityUnit.trim() || catalogService?.base_unit || "หน่วย";
    const lineNote = [
      "[USAGE_BILL]",
      `รอบบิล: ${utilityPeriodStart || "-"} - ${utilityPeriodEnd || "-"}`,
      `เลขก่อนหน้า: ${utilityPreviousReading || "0"}`,
      `เลขปัจจุบัน: ${utilityCurrentReading || "0"}`,
      ...(utilityCurrentReading
        ? [
            `ใช้ไป: ${usage.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unit}`,
          ]
        : []),
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
    const matched = serviceItems.find(
      (item) => item.name.trim().toLowerCase() === value.trim().toLowerCase(),
    );
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

  const lineItemsWithTotals = useMemo(() => {
    return lineItems.map((lineItem) => ({
      ...lineItem,
      ...calculateLineAmounts(lineItem),
    }));
  }, [lineItems]);

  const tax = useMemo(() => {
    return calculateTax(
      lineItemsWithTotals.map((lineItem) => ({
        unit_price: lineItem.unit_price,
        quantity: lineItem.quantity,
        discount_percent: lineItem.discount_percent,
      })),
      vatRegistered,
      vatRate,
      parseFloat(whtRate),
      { discountPercent: documentDiscountPercent },
    );
  }, [
    lineItemsWithTotals,
    vatRegistered,
    vatRate,
    whtRate,
    documentDiscountPercent,
  ]);

  const utilityValidation = useMemo(() => {
    if (!isUtilityBill)
      return { readingError: undefined, rateError: undefined, periodError: undefined };
    const previous = parseAmount(utilityPreviousReading);
    const current = parseAmount(utilityCurrentReading);
    const rate = parseAmount(utilityRate);
    return {
      readingError:
        utilityPreviousReading !== "" && utilityCurrentReading !== "" && current <= previous
          ? "เลขปัจจุบันต้องมากกว่าเลขก่อนหน้า"
          : undefined,
      rateError: utilityRate !== "" && rate <= 0 ? "กรุณาระบุราคา/หน่วยที่มากกว่า 0" : undefined,
      periodError:
        utilityPeriodStart && utilityPeriodEnd && utilityPeriodEnd < utilityPeriodStart
          ? "วันสิ้นสุดต้องมาหลังวันเริ่มต้น"
          : undefined,
    };
  }, [
    isUtilityBill,
    utilityPreviousReading,
    utilityCurrentReading,
    utilityRate,
    utilityPeriodStart,
    utilityPeriodEnd,
  ]);

  const updateLineItem = (
    id: string,
    field: keyof LineItemForm,
    value: string | number | boolean,
  ) => {
    setLineItems((prev) =>
      prev.map((lineItem) => {
        if (lineItem.id !== id) return lineItem;
        // Section markers are free text — never catalog-match their header.
        if (lineItem.isSectionMarker) return { ...lineItem, [field]: value } as LineItemForm;
        const updated = { ...lineItem, [field]: value } as LineItemForm;

        // Typing a price counts as reviewing it.
        if (field === "unit_price") {
          updated.price_confirmed = true;
        }

        if (field === "item_name") {
          const name = (value as string).trim();
          const catalogItem = items.find((c) => c.name.toLowerCase() === name.toLowerCase());
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
            updated.price_confirmed = false;
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
    const line = createEmptyLine();
    newLineIdsRef.current.add(line.id);
    setLineItems((prev) => [...prev, line]);
    setEditingLineId(line.id);
  };

  const closeLineEditor = () => {
    const id = editingLineId;
    setEditingLineId(null);
    if (!id || !newLineIdsRef.current.has(id)) return;
    newLineIdsRef.current.delete(id);
    // An untouched new line is not a line — drop it so rows never pile up empty.
    const line = lineItems.find((lineItem) => lineItem.id === id);
    if (line && !line.item_name.trim()) {
      setLineItems((prev) => removeLine(prev, id));
    }
  };

  const removeLineItem = (id: string) => {
    newLineIdsRef.current.delete(id);
    setEditingLineId((current) => (current === id ? null : current));
    setLineItems((prev) => removeLine(prev, id));
  };

  const editingLine = lineItems.find((lineItem) => lineItem.id === editingLineId) ?? null;

  const moveLineItem = (id: string, direction: "up" | "down") => {
    setLineItems((prev) => moveLine(prev, id, direction));
  };

  // Form badges mirror the printed G / G.j hierarchy whenever grouping is on.
  const lineNumbers = useMemo(
    () => (isDeliveryNote && groupingEnabled ? getDnSectionDisplayNumbers(lineItems) : null),
    [isDeliveryNote, groupingEnabled, lineItems],
  );
  const emptySectionIds = useMemo(
    () =>
      isDeliveryNote && groupingEnabled
        ? getDnSectionMarkersWithoutChildren(lineItems)
        : new Set<string>(),
    [isDeliveryNote, groupingEnabled, lineItems],
  );
  // Item ids nested under a non-blank marker — indented as a visual section.
  // Mirrors getDnSectionDisplayNumbers: a blank marker ends the run.
  const inSectionIds = useMemo(() => {
    if (!isDeliveryNote || !groupingEnabled) return new Set<string>();
    const ids = new Set<string>();
    let inSection = false;
    for (const lineItem of lineItems) {
      if (lineItem.isSectionMarker) {
        inSection = lineItem.item_name.trim() !== "";
        continue;
      }
      if (inSection) ids.add(lineItem.id);
    }
    return ids;
  }, [isDeliveryNote, groupingEnabled, lineItems]);

  const toggleGrouping = (on: boolean) => {
    // Turning off deletes the headers (with confirmation) — hidden markers
    // that still affect the printout would be worse than asking once.
    if (!on && lineItems.some((lineItem) => lineItem.isSectionMarker)) {
      const count = lineItems.filter((lineItem) => lineItem.isSectionMarker).length;
      const ok = window.confirm(
        `ปิดการจัดกลุ่มจะลบหัวข้อกลุ่มทั้ง ${count} หัวข้อ — รายการสินค้าคงอยู่ครบและเรียงต่อเนื่องแบบปกติ ยืนยันหรือไม่?`,
      );
      if (!ok) return;
      setLineItems((prev) => prev.filter((lineItem) => !lineItem.isSectionMarker));
    }
    setGroupingEnabled(on);
  };

  const addSectionMarker = () => {
    const marker = createSectionMarker("");
    setLineItems((prev) => {
      // Don't stack empty headers — finish the current one first.
      const last = prev[prev.length - 1];
      if (last && last.isSectionMarker && !last.item_name.trim()) return prev;
      return [...prev, marker];
    });
    focusLineInput(marker.id);
  };

  /** Insert a blank header directly above a line — no append-then-shuffle. */
  const insertSectionMarkerAbove = (lineId: string) => {
    const marker = createSectionMarker("");
    setLineItems((prev) => {
      const index = findInsertIndexAboveLine(prev, lineId);
      // Don't stack two blank headers — finish the current one first.
      const prevLine = prev[index - 1];
      if (prevLine && prevLine.isSectionMarker && !prevLine.item_name.trim()) return prev;
      return [...prev.slice(0, index), marker, ...prev.slice(index)];
    });
    focusLineInput(marker.id);
  };

  /** Append a blank item at the end of a marker's section. */
  const addItemToSection = (markerId: string) => {
    const line = createEmptyLine();
    newLineIdsRef.current.add(line.id);
    setLineItems((prev) => {
      const index = findSectionEndIndex(prev, markerId);
      return [...prev.slice(0, index), line, ...prev.slice(index)];
    });
    setEditingLineId(line.id);
  };

  const updateJobDetail = (id: string, field: string, value: string) => {
    setLineItems((prev) =>
      prev.map((lineItem) => {
        if (lineItem.id !== id) return lineItem;
        const matchedItem = items.find((catalogItem) => catalogItem.id === lineItem.item_id);
        const fields = matchedItem?.id
          ? serviceJobDetailFields[matchedItem.id] || DEFAULT_JOB_DETAIL_FIELDS
          : DEFAULT_JOB_DETAIL_FIELDS;
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
      return [
        ...prev,
        applyCatalogItemToLine(createEmptyLine(), created, jobDetailsFeatureEnabled),
      ];
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
        onDeletePreset={(presetValue) =>
          void removeServiceJobDetailPreset(itemId, fieldKey, presetValue)
        }
      />
    );
  };


  /**
   * The parts of a line that only this form has — job details, the quotation
   * example photo, and the "sold before at ฿x — use this price" shortcut.
   *
   * Kept as one block so the row and the shared line editor render the same
   * thing: the editor already owns name/qty/unit/price/discount/note, price
   * review and carton units.
   */
  const renderLineOptions = (item: LineItemForm): React.ReactNode => {
    const matchedItem = item.item_id
      ? items.find((catalogItem) => catalogItem.id === item.item_id)
      : null;
    const jobDetailsEnabled =
      jobDetailsFeatureEnabled && matchedItem?.item_type === "service" && matchedItem.has_job_details;
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

    return (
      <>
        {jobDetailsEnabled && (
          <div className="mb-2 rounded-control border border-card-border bg-paper-field px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => toggleJobDetails(item.id)}
                className="inline-flex items-center gap-1.5 rounded-control border border-line bg-white px-2.5 py-1.5 text-label font-medium text-ink-900 transition-colors hover:border-primary hover:text-primary"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {jobDetailsSummary ? "แก้ไขรายละเอียดงาน" : "เพิ่มรายละเอียดงาน"}
              </button>
              <span className="max-w-full truncate text-label text-ink-600">
                {filledJobDetailFields}/{enabledJobDetailFields.length} ช่อง
                {jobDetailsSummary ? ` · ${jobDetailsSummary}` : " · ยังไม่มีรายละเอียด"}
              </span>
            </div>
            {item.job_details_open && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {matchedItem?.id
                  ? jobDetailFields.map((field) => {
                      if (field.field_type === "dimension") {
                        const { width, height } = getJobDetailDimension(item, field.field_key);
                        return (
                          <div key={field.field_key}>
                            <span className="mb-1 block text-label font-medium text-ink-700">
                              {field.label}
                            </span>
                            <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                              <NumericInput
                                bare
                                value={width === "" ? null : Number(width)}
                                maxFractionDigits={0}
                                onTextChange={(text) =>
                                  updateJobDetail(item.id, `${field.field_key}_width`, text)
                                }
                                placeholder="24"
                                className="w-full rounded-control border border-card-border bg-white px-3 py-2 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              />
                              <span className="text-label text-ink-400">x</span>
                              <NumericInput
                                bare
                                value={height === "" ? null : Number(height)}
                                maxFractionDigits={0}
                                onTextChange={(text) =>
                                  updateJobDetail(item.id, `${field.field_key}_height`, text)
                                }
                                placeholder="35"
                                className="w-full rounded-control border border-card-border bg-white px-3 py-2 text-label focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              />
                              <select
                                value={
                                  getJobDetailValue(item, `${field.field_key}_unit`) ||
                                  field.default_unit ||
                                  "มม."
                                }
                                onChange={(e) =>
                                  updateJobDetail(
                                    item.id,
                                    `${field.field_key}_unit`,
                                    e.target.value,
                                  )
                                }
                                className="rounded-control border border-card-border bg-white px-2 py-1.5 text-label"
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
                  : null}
              </div>
            )}
          </div>
        )}

        {type === "quotation" && (
          <LineImageUpload
            userId={userId!}
            imageKey={item.image_url || null}
            onKeyChange={(key: string | null) => updateLineItem(item.id, "image_url", key ?? "")}
          />
        )}
      </>
    );
  };

  /** Read-only row summary for a job-detail service line ("" when not one). */  const jobDetailsSummaryFor = (item: LineItemForm): string => {
    if (!jobDetailsFeatureEnabled) return "";
    const matchedItem = item.item_id ? items.find((catalogItem) => catalogItem.id === item.item_id) : null;
    if (!(matchedItem?.item_type === "service" && matchedItem.has_job_details)) return "";
    const fields = matchedItem.id
      ? serviceJobDetailFields[matchedItem.id] || DEFAULT_JOB_DETAIL_FIELDS
      : DEFAULT_JOB_DETAIL_FIELDS;
    return getJobDetailsSummary(item, fields);
  };

  /** "Sold to this customer before at ฿x — use this price" shortcut. */
  const renderPriceHint = (item: LineItemForm): React.ReactNode => {
    const hintKey = priceHintKey(item.item_id, selectedCustomer?.id ?? null);
    const priceHint = hintKey ? (priceHints[hintKey] ?? null) : null;
    if (!priceHint) return null;
    return (
      <PriceHint
        hint={priceHint}
        currentPrice={item.unit_price}
        confirmsPrice={dnPriceReviewRequired}
        onApply={() => updateLineItem(item.id, "unit_price", priceHint.price)}
      />
    );
  };

  const handleSave = async () => {
    if (!selectedCustomer || !userId) return;

    setError(null);

    if (!permissions.canCreateEditDocuments) {
      setError("คุณไม่มีสิทธิ์จัดทำเอกสาร");
      return;
    }
    if (
      experience.isSimpleMode &&
      !experience.canShowAdvancedDealOptions &&
      !["quotation", "delivery_note"].includes(requestedType)
    ) {
      setError("งานประเภทนี้ต้องให้ผู้จัดการเป็นผู้จัดทำ");
      return;
    }
    // No-default date: the officer must pick explicitly (pre-filled dates get skipped).
    if (!issueDate) {
      setError("กรุณาเลือกวันที่ออกเอกสาร");
      scrollToId("deal-date");
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
      if (isDeliveryNote) {
        // Section markers carry no goods — every header needs its text,
        // and markers alone are not a delivery.
        if (lineItems.some((lineItem) => lineItem.isSectionMarker && !lineItem.item_name.trim())) {
          setError("กรุณากรอกข้อความหัวข้อกลุ่มให้ครบทุกหัวข้อ");
          return;
        }
        if (!validItems.some((lineItem) => !lineItem.isSectionMarker)) {
          setError("กรุณาเพิ่มอย่างน้อย 1 รายการสินค้า");
          return;
        }
      }
      // Required print mode: the owner can leave the workspace default unset
      // to force a deliberate choice on every delivery note.
      if (isDeliveryNote && amountDisplay == null) {
        setAmountDisplaySubmitAttempted(true);
        setError("กรุณาเลือกการแสดงจำนวนเงินใน PDF ก่อนบันทึก");
        return;
      }
      // Mandatory DN price review (opt-in): block save until every line
      // price is confirmed. Blank-form DNs carry no prices — exempt.
      // Section markers carry no price — exempt.
      if (isDeliveryNote && requireDnPriceReview && !isBlankForm) {
        const pending = countPendingPriceReviews(validItems);
        if (pending > 0) {
          setError(`กรุณายืนยันราคาทุกรายการก่อนบันทึกใบส่งของ (เหลือ ${pending} รายการ)`);
          return;
        }
      }
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
            matches.map((m) => `${m.doc_number} (${docDate.date(m.issue_date)})`),
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
      if (!documentId && !useAtomicCreate) {
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
      const docNumber = await resolveDocNumber(
        userId,
        type,
        documentIssueDate,
        docNumberOverride,
        documentId,
      );

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
        // Grouping lives on section-marker lines now — always clear the legacy
        // single header (kept in the column for old reprints only).
        ...(isDeliveryNote
          ? {
              hide_amounts_on_print: hideAmountsOnPrint,
              is_blank_form: isBlankForm,
              show_full_totals:
                documentId && frozenShowFullTotals.current != null
                  ? frozenShowFullTotals.current
                  : clientProfile?.delivery_note_show_full_totals === true,
              dn_so_header: null,
            }
          : {}),
        // Print-only tax-invoice title preset; null elsewhere.
        print_title_variant: type === "invoice" && vatRegistered ? printTitleVariant || null : null,
      };

      let savedDocumentId = documentId || "";
      if (useAtomicCreate) {
        const validItems = lineItems.filter((lineItem) => lineItem.item_name.trim());
        const lineItemRecords = validItems.map((lineItem, idx) => {
          if (lineItem.isSectionMarker) {
            return {
              item_id: null,
              item_name: lineItem.item_name.trim(),
              line_note: DN_SECTION_TAG,
              item_sku: null,
              item_type: "product",
              unit: "",
              unit_price: 0,
              quantity: 0,
              base_quantity: null,
              discount_percent: 0,
              discount_amount: 0,
              qty_carton: null,
              carton_unit: null,
              line_total: 0,
              image_url: null,
              hide_amounts_on_print: false,
              sort_order: idx,
            };
          }
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
        if (createError || !createdRecord?.document_id)
          throw createError || new Error("ไม่สามารถสร้างเอกสารได้");
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
        const { error: deleteItemsError } = await supabase
          .from("document_line_items")
          .delete()
          .eq("document_id", documentId);
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
            if (lineItem.isSectionMarker) {
              return {
                document_id: savedDocumentId,
                user_id: userId,
                item_id: null,
                item_name: lineItem.item_name.trim(),
                line_note: DN_SECTION_TAG,
                item_sku: null,
                item_type: "product",
                unit: "",
                unit_price: 0,
                quantity: 0,
                base_quantity: null,
                discount_percent: 0,
                discount_amount: 0,
                qty_carton: null,
                carton_unit: null,
                line_total: 0,
                image_url: null,
                hide_amounts_on_print: false,
                sort_order: idx,
              };
            }
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
          const { error: itemsError } = await supabase
            .from("document_line_items")
            .insert(lineItemRecords);
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
        await supabase
          .from("billing_note_invoices")
          .delete()
          .eq("billing_note_id", createdDocumentId);
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

  const canSave =
    selectedCustomer &&
    issueDate !== "" &&
    lineItems.some((lineItem) => lineItem.item_name.trim());
  const isIssueDateToday = issueDate === todayString();
  // Segmented date control state — derived, never stored.
  const dateMode =
    issueDate === todayString()
      ? "today"
      : issueDate === addDaysString(todayString(), 1)
        ? "tomorrow"
        : "custom";
  // Picker visibility needs one explicit bit: derived mode alone cannot open
  // the picker when the current date is today/tomorrow.
  const [customDateOpen, setCustomDateOpen] = useState(false);

  const scrollToId = (id: string) => {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
  };

  // Delivery-note guide state (banner + pills) — other doc types keep their
  // existing static badges.
  const dnEmptyMarkerIds = useMemo(
    () => lineItems.filter((l) => l.isSectionMarker && !l.item_name.trim()).map((l) => l.id),
    [lineItems],
  );
  const dnNamedItemCount = useMemo(
    () => lineItems.filter((l) => !l.isSectionMarker && l.item_name.trim()).length,
    [lineItems],
  );
  const dnStepLinesDone = isDeliveryNote && dnNamedItemCount > 0 && dnEmptyMarkerIds.length === 0;
  const dnStepPrintDone = isDeliveryNote && amountDisplay != null;
  // Ordered flow state — a step counts as done only with all previous steps
  // done. waiting = choice stored but blocked by an earlier step.
  const custDone = !!selectedCustomer;
  const dateOwn = issueDate !== "";
  const dateEff = custDone && dateOwn;
  const linesEff = dateEff && dnStepLinesDone;
  const printEff = linesEff && dnStepPrintDone;
  // Shared by the mobile strip and the desktop rail — one ordered truth.
  const dnGuideSteps: FormProgressStep[] = [
    {
      label: "ลูกค้า",
      state: custDone ? "done" : "current",
      targetId: "deal-customer",
    },
    {
      label: "วันที่",
      state: dateEff ? "done" : dateOwn ? "waiting" : custDone ? "current" : "todo",
      targetId: "deal-date",
    },
    {
      label: "รายการ",
      state: linesEff ? "done" : dnStepLinesDone ? "waiting" : dateEff ? "current" : "todo",
      targetId: "deal-lines",
    },
    {
      label: "การพิมพ์",
      state: printEff ? "done" : dnStepPrintDone ? "waiting" : linesEff ? "current" : "todo",
      targetId: "deal-print",
    },
  ];
  // At least one named line is the rule every mode shares (same gate as save).
  const hasNamedLine = lineItems.some((lineItem) => lineItem.item_name.trim() !== "");
  const linesStepDone = dateEff && hasNamedLine;
  /**
   * Steps for the non-delivery-note modes. Same ordered truth as the delivery
   * note's list (a step counts as done only when the earlier ones are), minus
   * the print-mode step, which only exists for delivery notes.
   */
  const formGuideSteps: FormProgressStep[] = [
    { label: "ลูกค้า", state: custDone ? "done" : "current", targetId: "deal-customer" },
    {
      label: isUtilityBill ? "รอบบิล" : "วันที่",
      state: dateEff ? "done" : dateOwn ? "waiting" : custDone ? "current" : "todo",
      targetId: "deal-date",
    },
    {
      label: "รายการ",
      state: linesStepDone ? "done" : hasNamedLine ? "waiting" : dateEff ? "current" : "todo",
      targetId: "deal-lines",
    },
  ];
  /** One list drives both the rail and the mobile strip, for every mode. */
  const guideSteps: FormProgressStep[] = isDeliveryNote ? dnGuideSteps : formGuideSteps;

  const dnSpyActive = useScrollSpy(["deal-customer", "deal-date", "deal-lines", "deal-print"]);
  const dnGuideTarget = !issueDate
    ? "deal-date"
    : dnNamedItemCount === 0
      ? "deal-lines"
      : dnEmptyMarkerIds.length > 0
        ? `dn-line-${dnEmptyMarkerIds[0]}`
        : !dnStepPrintDone
          ? "deal-print"
          : null;
  const dnNextStep: NextStepState = !selectedCustomer
    ? { kind: "pick-customer" }
    : !issueDate
      ? { kind: "pick-date" }
      : dnNamedItemCount === 0
        ? { kind: "add-lines" }
        : dnEmptyMarkerIds.length > 0
          ? { kind: "fill-markers", count: dnEmptyMarkerIds.length }
          : !dnStepPrintDone
            ? { kind: "pick-amount" }
            : pendingPriceReviewCount > 0
              ? { kind: "confirm-prices", count: pendingPriceReviewCount }
              : { kind: "ready", saveLabel: "ตรวจสอบและบันทึก" };
  const handleDnGuideGoto = () => {
    if (!selectedCustomer) {
      setCustomerPickerOpen(true);
      return;
    }
    if (dnGuideTarget) {
      scrollToId(dnGuideTarget);
      return;
    }
    if (pendingPriceReviewCount > 0) {
      goToNextUnconfirmedPrice();
    }
  };

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

  if (creation.status === "invalid") {
    return <Navigate to="/home" replace />;
  }

  if (creation.status === "denied") {
    return (
      <AppShell title="ไม่มีสิทธิ์จัดทำเอกสาร" showBack>
        <Card>
          <div className="space-y-3">
            <p className="text-body font-medium text-ink-900">{creation.reason}</p>
            <p className="text-label leading-5 text-ink-500">
              หากต้องการจัดทำเอกสารประเภทนี้ กรุณาให้ผู้จัดการหรือเจ้าของกิจการเป็นผู้ดำเนินการ
            </p>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              ย้อนกลับ
            </Button>
          </div>
        </Card>
      </AppShell>
    );
  }

  // Not a deal-form mode (billing note, conversion form, …): hand over.
  if (creation.form !== "deal") {
    return <Navigate to={creation.path} replace />;
  }

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
        <div className="mb-4 rounded-card border border-card-border bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-body font-semibold text-ink-900">
                {experience.isSimpleMode ? "บันทึกงานขาย" : "กรอกข้อมูลตามลำดับ"}
              </div>
              <div className="mt-0.5 text-label text-ink-500">
                {experience.isSimpleMode
                  ? "กรอกข้อมูลที่จำเป็น ระบบจะบันทึกเป็นร่างให้ผู้จัดการดำเนินการต่อ"
                  : "กรอกข้อมูลในแต่ละส่วนจากบนลงล่าง ระบบจะคำนวณยอดให้ทันที"}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-label text-ink-500">
            <span className="rounded-full bg-page-bg px-2.5 py-1">1 ลูกค้า</span>
            <span className="rounded-full bg-page-bg px-2.5 py-1">2 วันที่</span>
            {isDeliveryNote && (
              <span className="rounded-full bg-page-bg px-2.5 py-1">3 จำนวนเงินใน PDF</span>
            )}
            <span className="rounded-full bg-page-bg px-2.5 py-1">
              {isDeliveryNote ? "4 รายการ" : "3 รายการ"}
            </span>
            <span className="rounded-full bg-page-bg px-2.5 py-1">
              {isDeliveryNote ? "5 รายละเอียด" : "4 รายละเอียด"}
            </span>
            <span className="rounded-full bg-page-bg px-2.5 py-1">
              {isDeliveryNote ? "6 ตรวจสอบและบันทึก" : "5 ตรวจสอบและบันทึก"}
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-control text-body text-red-600">
          {error}
        </div>
      )}

      {type === "invoice" && clientProfile?.vat_registered && !clientProfile?.tax_id && (
        <div className="mb-4 p-3 bg-warning-soft border-[0.5px] border-warning-border rounded-control text-body text-pending-text flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              คุณเป็นผู้ประกอบการจดทะเบียน VAT แต่ยังไม่ได้ตั้งค่าเลขผู้เสียภาษี
            </p>
            <p className="text-label mt-0.5">เลขผู้เสียภาษีจำเป็นสำหรับใบกำกับภาษี</p>
          </div>
          <button
            onClick={() => navigate("/settings/profile")}
            className="shrink-0 text-label text-primary hover:underline font-medium"
          >
            ตั้งค่าเลย →
          </button>
        </div>
      )}

      <div className="space-y-4">
        {isDeliveryNote && (
          <NextStepBanner state={dnNextStep} onFillAll={addLineItem} onGoto={handleDnGuideGoto} />
        )}
        <div className="lg:hidden">
          <FormProgress steps={guideSteps} onSelect={(id) => scrollToId(id)} />
        </div>
        <div className="lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-4">
          {/* Column 1 is the guide rail; the content column is pinned to
              column 2 so the layout never depends on the rail existing. */}
          <FormStepRail
            className="lg:col-start-1"
            steps={guideSteps}
            onSelect={(id) => scrollToId(id)}
            activeId={dnSpyActive}
          />
          <div className="min-w-0 space-y-4 lg:col-start-2">
            <Card id="deal-customer" tone={custDone ? "success" : undefined}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <StepHeading number={1} title="ลูกค้า" />
                {selectedCustomer ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-paid-bg px-2 py-0.5 text-label font-medium text-paid-text">
                    <CheckCircle2 className="h-3 w-3" />
                    ครบแล้ว
                  </span>
                ) : (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-label font-medium text-blue-700">
                    จำเป็น
                  </span>
                )}
              </div>
              {selectedCustomer ? (
                <div className="flex items-start justify-between gap-3 rounded-card border border-card-border bg-paper-soft p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-body font-medium">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-paid-text" />
                      {selectedCustomer.name}
                    </p>
                    {selectedCustomer.tax_id && (
                      <p className="text-label text-ink-500">
                        เลขผู้เสียภาษี: {selectedCustomer.tax_id}
                      </p>
                    )}
                    {selectedCustomer.address && (
                      <p className="line-clamp-2 text-label text-ink-500">
                        {selectedCustomer.address}
                      </p>
                    )}
                    {type !== "delivery_note" &&
                      (!selectedCustomer.tax_id || !selectedCustomer.address) && (
                        <p className="mt-1 text-label text-amber-600">
                          ข้อมูลลูกค้ายังไม่ครบสำหรับเอกสารภาษี
                        </p>
                      )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setCustomerPickerOpen(true)}>
                    เปลี่ยน
                  </Button>
                </div>
              ) : (
                <div className="rounded-card border border-primary-border bg-primary-soft px-4 py-4 text-center">
                  <p className="text-body font-medium text-ink-900">เลือกลูกค้าก่อนสร้างเอกสาร</p>
                  <p className="mt-1 text-label text-ink-500">
                    ระบบจะใช้ข้อมูลลูกค้าในเอกสารและการคำนวณภาษี
                  </p>
                  <Button
                    className="mt-3 w-full justify-center"
                    onClick={() => setCustomerPickerOpen(true)}
                  >
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

            <Card id="deal-date" tone={dateEff ? "success" : undefined}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <StepHeading number={2} title="วันที่ออกเอกสาร" />
                    <p className="mt-1 text-label text-ink-500">
                      ต้องเลือกทุกครั้ง — ไม่มีค่าเริ่มต้น เพื่อป้องกันวันที่ผิด
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {isDeliveryNote ? (
                      dateEff ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-paid-bg px-2 py-0.5 text-label font-medium text-paid-text">
                          <CheckCircle2 className="h-3 w-3" />
                          ครบแล้ว
                        </span>
                      ) : dateOwn ? (
                        <span className="rounded-full bg-ink-50 px-2 py-0.5 text-label font-medium text-ink-500">
                          รอขั้นตอนก่อนหน้า
                        </span>
                      ) : (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-label font-medium text-blue-700">
                          จำเป็น
                        </span>
                      )
                    ) : null}
                    {!isIssueDateToday && issueDate !== "" && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-label font-medium text-amber-700">
                        {issueDate > todayString() ? "ล่วงหน้า" : "ย้อนหลัง"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-card border border-line-soft bg-paper-field px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-label text-ink-500">วันที่ที่ใช้บนเอกสาร</div>
                      <div className="mt-1 text-body font-semibold text-ink-900">
                        {issueDate ? (
                          <>
                            {docDate.date(issueDate)}
                            <span className="ml-2 font-normal text-ink-500">
                              {new Date(`${issueDate}T00:00:00`).toLocaleDateString("th-TH", {
                                weekday: "long",
                              })}
                            </span>
                          </>
                        ) : (
                          <span className="font-normal text-ink-400">ยังไม่เลือกวันที่</span>
                        )}
                      </div>
                    </div>
                    <div
                      role="group"
                      aria-label="เลือกวันที่ออกเอกสาร"
                      className="inline-flex flex-wrap items-center rounded-control border border-line bg-white p-0.5"
                    >
                      {(
                        [
                          { value: "today", label: "วันนี้" },
                          { value: "tomorrow", label: "พรุ่งนี้" },
                          { value: "custom", label: "กำหนดเอง" },
                        ] as const
                      ).map((option) => {
                        const selected =
                          option.value === "custom"
                            ? customDateOpen || dateMode === "custom"
                            : dateMode === option.value && !customDateOpen;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              if (option.value === "today") {
                                setIssueDate(todayString());
                                setCustomDateOpen(false);
                              } else if (option.value === "tomorrow") {
                                setIssueDate(addDaysString(todayString(), 1));
                                setCustomDateOpen(false);
                              } else {
                                setCustomDateOpen(true);
                              }
                            }}
                            className={`rounded-[6px] px-2.5 py-1 text-label font-medium transition-colors ${
                              selected ? "bg-primary text-white" : "text-ink-500 hover:text-ink-700"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {(dateMode === "custom" || customDateOpen) && (
                    <div className="mt-3 border-t border-line-faint pt-3">
                      <Input
                        id="issueDate"
                        label="วันที่ออกเอกสาร"
                        type="date"
                        value={issueDate}
                        max={addDaysString(todayString(), 365)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setIssueDate(v);
                          if (v === todayString() || v === addDaysString(todayString(), 1)) {
                            setCustomDateOpen(false);
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
            </Card>

            {!isDeliveryNote && (
              <Card>
                <div className="mb-3">
                  <span className="block text-body font-medium">
                    ชื่อโครงการ / เลขที่ใบสั่งซื้อ{" "}
                    <span className="font-normal text-ink-400">(ไม่บังคับ)</span>
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
            )}

            {isUtilityBill && (
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <StepHeading number={3} title="ข้อมูลรอบบิล" />
                    <p className="mt-1 text-label text-ink-500">
                      ระบบจะคำนวณจำนวนหน่วย และบันทึกรายละเอียดไว้ในหมายเหตุรายการ
                    </p>
                  </div>
                  {loadingUtilityLast ? (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-label font-medium text-blue-700">
                      กำลังดูรอบก่อน
                    </span>
                  ) : null}
                </div>

                {utilityLastHint && utilityLastHint.includes("ดึงเลขครั้งก่อน") && (
                  <div className="mt-3 rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2 text-label text-emerald-800 flex items-center gap-1.5">
                    <span className="text-emerald-600 font-semibold">&#10003;</span>
                    {utilityLastHint}
                  </div>
                )}

                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="mb-1 block text-body text-ink-900">ค่าบริการ</span>
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
                    <span className="mt-1 block text-label text-ink-500">
                      เลือกบริการเดิมเพื่อดึงราคา หน่วย เลขครั้งก่อน และรอบบิลถัดไปของลูกค้ารายนี้
                    </span>
                  </label>

                  <div>
                    <span className="mb-1.5 block text-body text-ink-900">รอบบิล</span>
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
                    <span className="mb-1.5 block text-body text-ink-900">มาตรวัด</span>
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                      <NumericInput
                        label="เลขก่อนหน้า"
                        value={utilityPreviousReading === "" ? null : parseAmount(utilityPreviousReading)}
                        maxFractionDigits={3}
                        onTextChange={setUtilityPreviousReading}
                        placeholder="0"
                      />
                      <span className="pb-2 text-ink-400 text-body">→</span>
                      <NumericInput
                        label="เลขปัจจุบัน"
                        value={utilityCurrentReading === "" ? null : parseAmount(utilityCurrentReading)}
                        maxFractionDigits={3}
                        onTextChange={setUtilityCurrentReading}
                        placeholder="0"
                        error={utilityValidation.readingError}
                      />
                    </div>
                    {(parseAmount(utilityCurrentReading) > 0 ||
                      parseAmount(utilityPreviousReading) > 0) &&
                      parseAmount(utilityCurrentReading) > parseAmount(utilityPreviousReading) && (
                        <p className="mt-1 text-label text-ink-500">
                          ใช้ไป{" "}
                          {Math.max(
                            0,
                            Math.round(
                              (parseAmount(utilityCurrentReading) -
                                parseAmount(utilityPreviousReading)) *
                                1000,
                            ) / 1000,
                          ).toLocaleString("th-TH", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })}{" "}
                          {utilityUnit || "หน่วย"}
                        </p>
                      )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <NumericInput
                      label="ราคา/หน่วย (บาท)"
                      value={utilityRate === "" ? null : parseAmount(utilityRate)}
                      maxFractionDigits={2}
                      minFractionDigits={2}
                      onTextChange={setUtilityRate}
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

                <div className="mt-4 rounded-card border border-line-soft bg-paper-soft px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-body text-ink-600">ยอดก่อนภาษี</span>
                    <span className="text-title font-semibold text-ink-900">
                      ฿
                      {(
                        Math.max(
                          0,
                          Math.round(
                            (parseAmount(utilityCurrentReading) -
                              parseAmount(utilityPreviousReading)) *
                              1000,
                          ) / 1000,
                        ) * parseAmount(utilityRate)
                      ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {parseAmount(utilityCurrentReading) > parseAmount(utilityPreviousReading) &&
                    parseAmount(utilityRate) > 0 && (
                      <div className="mt-1 text-label text-ink-500">
                        {Math.max(
                          0,
                          Math.round(
                            (parseAmount(utilityCurrentReading) -
                              parseAmount(utilityPreviousReading)) *
                              1000,
                          ) / 1000,
                        ).toLocaleString("th-TH", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 3,
                        })}{" "}
                        {utilityUnit || "หน่วย"} × ฿
                        {parseAmount(utilityRate).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                        /หน่วย
                      </div>
                    )}
                  {utilityLastHint && !utilityLastHint.includes("ดึงเลขครั้งก่อน") && (
                    <p className="mt-2 text-label text-ink-500">{utilityLastHint}</p>
                  )}
                </div>
              </Card>
            )}

            {isLineItemDocument && (
              <Card
                id="deal-lines"
                tone={(isDeliveryNote ? linesEff : linesStepDone) ? "success" : undefined}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <StepHeading
                    number={3}
                    title={isUtilityBill ? "รายการบนใบแจ้งหนี้" : "รายการสินค้าและบริการ"}
                  />
                  <div className="flex items-center gap-2">
                    {isDeliveryNote ? (
                      linesEff ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-paid-bg px-2 py-0.5 text-label font-medium text-paid-text">
                          <CheckCircle2 className="h-3 w-3" />
                          ครบแล้ว
                        </span>
                      ) : dnStepLinesDone ? (
                        <span className="rounded-full bg-ink-50 px-2 py-0.5 text-label font-medium text-ink-500">
                          รอขั้นตอนก่อนหน้า
                        </span>
                      ) : (
                        <span className="rounded-full bg-pending-bg px-2 py-0.5 text-label font-medium text-pending-text">
                          ยังไม่ครบ
                        </span>
                      )
                    ) : (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-label font-medium text-blue-700">
                        จำเป็น
                      </span>
                    )}
                  </div>
                </div>
                {isDeliveryNote && (
                  <div className="mb-3 rounded-control border border-dashed border-card-border px-3 py-2">
                    <Switch
                      checked={groupingEnabled}
                      onChange={toggleGrouping}
                      label={
                        <>
                          ส่งของหลาย SO ในใบเดียว{" "}
                          <span className="font-normal text-ink-400">
                            (เพิ่มหัวข้อกลุ่มเหนือรายการ)
                          </span>
                        </>
                      }
                    />
                    <p className="mt-1 text-label leading-4 text-ink-400">
                      เปิดเพื่อเพิ่มหัวข้อกลุ่มเหนือรายการ — ใบส่งของจะพิมพ์แยกกลุ่มตามหัวข้อ
                      ปิดจะลบหัวข้อทั้งหมด (รายการสินค้าไม่หาย)
                    </p>
                    {legacyHeaderConverted && groupingEnabled && (
                      <p className="mt-1 text-label leading-4 text-ink-500">
                        แปลงหัวข้อ SO เดี่ยวเดิมเป็นบรรทัดหัวข้อนี้แล้ว —
                        ตรวจสอบและบันทึกเพื่อยืนยัน
                      </p>
                    )}
                  </div>
                )}
                {dnPriceReviewRequired && priceReviewableCount > 0 ? (
                  pendingPriceReviewCount > 0 ? (
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-warning-border bg-warning-soft px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-label font-medium text-warning-text">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        ต้องยืนยันราคา {pendingPriceReviewCount} รายการ ก่อนบันทึกใบส่งของ
                      </span>
                      <button
                        type="button"
                        onClick={goToNextUnconfirmedPrice}
                        className="ml-auto text-label font-medium text-warning-text underline underline-offset-2 transition-opacity hover:opacity-80"
                      >
                        ไปยังรายการถัดไป
                      </button>
                    </div>
                  ) : (
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-control border border-success-border bg-success-soft px-3 py-2 text-label font-medium text-success-text">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ยืนยันราคาครบทุกรายการแล้ว
                    </div>
                  )
                ) : null}
                <div className="space-y-2">
                  {!isUtilityBill && lineItems.length === 0 && (
                    <div className="rounded-control border border-dashed border-line bg-paper-field px-4 py-4 text-center text-label text-ink-400 space-y-2">
                      <div>ยังไม่มีรายการ — เพิ่มสินค้าหรือบริการโดยคลิกปุ่มด้านล่าง</div>
                      {selectedCustomer && !documentId && (
                        <button
                          type="button"
                          onClick={loadLatestInvoiceLines}
                          disabled={loadingLastInvoice}
                          className="inline-flex items-center gap-1 text-label font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {loadingLastInvoice
                            ? "กำลังโหลด..."
                            : "ใช้รายการจากใบแจ้งหนี้ล่าสุดของลูกค้านี้"}
                        </button>
                      )}
                    </div>
                  )}
                  {lineItems.map((item, idx) => {
                    if (item.isSectionMarker && isDeliveryNote && groupingEnabled) {
                      const markerNumber = lineNumbers?.get(item.id);
                      return (
                        <div
                          key={item.id}
                          className="pb-3 border-b border-line-faint last:border-0"
                        >
                          <div className="flex gap-2">
                            {markerNumber ? (
                              <div
                                className={`flex-shrink-0 w-6 h-6 mt-0 rounded-full border flex items-center justify-center leading-none ${
                                  item.item_name.trim()
                                    ? "border-success-border bg-paid-bg text-paid-text"
                                    : "border-primary-border bg-primary-soft text-primary"
                                }`}
                                title={
                                  item.item_name.trim() ? "กรอกหัวข้อแล้ว" : "ยังไม่กรอกหัวข้อ"
                                }
                              >
                                {item.item_name.trim() ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <span className="text-label font-semibold">{markerNumber}</span>
                                )}
                              </div>
                            ) : (
                              <div className="flex-shrink-0 w-5" aria-hidden />
                            )}
                            <div className="flex-1 min-w-0">
                              <DnSectionMarkerRow
                                value={item.item_name}
                                onChange={(val) => updateLineItem(item.id, "item_name", val)}
                                onRemove={() => removeLineItem(item.id)}
                                onMoveUp={() => moveLineItem(item.id, "up")}
                                onMoveDown={() => moveLineItem(item.id, "down")}
                                canMoveUp={idx > 0}
                                canMoveDown={idx < lineItems.length - 1}
                                warnEmpty={emptySectionIds.has(item.id)}
                                sectionNumber={markerNumber ?? undefined}
                                itemCount={countSectionItems(lineItems, item.id)}
                                onAddItem={() => addItemToSection(item.id)}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    }
                    // Non-blocking catalog-price check — blank-form DNs never print
                    // prices, so a deviation there is not a typo signal.
                    const catalogPriceDeviation = !isBlankForm
                      ? priceDeviation({
                          unitPrice: item.unit_price,
                          baseUnitPrice: item.base_unit_price,
                          unit: item.unit,
                          cartonUnit: item.carton_unit,
                          qtyPerCarton: item.qty_per_carton,
                          warnPct: priceWarnPct,
                        })
                      : null;
                    // Mandatory price review applies to DN lines only, and never
                    // to blank-form DNs (no prices on the document at all).
                    const needsPriceReview = dnPriceReviewRequired;

                    if (isUtilityBill && idx === 0) {
                      const amounts = calculateLineAmounts(item);
                      const hasData = utilityServiceName.trim() || parseAmount(utilityRate) > 0;
                      return (
                        <div key={item.id} className="pb-3 border-b border-line-faint">
                          {hasData ? (
                            <div className="rounded-control border border-card-border bg-paper-soft px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-body font-medium text-ink-900">
                                  {item.item_name}
                                </span>
                                <span className="text-body font-semibold text-ink-900">
                                  ฿
                                  {amounts.lineTotal.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                              <div className="mt-1.5 whitespace-pre-line text-label leading-5 text-ink-600">
                                {getUtilityDisplayNote(item.line_note)}
                              </div>
                              <div className="mt-1.5 text-label text-ink-500">
                                {item.quantity.toLocaleString("th-TH", {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 3,
                                })}{" "}
                                {item.unit} × ฿
                                {item.unit_price.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                                /หน่วย
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-control border border-dashed border-card-border bg-paper-field px-3 py-3 text-center text-label text-ink-400">
                              กรุณากรอกข้อมูลรอบบิลด้านบน ระบบจะแสดงตัวอย่างรายการที่นี่
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        id={`dn-line-${item.id}`}
                        className={`pb-3 border-b border-line-faint last:border-0 ${inSectionIds.has(item.id) ? "ml-7" : ""}`}
                      >
                        <div className="flex gap-2">
                          {(() => {
                            const named = item.item_name.trim() !== "";
                            return (
                              <div
                                className={`flex-shrink-0 w-6 h-6 mt-0 rounded-full border flex items-center justify-center leading-none ${
                                  named
                                    ? "border-success-border bg-paid-bg text-paid-text"
                                    : "border-primary-border bg-primary-soft text-primary"
                                }`}
                                title={named ? "ใส่ชื่อรายการแล้ว" : `รายการที่ ${idx + 1}`}
                              >
                                {named ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <span className="text-label font-semibold">
                                    {lineNumbers?.get(item.id) ?? idx + 1}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-1">
                              {/* Read-only row: it mirrors what prints. All
                                  editing happens in the shared line editor. */}
                              <button
                                type="button"
                                onClick={() => setEditingLineId(item.id)}
                                aria-label="แก้ไขรายการนี้"
                                className="min-w-0 flex-1 rounded-control px-1 py-0.5 text-left transition-colors hover:bg-paper-field"
                              >
                                <span className="block text-body font-medium text-ink-900">
                                  {item.item_name || (
                                    <span className="font-normal text-ink-400">
                                      ยังไม่ระบุชื่อ — แตะเพื่อแก้ไข
                                    </span>
                                  )}
                                </span>
                                {item.item_sku && (
                                  <span className="block text-label text-ink-500">
                                    SKU: {item.item_sku}
                                  </span>
                                )}
                                {(jobDetailsSummaryFor(item) || item.line_note.trim()) && (
                                  <span className="line-clamp-2 block text-label text-ink-500">
                                    {jobDetailsSummaryFor(item) || item.line_note}
                                  </span>
                                )}
                                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-600">
                                  <span className="tabular-nums">
                                    {item.quantity.toLocaleString("th-TH", {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 3,
                                    })}{" "}
                                    {item.unit}
                                  </span>
                                  <span className="tabular-nums">
                                    ฿
                                    {item.unit_price.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                    })}
                                  </span>
                                  {(item.discount_percent ?? 0) > 0 && (
                                    <span className="tabular-nums">
                                      ลด {item.discount_percent}%
                                    </span>
                                  )}
                                  <span className="font-medium tabular-nums text-ink-900">
                                    ฿
                                    {calculateLineAmounts(item).lineTotal.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                    })}
                                  </span>
                                  {hasCartonOption(item) && isCartonUnitSelected(item) && (
                                    <span>
                                      = {getLineBaseQuantity(item).toLocaleString("th-TH")}{" "}
                                      {item.base_unit}
                                    </span>
                                  )}
                                </span>
                              </button>
                              <div className="flex shrink-0 items-start">
                                {isDeliveryNote && groupingEnabled && (
                                  <button
                                    type="button"
                                    onClick={() => insertSectionMarkerAbove(item.id)}
                                    aria-label="เพิ่มหัวข้อกลุ่มเหนือรายการนี้"
                                    title="เพิ่มหัวข้อกลุ่มเหนือรายการนี้"
                                    className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-control text-ink-400 transition-colors hover:text-primary md:h-auto md:w-auto md:px-1"
                                  >
                                    <Heading className="h-4 w-4" />
                                  </button>
                                )}
                                <LineMoveButtons
                                  className="mt-0.5"
                                  onMoveUp={() => moveLineItem(item.id, "up")}
                                  onMoveDown={() => moveLineItem(item.id, "down")}
                                  canMoveUp={idx > 0}
                                  canMoveDown={idx < lineItems.length - 1}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeLineItem(item.id)}
                                  aria-label="ลบรายการ"
                                  title="ลบรายการ"
                                  className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-control text-ink-400 transition-colors hover:text-red-600 md:h-auto md:w-auto"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            {needsPriceReview && !item.price_confirmed && (
                              <div className="mt-1 text-label font-medium text-warning-text">
                                ต้องยืนยันราคา — แตะรายการเพื่อยืนยัน
                              </div>
                            )}
                            {catalogPriceDeviation != null && (
                              <div className="mt-1 inline-flex items-center gap-1 text-label font-medium text-warning-text">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                ต่างจากแค็ตตาล็อก ฿
                                {catalogPriceDeviation.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                                /{item.unit}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <LineItemEditorModal
                    open={editingLine != null}
                    line={editingLine}
                    isNew={editingLine != null && newLineIdsRef.current.has(editingLine.id)}
                    remaining={null}
                    over={false}
                    requirePriceReview={dnPriceReviewRequired}
                    pricesInternalOnly={isBlankForm}
                    priceWarnPct={isBlankForm ? 0 : priceWarnPct}
                    items={items}
                    sourceSummary={null}
                    onClose={closeLineEditor}
                    onOpenPriceHistory={
                      editingLine?.item_id
                        ? () => setPriceHistoryLineId(editingLine.id)
                        : undefined
                    }
                    extra={
                      editingLine ? renderLineOptions(editingLine) : null
                    }
                    priceHint={editingLine ? renderPriceHint(editingLine) : null}
                    onPatch={(patch) => {
                      if (!editingLine) return;
                      setLineItems((prev) =>
                        prev.map((lineItem) =>
                          lineItem.id === editingLine.id
                            ? ({ ...lineItem, ...patch } as LineItemForm)
                            : lineItem,
                        ),
                      );
                    }}
                    onQuantity={(value) => {
                      if (!editingLine) return;
                      const quantity = Number(value);
                      updateLineItem(
                        editingLine.id,
                        "quantity",
                        Number.isFinite(quantity) ? Math.max(0, quantity) : 0,
                      );
                    }}
                    onDelete={() => {
                      if (editingLine) removeLineItem(editingLine.id);
                    }}
                    onSaveAndAddAnother={addLineItem}
                    onNameChange={(value) => {
                      if (editingLine) updateLineItem(editingLine.id, "item_name", value);
                    }}
                    onPickCatalogItem={(catalogItem) => {
                      if (editingLine) selectCatalogItem(editingLine.id, catalogItem);
                    }}
                    onCreateCatalogItem={async (input) => {
                      try {
                        return await addItem(input);
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
                        throw err;
                      }
                    }}
                    canCreateCatalogItem={permissions.canManageCatalog}
                    allowDiscount={discountsEnabled}
                    onFullCreateCatalogItem={() => {
                      if (editingLine) {
                        setItemCreateModal({ open: true, targetLineId: editingLine.id });
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-control bg-primary-soft border border-primary-border px-3 py-1.5 text-label font-medium text-primary hover:bg-primary-soft transition-colors active:translate-y-[1px]"
                  >
                    <PlusCircle className="h-4 w-4" />
                    เพิ่มสินค้าหรือบริการ
                  </button>
                  {isDeliveryNote && groupingEnabled && (
                    <button
                      type="button"
                      onClick={addSectionMarker}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-control border border-dashed border-card-border bg-paper-soft/60 px-3 py-1.5 text-label font-medium text-ink-600 transition-colors hover:border-primary hover:text-primary-deep active:translate-y-[1px]"
                    >
                      <PlusCircle className="h-4 w-4" />
                      เพิ่มหัวข้อกลุ่ม (SO ของลูกค้า)
                    </button>
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-line text-right text-body space-y-0.5">
                  {tax.lineDiscountAmount > 0 && (
                    <>
                      <p className="text-ink-500">
                        ยอดก่อนส่วนลด: ฿
                        {tax.grossSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-red-500">
                        ส่วนลดรายรายการ: -฿
                        {tax.lineDiscountAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </>
                  )}
                  {discountsEnabled && (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-ink-500">ส่วนลดท้ายบิล (%)</span>
                      <NumericInput
                        value={documentDiscountPercent}
                        onValueChange={(next) => setDocumentDiscountPercent(next)}
                        maxFractionDigits={2}
                        maxValue={100}
                        className="w-[92px] text-right"
                      />
                    </div>
                  )}
                  {tax.discountAmount > 0 && (
                    <p className="text-red-500">
                      ส่วนลดท้ายบิล: -฿
                      {tax.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  <p className="text-ink-500">
                    ราคารวม: ฿{tax.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  {vatRegistered && (
                    <p className="text-ink-500">
                      VAT {vatRate}%: ฿
                      {tax.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  <p className="font-medium">
                    รวมทั้งสิ้น: ฿
                    {tax.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  {parseFloat(whtRate) > 0 && (
                    <p className="text-red-500">
                      หัก ณ ที่จ่าย {whtRate}%: -฿
                      {tax.whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  <p className="font-semibold text-title mt-1">
                    ยอดที่ต้องชำระ: ฿
                    {tax.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  {isDeliveryNote && amountDisplay != null && amountDisplay !== "full" ? (
                    <p className="text-label text-ink-400">
                      ยอดนี้เก็บในระบบไว้ออกบิลต่อ — ไม่แสดงใน PDF
                    </p>
                  ) : null}
                </div>
              </Card>
            )}

            {isDeliveryNote && (
              <FormStep
                id="deal-print"
                number={4}
                title="สิ่งที่พิมพ์บนใบส่งของ"
                description="บังคับเลือก 1 แบบก่อนบันทึก — มีผลกับ PDF เท่านั้น ยอดในระบบยังอยู่ครบ"
                status={printEff ? "done" : dnStepPrintDone ? "waiting" : "todo"}
                active={linesEff && !dnStepPrintDone}
              >
                <DnAmountDisplayPicker
                  value={amountDisplay}
                  showError={amountDisplaySubmitAttempted}
                  onChange={(value) => {
                    if (amountDisplay === "hidden" && value === "full") {
                      setPendingAmount(value);
                      return;
                    }
                    setAmountDisplaySubmitAttempted(false);
                    setAmountDisplay(value);
                  }}
                />
                <div className="mt-3 border-t border-card-border pt-3">
                  <div className="mb-3">
                    <span className="block text-body font-medium">
                      ชื่อโครงการ / เลขที่ใบสั่งซื้อ{" "}
                      <span className="font-normal text-ink-400">(ไม่บังคับ)</span>
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
                </div>
              </FormStep>
            )}

            <Modal
              open={isDeliveryNote && pendingAmount != null}
              onClose={() => setPendingAmount(null)}
              title="แสดงราคาใน PDF?"
            >
              <p className="text-body text-ink-700">
                PDF ใบส่งของจะแสดงราคาและยอดรวมให้ผู้รับเห็น คุณแน่ใจหรือไม่?
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setPendingAmount(null)}>
                  ยกเลิก
                </Button>
                <Button
                  onClick={() => {
                    if (pendingAmount != null) {
                      setAmountDisplaySubmitAttempted(false);
                      setAmountDisplay(pendingAmount);
                    }
                    setPendingAmount(null);
                  }}
                >
                  แสดงราคา
                </Button>
              </div>
            </Modal>

            <Card>
              <button
                type="button"
                onClick={() => setShowAdditionalDetails((current) => !current)}
                aria-expanded={showAdditionalDetails}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block text-body font-medium">
                    {isDeliveryNote ? "5." : "4."} รายละเอียดเพิ่มเติม (VAT, หัก ณ ที่จ่าย
                    และหมายเหตุ)
                  </span>
                  {!showAdditionalDetails && (
                    <span className="mt-0.5 block text-label text-ink-500">
                      VAT {vatRate}% · หัก ณ ที่จ่าย{" "}
                      {WHT_RATE_OPTIONS.find((o) => o.value === whtRate)?.label ?? whtRate} ·{" "}
                      {note.trim() ? "มีหมายเหตุ" : "ไม่มีหมายเหตุ"}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${showAdditionalDetails ? "rotate-180" : ""}`}
                />
              </button>
              {showAdditionalDetails && (
                <div className="mt-3 space-y-3">
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
                    <label className="block text-label font-medium text-ink-500 mb-1">
                      หัก ณ ที่จ่าย
                    </label>
                    <select
                      className="w-full px-3 py-2 text-body border border-card-border rounded-control bg-white focus:outline-none focus:border-primary"
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
                    <label className="block text-label font-medium text-ink-500 mb-1">
                      บันทึก
                    </label>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      placeholder="เช่น ชำระภายใน 30 วัน โอนก่อนส่งของ"
                      className="w-full px-3 py-2 text-body border border-card-border rounded-control bg-white focus:outline-none focus:border-primary whitespace-pre-line"
                    />
                  </div>
                </div>
              )}
            </Card>

            {type === "invoice" && vatRegistered && (
              <DocumentOptionsCard>
                <div className="py-3 first:pt-0 last:pb-0">
                  <Select
                    label="ชื่อเรื่องบนหัวเอกสาร (สำหรับพิมพ์)"
                    value={printTitleVariant}
                    onChange={(e) => {
                      setPrintTitleVariant(e.target.value);
                      writeLastPrintTitleVariant(e.target.value);
                    }}
                  >
                    <option value="">ใบกำกับภาษี (ค่าเริ่มต้น)</option>
                    {Object.entries(PRINT_TITLE_PRESETS).map(([value, preset]) => (
                      <option key={value} value={value}>
                        {preset.thai}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-label leading-4 text-ink-400">
                    ใช้กับหัวกระดาษเมื่อพิมพ์/ออก PDF เท่านั้น —
                    ประเภทเอกสารในระบบยังเป็นใบกำกับภาษี
                  </p>
                </div>
              </DocumentOptionsCard>
            )}

            <div className="sticky-action z-10 rounded-card bg-page-bg/95 pb-2 pt-1 backdrop-blur">
              <div className="mb-2 flex items-end justify-between gap-3 px-1">
                <div>
                  <div className="text-body font-medium text-ink-900">
                    {isDeliveryNote ? "6." : "5."} ตรวจสอบและบันทึก
                  </div>
                  <div className="mt-0.5 text-label text-ink-500">
                    {selectedCustomer?.name || "ยังไม่ได้เลือกลูกค้า"} ·{" "}
                    {lineItems.filter((line) => line.item_name.trim()).length} รายการ
                    {isDeliveryNote && amountDisplay != null && amountDisplay !== "full"
                      ? " · ไม่แสดงราคาใน PDF"
                      : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-label text-ink-500">ยอดสุทธิ</div>
                  <div className="text-title font-semibold tabular-nums text-ink-900">
                    ฿{tax.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              {!experience.isSimpleMode && (
                <EditableDocNumber
                  value={docNumberOverride}
                  onChange={setDocNumberOverride}
                  placeholder="เลขที่เอกสาร (เว้นว่าง = สร้างอัตโนมัติ)"
                  autoGenerate={async () => await resolveDocNumber(userId!, type, issueDate)}
                  className="mb-3"
                />
              )}

              <Button className="w-full" disabled={!canSave || saving} onClick={handleSave}>
                {saving
                  ? "กำลังบันทึก..."
                  : isEditingDraft
                    ? "บันทึกร่าง"
                    : experience.isSimpleMode
                      ? "บันทึกร่าง"
                      : "ตรวจสอบและบันทึก"}
              </Button>
            </div>

            <Modal
              open={showConfirmModal}
              onClose={() => setShowConfirmModal(false)}
              title="ยืนยันการบันทึก"
            >
              <div className="space-y-4">
                <div className="rounded-control border border-card-border bg-paper-field p-3 text-body">
                  <div className="flex justify-between">
                    <span className="text-ink-500">ประเภท</span>
                    <span className="font-medium text-ink-900">
                      {DOC_TYPE_LABELS[type]?.th || type}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-ink-500">เลขที่เอกสาร</span>
                    <span className="font-medium text-ink-900">
                      {docNumberOverride.trim() || "สร้างอัตโนมัติ"}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-ink-500">วันที่ออกเอกสาร</span>
                    <span className="font-medium text-ink-900">
                      {issueDate ? docDate.date(issueDate) : "-"}
                      {issueDate && !isIssueDateToday && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-label font-medium text-amber-700">
                          {issueDate > todayString() ? "ล่วงหน้า" : "ย้อนหลัง"}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-ink-500">ลูกค้า</span>
                    <span className="font-medium text-ink-900 text-right">
                      {selectedCustomer?.name}
                    </span>
                  </div>
                </div>

                {duplicateWarning && duplicateWarning.length > 0 && (
                  <div className="rounded-control border border-amber-200 bg-amber-50 p-3 text-label leading-5 text-amber-900">
                    <p className="font-medium">พบใบแจ้งหนี้ที่อาจซ้ำกัน — โปรดตรวจสอบก่อนบันทึก</p>
                    <ul className="mt-1 list-disc ml-4">
                      {duplicateWarning.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-control border border-card-border p-3 text-body">
                  <div className="mb-2 text-label text-ink-500">
                    รายการ ({lineItems.filter((li) => li.item_name.trim()).length})
                  </div>
                  <div className="space-y-2">
                    {lineItems
                      .filter((li) => li.item_name.trim())
                      .map((li) => (
                        <div key={li.id} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink-900">
                              {li.item_name}
                            </div>
                            <div className="text-label text-ink-500">
                              {li.quantity} {li.unit || li.base_unit} × ฿
                              {li.unit_price.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              })}
                            </div>
                          </div>
                          <div className="shrink-0 font-medium text-ink-900">
                            ฿
                            {lineItemAmount(li).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="rounded-control border border-card-border bg-paper-field p-3 text-body space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-ink-500">ก่อน VAT</span>
                    <span className="font-medium text-ink-900">
                      ฿{tax.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {vatRegistered && tax.vatAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-ink-500">VAT {vatRate}%</span>
                      <span className="font-medium text-ink-900">
                        ฿{tax.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {vatRegistered && tax.vatAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-ink-500">ยอดรวม</span>
                      <span className="font-medium text-ink-900">
                        ฿
                        {(tax.subtotal + tax.vatAmount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  )}
                  {tax.whtAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-ink-500">หัก ณ ที่จ่าย</span>
                      <span className="font-medium text-danger">
                        -฿{tax.whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-card-border pt-1.5 mt-1.5">
                    <span className="text-ink-700 font-medium">ยอดสุทธิ</span>
                    <span className="font-semibold text-ink-900">
                      ฿{tax.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => setShowConfirmModal(false)}
                    disabled={saving}
                  >
                    ยกเลิก
                  </Button>
                  <Button onClick={executeSave} loading={saving}>
                    {"บันทึก"}
                  </Button>
                </div>
              </div>
            </Modal>

            <ItemCreateModal
              open={itemCreateModal.open}
              initialName={
                itemCreateModal.targetLineId
                  ? (lineItems.find((line) => line.id === itemCreateModal.targetLineId)?.item_name ?? "")
                  : ""
              }
              onClose={() => setItemCreateModal({ open: false, targetLineId: null })}
              onCreated={handleFullCreateItem}
            />
            {(() => {
              const target = lineItems.find((l) => l.id === priceHistoryLineId) || null;
              const targetItem = target?.item_id
                ? items.find((c) => c.id === target.item_id)
                : null;
              if (!target || !targetItem || !userId) return null;
              return (
                <PriceHistorySheet
                  open
                  onClose={() => setPriceHistoryLineId(null)}
                  userId={userId}
                  itemId={targetItem.id}
                  itemName={targetItem.name}
                  customerId={selectedCustomer?.id ?? null}
                  customerName={selectedCustomer?.name ?? null}
                  excludeDocumentId={documentId || null}
                  currentPrice={target.unit_price}
                  onApply={(price) => {
                    updateLineItem(target.id, "unit_price", price);
                    setPriceHistoryLineId(null);
                  }}
                />
              );
            })()}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
