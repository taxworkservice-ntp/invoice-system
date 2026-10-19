import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Check, PackageCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { DateInput } from "../ui/DateInput";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";
import { LineItemEditorModal } from "./LineItemEditorModal";
import { PriceHistorySheet } from "./PriceHistorySheet";
import { PriceHint } from "./PriceHint";
import { useAuth, useClientProfile, useWorkspaceRole } from "../../hooks/useAuth";
import { getWorkspacePermissions } from "../../lib/permissions";
import { isDiscountEnabled } from "../../lib/discounts";
import { useCustomerReferenceHistory } from "../../hooks/useCustomerReferenceHistory";
import { priceHintKey, usePriceHints } from "../../hooks/usePriceHints";
import { useToast } from "../../hooks/useToast";
import { useItems } from "../../hooks/useItems";
import { supabase } from "../../lib/supabase";
import { warmPdfCache } from "../../lib/pdfWarm";
import { resolveDocNumber } from "../../lib/docNumber";
import {
  DN_SECTION_TAG,
  countSectionItems,
  findSectionEndIndex,
  getDnSectionDisplayNumbers,
  getDnSectionMarkersWithoutChildren,
  getLegacyDnHeaderForConversion,
  isDnSectionMarker,
} from "../../lib/dnGroups";
import { businessTodayString } from "../../lib/devDate";
import {
  type DocumentLine,
  cartonSaveQuantities,
  isPriceReviewRequired,
  pendingPriceReviewLines,
} from "../../lib/documentLine";
import {
  focusLineInput,
  moveLine as moveLineInList,
  removeLine as removeLineFromList,
} from "../../lib/lineDraft";
import { calculateLineAmounts, calculateTax } from "../../lib/tax";
import { useDocDate } from "../YearEraProvider";
import { formatCurrency } from "../../lib/format";
import type { Customer, Document, DocumentLineItem, DocumentStatus, Item } from "../../types";
import { EditableDocNumber } from "./EditableDocNumber";
import {
  DnAmountDisplayPicker,
  readLastDnAmount,
  writeLastDnAmount,
  type DnAmountDisplay,
} from "./DocumentOptions";
import {
  FormProgress,
  FormStep,
  FormStepRail,
  useScrollSpy,
  type FormProgressStep,
  type StepStatus,
} from "./FormStep";
import { Modal } from "../ui/Modal";
import { NextStepBanner, type NextStepState } from "./NextStepBanner";
import { PoTaskFields } from "./PoTaskFields";
import { DnSectionMarkerRow, LineMoveButtons } from "./DnSectionMarkerRow";
import { FormActionBar } from "./FormActionBar";

type QuotationWithCustomer = Document & { customer?: Customer };

type DeliveryTotals = {
  delivered: number;
  pending: number;
};

/** This form's line: the shared line plus its quotation-source bookkeeping. */
export type DeliveryLine = DocumentLine & {
  source: DocumentLineItem | null;
  delivered: number;
  pending: number;
  base_quantity: number | null;
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

function blankDeliveryLine(): DeliveryLine {
  return {
    id: crypto.randomUUID(),
    source: null,
    quantity: 1,
    delivered: 0,
    pending: 0,
    item_name: "",
    item_id: null,
    item_sku: null,
    item_type: "product",
    unit: "ชิ้น",
    unit_price: 0,
    price_confirmed: false,
    discount_percent: 0,
    line_note: "",
    base_quantity: null,
    qty_carton: null,
    carton_unit: null,
    hide_amounts_on_print: false,
    isSectionMarker: false,
  };
}

function deliverySectionMarker(): DeliveryLine {
  return {
    ...blankDeliveryLine(),
    quantity: 0,
    item_name: "",
    unit: "",
    unit_price: 0,
    price_confirmed: true,
    line_note: DN_SECTION_TAG,
    hide_amounts_on_print: false,
    isSectionMarker: true,
  };
}

function getBaseQuantity(source: DocumentLineItem, quantity: number) {
  if (!source.base_quantity || !source.quantity) return quantity;
  return round3((source.base_quantity / source.quantity) * quantity);
}

interface DeliveryNoteFromQuotationFormProps {
  quotationId: string;
  documentId?: string;
}

export function DeliveryNoteFromQuotationForm({
  quotationId,
  documentId,
}: DeliveryNoteFromQuotationFormProps) {
  const navigate = useNavigate();
  const docDate = useDocDate();
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  // Catalog creation is an owner/manager action — officers pick from the catalog.
  const { workspaceRole, workspacePermissions } = useWorkspaceRole();
  const permissions = getWorkspacePermissions(workspaceRole, workspacePermissions);
  const businessToday = businessTodayString(clientProfile);
  const todayString = () => businessToday;
  const toast = useToast();
  const { items: catalogItems, addItem: addCatalogItem } = useItems(userId);

  const [quotation, setQuotation] = useState<QuotationWithCustomer | null>(null);
  const [quotationLines, setQuotationLines] = useState<DocumentLineItem[]>([]);
  const referenceHistory = useCustomerReferenceHistory(quotation?.customer_id || null);
  const [lines, setLines] = useState<DeliveryLine[]>([]);
  const [existingDraft, setExistingDraft] = useState<{
    id: string;
    doc_number: string | null;
  } | null>(null);
  // No-default date: the officer must pick explicitly (pre-filled dates get skipped).
  const [issueDate, setIssueDate] = useState("");
  const [note, setNote] = useState("");
  // Optional PO reference + task name, printed on the delivery note.
  const [customerPo, setCustomerPo] = useState("");
  const [taskName, setTaskName] = useState("");
  // Caption shown when an old draft's single SO header was converted into a
  // section-marker line on load (forms no longer write dn_so_header).
  const [legacyHeaderConverted, setLegacyHeaderConverted] = useState(false);
  // Grouping is emergent, not a mode: any section-marker line groups the
  // lines below it on the printout; no markers means a flat delivery note.
  // Hide lines that are already fully delivered (qty 0 + nothing remaining).
  const [hideCompleted, setHideCompleted] = useState(false);
  // Line currently open in the editor modal (null = modal closed).
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  // Line whose price-history sheet is open (null = closed).
  const [priceHistoryLineId, setPriceHistoryLineId] = useState<string | null>(null);
  // Ids created via the add buttons this session — the modal offers
  // "บันทึกและเพิ่มต่อ" for these instead of just บันทึก.
  const newLineIdsRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [error, setError] = useState("");
  // Required amount-display mode — never pre-selected. The officer picks
  // explicitly on every delivery note (draft edits hydrate the saved mode).
  const [amountDisplay, setAmountDisplay] = useState<DnAmountDisplay | null>(null);
  // Last mode explicitly chosen for this customer — shown as a tag only.
  const [amountHint, setAmountHint] = useState<DnAmountDisplay | null>(null);
  // Pending hidden→full switch awaiting modal confirmation (reveals prices to
  // the recipient — never a silent switch).
  const [pendingAmount, setPendingAmount] = useState<DnAmountDisplay | null>(null);

  const applyAmountDisplay = (value: DnAmountDisplay) => {
    setAmountDisplaySubmitAttempted(false);
    setAmountDisplay(value);
    writeLastDnAmount(quotation?.customer_id, value);
    setAmountHint(value);
  };

  // Load the per-customer hint once the quotation (and its customer) is known.
  useEffect(() => {
    setAmountHint(readLastDnAmount(quotation?.customer_id));
  }, [quotation?.customer_id]);
  // Turns the picker's hint red only after a save was attempted with no choice.
  const [amountDisplaySubmitAttempted, setAmountDisplaySubmitAttempted] = useState(false);
  const hideAmountsOnPrint = amountDisplay === "hidden";
  const isBlankForm = amountDisplay === "blank";
  // DN full-totals is settings-only (ตั้งค่า › ใบส่งของ): new docs follow the
  // workspace setting, draft edits keep their saved value frozen at hydrate.
  const frozenShowFullTotals = useRef<boolean | null>(null);

  const isEditing = Boolean(documentId);
  // Mandatory per-line price review before a DN can be saved (opt-in).
  // Blank-form DNs carry no prices on the document — exempt, like deals/new.tsx.
  const requirePriceReview = isPriceReviewRequired({
    requireDnPriceReview: clientProfile?.require_dn_price_review === true,
    isBlankForm,
  });
  // Catalog-price deviation guard (workspace setting; 0 = off). Shared with the
  // deal form so both delivery-note paths warn on the same rule.
  const priceWarnPct = clientProfile?.price_deviation_warn_pct ?? 10;

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
        if (["voided", "converted"].includes(quote.status)) {
          throw new Error("ไม่สามารถสร้างใบส่งของจากใบเสนอราคาที่ถูกยกเลิกหรือแปลงแล้ว");
        }

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
          setCustomerPo((existingDoc as Document).customer_po_number || "");
          setTaskName((existingDoc as Document).task_name || "");
          setDocNumberOverride((existingDoc as Document).doc_number || "");
          setAmountDisplay(
            (existingDoc as Document & { is_blank_form?: boolean }).is_blank_form
              ? "blank"
              : (existingDoc as Document).hide_amounts_on_print === false
                ? "full"
                : "hidden",
          );
          frozenShowFullTotals.current = (existingDoc as Document).show_full_totals ?? null;
        } else {
          // Flow-down: carry the quotation's PO/task onto the new DN.
          setCustomerPo(quote.customer_po_number || "");
          setTaskName(quote.task_name || "");
        }

        const activeDraft =
          draftDoc && draftDoc.id !== documentId
            ? { id: draftDoc.id, doc_number: draftDoc.doc_number }
            : null;

        const totals = new Map<string, DeliveryTotals>();
        (
          (sourcedDnLines || []) as (DocumentLineItem & {
            document?: Pick<Document, "id" | "status" | "doc_type">;
          })[]
        ).forEach((line) => {
          if (
            !line.source_line_item_id ||
            line.document?.doc_type !== "delivery_note" ||
            line.document?.status === "voided"
          )
            return;
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
            if (isDnSectionMarker(line)) {
              initialLines.push({
                id: line.id,
                item_id: null,
                source: null,
                quantity: 0,
                delivered: 0,
                pending: 0,
                item_name: line.item_name,
                item_sku: null,
                item_type: "product",
                unit: "",
                unit_price: 0,
                price_confirmed: true,
                discount_percent: 0,
                line_note: DN_SECTION_TAG,
                base_quantity: null,
                qty_carton: null,
                carton_unit: null,
                hide_amounts_on_print: false,
                isSectionMarker: true,
              });
              return;
            }
            if (line.source_line_item_id) coveredSourceIds.add(line.source_line_item_id);
            const source = line.source_line_item_id
              ? sourceLineById.get(line.source_line_item_id) || null
              : null;
            const total = source
              ? totals.get(source.id) || { delivered: 0, pending: 0 }
              : { delivered: 0, pending: 0 };
            initialLines.push({
              id: line.id,
              source,
              quantity: round3(Number(line.quantity) || 0),
              delivered: total.delivered,
              pending: total.pending,
              item_name: line.item_name,
              item_id: line.item_id ?? null,
              item_sku: line.item_sku ?? source?.item_sku ?? null,
              item_type: line.item_type || source?.item_type || "product",
              unit: line.unit || source?.unit || "ชิ้น",
              unit_price: Number(line.unit_price) || 0,
              price_confirmed: false,
              discount_percent: Number(line.discount_percent) || 0,
              line_note: line.line_note ?? "",
              base_quantity: line.base_quantity ?? null,
              qty_carton: line.qty_carton ?? null,
              carton_unit: line.carton_unit ?? null,
              hide_amounts_on_print: line.hide_amounts_on_print ?? false,
              isSectionMarker: false,
            });
          });

          qLines.forEach((line) => {
            if (coveredSourceIds.has(line.id)) return;
            const total = totals.get(line.id) || { delivered: 0, pending: 0 };
            const remaining = round3(line.quantity - total.delivered - total.pending);
            if (remaining <= 0) return;
            initialLines.push({
              id: line.id,
              item_id: line.item_id ?? null,
              source: line,
              quantity: remaining,
              delivered: total.delivered,
              pending: total.pending,
              item_name: line.item_name,
              item_sku: line.item_sku,
              item_type: line.item_type,
              unit: line.unit || "ชิ้น",
              unit_price: Number(line.unit_price) || 0,
              price_confirmed: false,
              discount_percent: Number(line.discount_percent) || 0,
              line_note: line.line_note ?? "",
              base_quantity: null,
              qty_carton: line.qty_carton ?? null,
              carton_unit: line.carton_unit ?? null,
              hide_amounts_on_print: false,
              isSectionMarker: false,
            });
          });
          // Legacy single SO header becomes one marker line (forms no longer
          // write dn_so_header — the printed single group is identical).
          const legacyHeader = getLegacyDnHeaderForConversion(
            existingDnLines,
            (existingDoc as Document)?.dn_so_header,
          );
          if (legacyHeader) {
            initialLines.unshift({
              id: crypto.randomUUID(),
              item_id: null,
              source: null,
              quantity: 0,
              delivered: 0,
              pending: 0,
              item_name: legacyHeader,
              item_sku: null,
              item_type: "product",
              unit: "",
              unit_price: 0,
              price_confirmed: true,
              discount_percent: 0,
              line_note: DN_SECTION_TAG,
              base_quantity: null,
              qty_carton: null,
              carton_unit: null,
              hide_amounts_on_print: false,
              isSectionMarker: true,
            });
            setLegacyHeaderConverted(true);
          }
        } else {
          qLines.forEach((line) => {
            const total = totals.get(line.id) || { delivered: 0, pending: 0 };
            const remaining = round3(line.quantity - total.delivered - total.pending);
            initialLines.push({
              id: line.id,
              item_id: line.item_id ?? null,
              source: line,
              quantity: Math.max(0, remaining),
              delivered: total.delivered,
              pending: total.pending,
              item_name: line.item_name,
              item_sku: line.item_sku,
              item_type: line.item_type,
              unit: line.unit || "ชิ้น",
              unit_price: Number(line.unit_price) || 0,
              price_confirmed: false,
              discount_percent: Number(line.discount_percent) || 0,
              line_note: line.line_note ?? "",
              base_quantity: null,
              qty_carton: line.qty_carton ?? null,
              carton_unit: line.carton_unit ?? null,
              hide_amounts_on_print: false,
              isSectionMarker: false,
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
    setExistingDraft(
      draftDoc && draftDoc.id !== documentId
        ? { id: draftDoc.id, doc_number: draftDoc.doc_number }
        : null,
    );
  }, [documentId, quotationId, userId]);

  const selectedLines = useMemo(
    () => lines.filter((line) => line.quantity > 0 || line.isSectionMarker),
    [lines],
  );

  const overDeliveryLines = useMemo(
    () =>
      lines.filter(
        (line) =>
          line.source &&
          line.quantity > Math.max(0, round3(line.source.quantity - line.delivered - line.pending)),
      ),
    [lines],
  );

  // Guided-save state: once a save fails, missing spots stay amber-highlighted
  // until fixed (same pattern as amountDisplaySubmitAttempted).
  const [saveAttempted, setSaveAttempted] = useState(false);

  // Live step completion — pills only, steps never lock.
  const emptyMarkerIds = useMemo(
    () =>
      selectedLines
        .filter((line) => line.isSectionMarker && !line.item_name.trim())
        .map((line) => line.id),
    [selectedLines],
  );
  const itemLineCount = useMemo(
    () => selectedLines.filter((line) => !line.isSectionMarker).length,
    [selectedLines],
  );
  // Unnamed product rows can be saved in this form, so every non-marker line
  // counts as reviewable here (the deal form counts named lines only).
  const pricePendingIds = useMemo(
    () =>
      requirePriceReview
        ? pendingPriceReviewLines(selectedLines, { namedOnly: false }).map((line) => line.id)
        : [],
    [requirePriceReview, selectedLines],
  );
  const step1Done = itemLineCount > 0 && emptyMarkerIds.length === 0;
  const step2Done = amountDisplay != null;
  // Ordered flow state: a step counts as done only with all previous steps
  // done. waiting = choice stored but blocked — honest about data, strict about order.
  const dateDone = issueDate !== "";
  const s1Eff = dateDone && step1Done;
  const s2Eff = s1Eff && step2Done;
  const s1Status: StepStatus = s1Eff ? "done" : step1Done ? "waiting" : "todo";
  const s2Status: StepStatus = s2Eff ? "done" : step2Done ? "waiting" : "todo";
  // Shared by the mobile strip and the desktop rail — one ordered truth.
  const guideSteps: FormProgressStep[] = [
    {
      label: "วันที่ส่งของ",
      state: dateDone ? "done" : "current",
      targetId: "dn-step-date",
    },
    {
      label: "รายการ",
      state: s1Eff ? "done" : step1Done ? "waiting" : dateDone ? "current" : "todo",
      targetId: "dn-step-lines",
    },
    {
      label: "การพิมพ์",
      state: s2Eff ? "done" : step2Done ? "waiting" : s1Eff ? "current" : "todo",
      targetId: "dn-step-print",
    },
  ];
  const spyActive = useScrollSpy(["dn-step-date", "dn-step-lines", "dn-step-print"]);
  const nextStep: NextStepState = !issueDate
    ? { kind: "pick-date" }
    : itemLineCount === 0
      ? { kind: "fill-quantities" }
      : emptyMarkerIds.length > 0
        ? { kind: "fill-markers", count: emptyMarkerIds.length }
        : amountDisplay == null
          ? { kind: "pick-amount" }
          : pricePendingIds.length > 0
            ? { kind: "confirm-prices", count: pricePendingIds.length }
            : {
                kind: "ready",
                saveLabel: isEditing ? "บันทึกร่างใบส่งของ" : "สร้างใบส่งของฉบับร่าง",
              };
  // First blocker in save order — the guided-save jump target.
  const firstBlockerTarget = !issueDate
    ? "dn-step-date"
    : itemLineCount === 0
      ? "dn-step-lines"
      : emptyMarkerIds.length > 0
        ? `dn-line-${emptyMarkerIds[0]}`
        : amountDisplay == null
          ? "dn-step-print"
          : pricePendingIds.length > 0
            ? `dn-line-${pricePendingIds[0]}`
            : null;

  const scrollToId = (id: string) => {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
  };

  // Line currently open in the editor modal (null = closed).
  const editingLine =
    editingLineId != null ? (lines.find((item) => item.id === editingLineId) ?? null) : null;
  const editingRemaining =
    editingLine?.source != null
      ? round3(editingLine.source.quantity - editingLine.delivered - editingLine.pending)
      : null;
  const editingOver =
    editingLine != null &&
    editingRemaining != null &&
    editingLine.quantity > Math.max(0, editingRemaining);

  // Last-price hints (เคยขาย…) per catalog line — same rule as the deal form,
  // via the shared hook. Independent of the DN price-review setting.
  const priceHints = usePriceHints({
    userId,
    customerId: quotation?.customer_id ?? null,
    itemIds: lines.map((line) => line.item_id),
    excludeDocumentId: documentId || null,
  });

  /** "Sold to this customer before at ฿x — use this price" shortcut. */
  const renderPriceHint = (line: DeliveryLine) => {
    const hintKey = priceHintKey(line.item_id, quotation?.customer_id ?? null);
    const priceHint = hintKey ? (priceHints[hintKey] ?? null) : null;
    if (!priceHint) return null;
    return (
      <PriceHint
        hint={priceHint}
        currentPrice={line.unit_price}
        confirmsPrice={requirePriceReview}
        onApply={() => updateLine(line.id, { unit_price: priceHint.price, price_confirmed: true })}
      />
    );
  };

  const handleSaveAndAddAnother = () => {
    setEditingLineId(addCustomLine());
  };

  // Header progress: how much of the quotation is already delivered + this round.
  const deliveryProgress = useMemo(() => {
    let quoted = 0;
    let delivered = 0;
    let thisRound = 0;
    for (const line of lines) {
      if (line.isSectionMarker || !line.source) continue;
      quoted = round3(quoted + Number(line.source.quantity || 0));
      delivered = round3(delivered + line.delivered);
      thisRound = round3(thisRound + (line.quantity > 0 ? line.quantity : 0));
    }
    return { quoted, delivered, thisRound };
  }, [lines]);

  const visibleLines = useMemo(() => {
    if (!hideCompleted) return lines;
    return lines.filter((line) => {
      if (line.isSectionMarker) return true;
      const remaining = line.source
        ? round3(line.source.quantity - line.delivered - line.pending)
        : null;
      // Keep lines with anything left to do, anything typed, or price-review pending.
      if (line.quantity > 0) return true;
      if (remaining == null) return true;
      return remaining > 0;
    });
  }, [hideCompleted, lines]);

  const hiddenCompletedCount = lines.length - visibleLines.length;

  const tax = useMemo(() => {
    return calculateTax(
      selectedLines
        .filter((line) => !line.isSectionMarker)
        .map((line) => ({
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

  // Form badges mirror the printed G / G.j hierarchy whenever grouping is on.
  const lineNumbers = useMemo(() => getDnSectionDisplayNumbers(lines), [lines]);
  const emptySectionIds = useMemo(() => getDnSectionMarkersWithoutChildren(lines), [lines]);
  // Item ids nested under a non-blank marker — indented as a visual section.
  // Mirrors getDnSectionDisplayNumbers: a blank marker ends the run.
  const inSectionIds = useMemo(() => {
    const ids = new Set<string>();
    let inSection = false;
    for (const line of lines) {
      if (line.isSectionMarker) {
        inSection = line.item_name.trim() !== "";
        continue;
      }
      if (inSection) ids.add(line.id);
    }
    return ids;
  }, [lines]);

  const moveLine = (lineId: string, direction: "up" | "down") => {
    setLines((current) => moveLineInList(current, lineId, direction));
  };

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

  const setQuantityToRemaining = (lineId: string) => {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== lineId || !line.source) return line;
        const remaining = round3(line.source.quantity - line.delivered - line.pending);
        return { ...line, quantity: Math.max(0, remaining) };
      }),
    );
  };

  const fillAllRemaining = () => {
    setLines((current) =>
      current.map((line) => {
        if (line.isSectionMarker || !line.source) return line;
        const remaining = round3(line.source.quantity - line.delivered - line.pending);
        return { ...line, quantity: Math.max(0, remaining) };
      }),
    );
  };

  const clearZeroLines = () => {
    setLines((current) =>
      current.filter((line) => {
        if (line.isSectionMarker) return true;
        if (line.quantity > 0) return true;
        // Keep sourced lines that still have anything remaining to deliver.
        if (line.source) {
          return round3(line.source.quantity - line.delivered - line.pending) > 0;
        }
        // Keep custom lines only when the user typed a name.
        return line.item_name.trim() !== "";
      }),
    );
  };

  const updateLine = (lineId: string, patch: Partial<DeliveryLine>) => {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );
  };

  /** Apply a catalog item to a line (dropdown pick or exact-name typing).
   * The price always needs a fresh look — catalog prices are never auto-confirmed. */
  const applyCatalogItem = (lineId: string, catalogItem: Item) => {
    updateLine(lineId, {
      item_name: catalogItem.name,
      item_id: catalogItem.id,
      item_sku: catalogItem.sku ?? null,
      item_type: catalogItem.item_type,
      unit: catalogItem.base_unit || "ชิ้น",
      unit_price: Number(catalogItem.unit_price) || 0,
      price_confirmed: false,
    });
  };

  /** Name typing with exact-match catalog linking (mirrors the deal form). */
  const handleLineNameChange = (lineId: string, value: string) => {
    const name = value.trim();
    const match = name
      ? catalogItems.find((item) => item.name.toLowerCase() === name.toLowerCase())
      : undefined;
    if (match) {
      applyCatalogItem(lineId, match);
      updateLine(lineId, { item_name: value });
      return;
    }
    updateLine(lineId, { item_name: value, item_id: null, item_sku: null, price_confirmed: false });
  };

  const createCatalogItem = async (
    lineId: string,
    input: {
      name: string;
      unit_price: number;
      base_unit: string;
      item_type: "product" | "service";
    },
  ) => {
    const created = await addCatalogItem(input);
    applyCatalogItem(lineId, created);
    return created;
  };

  /** Create a blank item line and return its id — the caller opens the editor modal. */
  const addCustomLine = () => {
    const line = blankDeliveryLine();
    newLineIdsRef.current.add(line.id);
    setLines((current) => [...current, line]);
    return line.id;
  };

  const addSectionMarker = () => {
    const marker = deliverySectionMarker();
    setLines((current) => {
      // Don't stack empty headers — finish the current one first.
      const last = current[current.length - 1];
      if (last && last.isSectionMarker && !last.item_name.trim()) return current;
      return [...current, marker];
    });
    focusLineInput(marker.id);
  };

  /** Append a blank item at the end of a marker's section, opened in the editor modal. */
  const addItemToSection = (markerId: string) => {
    const line = blankDeliveryLine();
    newLineIdsRef.current.add(line.id);
    setLines((current) => {
      const index = findSectionEndIndex(current, markerId);
      return [...current.slice(0, index), line, ...current.slice(index)];
    });
    setEditingLineId(line.id);
  };

  const removeLine = (lineId: string) => {
    newLineIdsRef.current.delete(lineId);
    setEditingLineId((current) => (current === lineId ? null : current));
    setLines((current) => removeLineFromList(current, lineId));
  };

  /** Close the editor modal — a still-empty new line is discarded. */
  const closeEditor = () => {
    const id = editingLineId;
    setEditingLineId(null);
    if (!id || !newLineIdsRef.current.has(id)) return;
    const line = lines.find((item) => item.id === id);
    if (line && !line.item_name.trim() && line.quantity === 0) {
      newLineIdsRef.current.delete(id);
      setLines((current) => current.filter((item) => item.id !== id));
    }
  };

  const handleSave = async () => {
    if (!quotation || !userId || selectedLines.length === 0) return;
    // No-default date: the officer must pick explicitly.
    if (!issueDate) {
      setSaveAttempted(true);
      setError("กรุณาเลือกวันที่ส่งของ");
      scrollToId("dn-step-date");
      return;
    }
    // Section markers carry no goods — they still need their header text,
    // and a DN of markers alone is not a delivery.
    if (!selectedLines.some((line) => !line.isSectionMarker)) {
      setSaveAttempted(true);
      setError("กรุณาเพิ่มอย่างน้อย 1 รายการสินค้า");
      scrollToId("dn-step-lines");
      return;
    }
    if (selectedLines.some((line) => line.isSectionMarker && !line.item_name.trim())) {
      setSaveAttempted(true);
      setError("กรุณากรอกข้อความหัวข้อกลุ่มให้ครบทุกหัวข้อ");
      const firstEmpty = selectedLines.find(
        (line) => line.isSectionMarker && !line.item_name.trim(),
      );
      if (firstEmpty) scrollToId(`dn-line-${firstEmpty.id}`);
      return;
    }
    // Required print mode — never pre-selected, the officer picks every time.
    if (amountDisplay == null) {
      setAmountDisplaySubmitAttempted(true);
      setSaveAttempted(true);
      setError("กรุณาเลือกการแสดงจำนวนเงินใน PDF ก่อนบันทึก");
      scrollToId("dn-step-print");
      return;
    }
    // Mandatory price review (opt-in): block save until every line price
    // is confirmed. Blank-form DNs carry no prices — exempt.
    // Section markers carry no price — exempt.
    if (requirePriceReview) {
      const pending = pendingPriceReviewLines(selectedLines, { namedOnly: false });
      if (pending.length > 0) {
        setSaveAttempted(true);
        setError(`กรุณายืนยันราคาทุกรายการก่อนบันทึกใบส่งของ (เหลือ ${pending.length} รายการ)`);
        // Open the first pending line in the editor so the confirm control is visible.
        setEditingLineId(pending[0].id);
        scrollToId(`dn-line-${pending[0].id}`);
        return;
      }
    }
    setSaving(true);
    setError("");
    setSaveAttempted(false);

    let createdDocId: string | null = null;

    try {
      const docNumber = await resolveDocNumber(
        userId,
        "delivery_note",
        issueDate,
        docNumberOverride,
        documentId,
      );
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
        customer_po_number: customerPo.trim() || null,
        task_name: taskName.trim() || null,
        // Grouping lives on section-marker lines now — always clear the
        // legacy single header (kept in the column for old reprints only).
        dn_so_header: null,
        hide_amounts_on_print: hideAmountsOnPrint,
        is_blank_form: isBlankForm,
        show_full_totals:
          documentId && frozenShowFullTotals.current != null
            ? frozenShowFullTotals.current
            : clientProfile?.delivery_note_show_full_totals === true,
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
        const { error: deleteLinesError } = await supabase
          .from("document_line_items")
          .delete()
          .eq("document_id", documentId);
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
        if (line.isSectionMarker) {
          return {
            document_id: deliveryNoteId,
            user_id: userId,
            item_id: null,
            item_name: line.item_name.trim(),
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
            source_document_id: null,
            source_line_item_id: null,
            source_delivered_qty: null,
            source_unit_price: null,
            hide_amounts_on_print: false,
            sort_order: index,
          };
        }
        const calc = calculateLineAmounts({
          unit_price: line.unit_price,
          quantity: line.quantity,
          discount_percent: line.discount_percent,
        });

        // Carton lines: the paper shows cartons, stock moves in pieces
        // (shared rule — see src/lib/documentLine.ts). The factor lives on the
        // catalog item; `line.qty_carton` is the carton count, not the factor.
        const cartonItem = line.item_id
          ? catalogItems.find((item) => item.id === line.item_id)
          : null;
        const carton =
          cartonItem?.carton_unit && Number(cartonItem.qty_per_carton) > 0
            ? cartonSaveQuantities({
                quantity: line.quantity,
                unit: line.unit,
                cartonUnit: cartonItem.carton_unit,
                qtyPerCarton: Number(cartonItem.qty_per_carton),
              })
            : null;

        return {
          document_id: deliveryNoteId,
          user_id: userId,
          item_id: line.item_id ?? line.source?.item_id ?? null,
          item_name: line.item_name,
          line_note: line.line_note.trim() || null,
          item_sku: line.item_sku,
          item_type: line.item_type,
          unit: line.unit,
          unit_price: line.unit_price,
          quantity: line.quantity,
          base_quantity: carton
            ? carton.baseQuantity
            : line.source
              ? getBaseQuantity(line.source, line.quantity)
              : line.base_quantity,
          discount_percent: line.discount_percent,
          discount_amount: calc.discountAmount,
          qty_carton: carton
            ? carton.qtyCarton
            : line.source
              ? line.source.qty_carton
                ? line.quantity
                : null
              : line.qty_carton,
          carton_unit: carton ? carton.cartonUnit : (line.source?.carton_unit ?? line.carton_unit),
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
      // New delivery notes ship finalized — pre-warm. Draft edits stay lazy.
      if (!documentId) warmPdfCache(deliveryNoteId);
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
        <div className="py-12 text-center text-body text-red-600">{error || "ไม่พบใบเสนอราคา"}</div>
      </AppShell>
    );
  }

  if (quotationLines.length === 0) {
    return (
      <AppShell title={isEditing ? "แก้ไขร่างใบส่งของ" : "ออกใบส่งของจากใบเสนอราคา"} showBack>
        <EmptyState
          title="ใบเสนอราคานี้ไม่มีรายการสินค้า"
          description="เพิ่มรายการในใบเสนอราคาก่อนสร้างใบส่งของ"
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={isEditing ? "แก้ไขร่างใบส่งของ" : "ออกใบส่งของจากใบเสนอราคา"} showBack>
      {error && (
        <div className="mb-4 rounded-control border border-red-200 bg-red-50 p-3 text-body text-red-600">
          {error}
        </div>
      )}

      {existingDraft && (
        <div className="mb-4 flex items-start gap-3 rounded-control border border-amber-200 bg-amber-50 p-3 text-body text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              มีร่างใบส่งของที่ยังไม่ได้ส่ง
              {existingDraft.doc_number ? ` (${existingDraft.doc_number})` : ""}
            </p>
            <p className="mt-0.5 text-label leading-5">
              เปิดร่างเดิมเพื่อแก้ไขหรือยืนยันส่งของ ก่อนสร้างร่างใหม่
            </p>
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
          <div className="text-label font-medium text-ink-500">อ้างอิงใบเสนอราคา</div>
          <div className="mt-1 text-subtitle font-semibold text-ink-900">
            {quotation.doc_number || "-"}
          </div>
          <div className="mt-1 text-body text-ink-500">{quotation.customer?.name || "ลูกค้า"}</div>
          <div className="mt-2 text-label leading-5 text-ink-500">
            เสนอ {formatQty(deliveryProgress.quoted)} · ส่งแล้ว{" "}
            {formatQty(deliveryProgress.delivered)} · รอบนี้ {formatQty(deliveryProgress.thisRound)}{" "}
            · ใบเสนอราคาลงวันที่ {docDate.date(quotation.issue_date)}
          </div>
        </Card>

        <Card id="dn-step-date" tone={issueDate ? "success" : undefined}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body font-medium text-ink-900">
                  วันที่ส่งของ <span className="text-danger">*</span>
                </span>
                {issueDate ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-paid-bg px-2 py-0.5 text-label font-medium text-paid-text">
                    <Check className="h-3 w-3" />
                    เลือกแล้ว
                  </span>
                ) : (
                  <span className="rounded-full bg-pending-bg px-2 py-0.5 text-label font-medium text-pending-text">
                    จำเป็น — ยังไม่เลือก
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-label leading-5 text-ink-500">
                {issueDate ? (
                  <>
                    {docDate.date(issueDate)} ·{" "}
                    {new Date(`${issueDate}T00:00:00`).toLocaleDateString("th-TH", {
                      weekday: "long",
                    })}
                  </>
                ) : (
                  "แตะปฏิทินเพื่อเลือกวันส่งของจริง — ต้องเลือกก่อนบันทึก"
                )}
              </div>
            </div>
            <div className="w-full sm:w-56">
              <DateInput
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
                aria-label="วันที่ส่งของ"
              />
            </div>
          </div>
        </Card>

        <NextStepBanner
          state={nextStep}
          onFillAll={fillAllRemaining}
          onGoto={() => {
            if (firstBlockerTarget) scrollToId(firstBlockerTarget);
          }}
        />

        <div className="lg:hidden">
          <FormProgress steps={guideSteps} onSelect={(id) => scrollToId(id)} />
        </div>

        <div className="lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-4">
          <FormStepRail steps={guideSteps} onSelect={(id) => scrollToId(id)} activeId={spyActive} />
          <div className="min-w-0 space-y-4">
            {overDeliveryLines.length > 0 && (
              <div className="flex items-start gap-3 rounded-control border border-amber-200 bg-amber-50 p-3 text-body text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">มีรายการที่เกินจำนวนคงเหลือจากใบเสนอราคา</p>
                  <p className="mt-0.5 text-label leading-5">
                    ระบบอนุญาตให้บันทึกได้ แต่ควรตรวจสอบกับลูกค้าก่อนส่งของ
                  </p>
                </div>
              </div>
            )}

            <FormStep
              id="dn-step-lines"
              number={1}
              title="รายการที่จะส่งรอบนี้"
              description="ตรวจจำนวนส่งให้ตรงของจริง กดทั้งหมดหากส่งครบคงเหลือ ใส่ 0 หากยังไม่ส่งรอบนี้"
              status={s1Status}
              active={s1Status === "todo" && dateDone}
              right={
                <span className="rounded-full bg-paper-soft border border-card-border px-2.5 py-1 text-label font-medium text-ink-600">
                  ส่ง {itemLineCount} รายการ
                </span>
              }
            >
              {saveAttempted && !step1Done && (
                <div className="mb-3 flex items-start gap-2 rounded-control border border-amber-300 bg-amber-50/60 px-3 py-2 text-label leading-5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="font-medium">
                    {itemLineCount === 0
                      ? "ยังไม่มีรายการส่ง — ใส่จำนวนส่งอย่างน้อย 1 รายการ"
                      : "กรอกข้อความหัวข้อกลุ่มให้ครบทุกหัวข้อ"}
                  </p>
                </div>
              )}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={fillAllRemaining}>
                  ใส่คงเหลือทั้งหมด
                </Button>
                <Button variant="secondary" size="sm" onClick={clearZeroLines}>
                  ลบรายการ 0 ออก
                </Button>
                <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-label text-ink-500">
                  <input
                    type="checkbox"
                    checked={hideCompleted}
                    onChange={(event) => setHideCompleted(event.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  ซ่อนรายการที่ครบแล้ว
                  {hiddenCompletedCount > 0 ? ` (${hiddenCompletedCount})` : ""}
                </label>
              </div>
              {amountDisplay !== null && amountDisplay !== "full" && (
                <p className="mb-3 rounded-control border border-line bg-paper-field px-3 py-2 text-label leading-5 text-ink-500">
                  โหมดนี้ซ่อนราคาใน PDF — กดชื่อรายการเพื่อแก้ไขราคา (มีไว้คิดยอดออกบิลต่อเท่านั้น)
                </p>
              )}
              {legacyHeaderConverted && (
                <p className="mb-3 rounded-control border border-line bg-paper-field px-3 py-2 text-label leading-5 text-ink-500">
                  แปลงหัวข้อ SO เดี่ยวเดิมเป็นบรรทัดหัวข้อนี้แล้ว — ตรวจสอบและบันทึกเพื่อยืนยัน
                </p>
              )}
              <div className="overflow-x-auto rounded-card border border-card-border">
                <table className="w-full text-body">
                  <thead>
                    <tr className="border-b border-card-border bg-paper-soft/60 text-left text-label text-ink-500">
                      <th scope="col" className="w-10 px-2 py-2 font-medium">
                        <span className="sr-only">สถานะ</span>
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        รายการ
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        จำนวนส่ง
                      </th>
                      <th scope="col" className="hidden px-2 py-2 font-medium sm:table-cell">
                        หน่วย
                      </th>
                      <th
                        scope="col"
                        className="hidden px-2 py-2 text-right font-medium md:table-cell"
                      >
                        ราคา/หน่วย
                      </th>
                      <th
                        scope="col"
                        className="hidden px-2 py-2 text-right font-medium md:table-cell"
                      >
                        ส่วนลด
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        ยอดเงิน
                      </th>
                      <th scope="col" className="px-2 py-2">
                        <span className="sr-only">จัดการ</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-faint">
                    {visibleLines.map((line) => {
                      const index = lines.findIndex((item) => item.id === line.id);
                      if (line.isSectionMarker) {
                        const markerNumber = lineNumbers.get(line.id);
                        return (
                          <tr key={line.id} id={`dn-line-${line.id}`}>
                            <td colSpan={8} className="px-2 py-2">
                              <div className="flex gap-2">
                                {markerNumber ? (
                                  <div
                                    className={`flex-shrink-0 w-6 h-6 mt-0.5 rounded-full border flex items-center justify-center leading-none ${
                                      line.item_name.trim()
                                        ? "border-success-border bg-paid-bg text-paid-text"
                                        : "border-primary-border bg-primary-soft text-primary"
                                    }`}
                                    title={
                                      line.item_name.trim() ? "กรอกหัวข้อแล้ว" : "ยังไม่กรอกหัวข้อ"
                                    }
                                  >
                                    {line.item_name.trim() ? (
                                      <Check className="h-3.5 w-3.5" />
                                    ) : (
                                      <span className="text-label font-semibold">
                                        {markerNumber}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex-shrink-0 w-6" aria-hidden />
                                )}
                                <div className="flex-1 min-w-0">
                                  <DnSectionMarkerRow
                                    value={line.item_name}
                                    onChange={(value) => updateLine(line.id, { item_name: value })}
                                    onRemove={() => removeLine(line.id)}
                                    onMoveUp={() => moveLine(line.id, "up")}
                                    onMoveDown={() => moveLine(line.id, "down")}
                                    canMoveUp={index > 0}
                                    canMoveDown={index < lines.length - 1}
                                    warnEmpty={emptySectionIds.has(line.id)}
                                    sectionNumber={markerNumber ?? undefined}
                                    itemCount={countSectionItems(lines, line.id)}
                                    onAddItem={() => addItemToSection(line.id)}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      const remaining = line.source
                        ? round3(line.source.quantity - line.delivered - line.pending)
                        : null;
                      const over = remaining !== null && line.quantity > Math.max(0, remaining);
                      const lineCalc = calculateLineAmounts({
                        unit_price: line.unit_price,
                        quantity: line.quantity,
                        discount_percent: line.discount_percent,
                      });
                      const done = line.quantity > 0;
                      const needsPrice = requirePriceReview && !line.price_confirmed;
                      const openEditor = () => setEditingLineId(line.id);

                      return (
                        <tr
                          key={line.id}
                          id={`dn-line-${line.id}`}
                          className={
                            over ? "bg-amber-50/60" : done ? "bg-success-soft/40" : undefined
                          }
                        >
                          <td className="px-2 py-2 align-top">
                            <div
                              className={`flex h-6 w-6 rounded-full border items-center justify-center leading-none ${
                                done
                                  ? "border-success-border bg-paid-bg text-paid-text"
                                  : "border-primary-border bg-primary-soft text-primary"
                              }`}
                              title={done ? "ใส่จำนวนแล้ว" : "ยังไม่ใส่จำนวน"}
                            >
                              {done ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <span className="text-label font-semibold">
                                  {lineNumbers.get(line.id) ?? index + 1}
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            className={`min-w-0 px-2 py-2 align-top ${inSectionIds.has(line.id) ? "pl-7" : ""}`}
                          >
                            <button
                              type="button"
                              onClick={openEditor}
                              className="block min-w-0 text-left"
                              title="แก้ไขรายการ"
                            >
                              <span className="block text-body font-medium text-ink-900">
                                {line.item_name || (
                                  <span className="font-normal text-ink-400">
                                    ยังไม่ระบุชื่อ — แตะเพื่อเพิ่ม
                                  </span>
                                )}
                              </span>
                              {line.source?.item_sku && (
                                <span className="block text-label text-ink-500">
                                  SKU: {line.source.item_sku}
                                </span>
                              )}
                              {line.line_note.trim() && (
                                <span className="block line-clamp-2 text-label text-ink-500">
                                  {line.line_note}
                                </span>
                              )}
                            </button>
                            {over && (
                              <button
                                type="button"
                                onClick={openEditor}
                                className="mt-0.5 block text-left text-label font-medium text-amber-800"
                              >
                                เกินคงเหลือ{" "}
                                {formatQty(round3(line.quantity - Math.max(0, remaining!)))}{" "}
                                {line.source!.unit} — แตะเพื่อแก้ไข
                              </button>
                            )}
                            {needsPrice && (
                              <button
                                type="button"
                                onClick={openEditor}
                                className="mt-0.5 block text-left text-label font-medium text-amber-800"
                              >
                                รอการยืนยันราคา — แตะเพื่อยืนยัน
                              </button>
                            )}
                            {line.hide_amounts_on_print && (
                              <span className="mt-0.5 block text-label text-ink-400">
                                ซ่อนราคาใน PDF
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-top text-right tabular-nums">
                            <button
                              type="button"
                              onClick={openEditor}
                              className="hover:text-primary-deep hover:underline"
                              title="แก้ไขจำนวน"
                            >
                              <span className="font-medium text-ink-800">
                                {formatQty(line.quantity)}
                              </span>
                              <span className="text-label font-normal text-ink-500 sm:hidden">
                                {" "}
                                {line.unit || "—"}
                              </span>
                            </button>
                            {remaining != null && remaining > 0 && (
                              <div className="mt-0.5 text-label text-ink-400">
                                คงเหลือให้ส่ง {formatQty(remaining)}
                              </div>
                            )}
                          </td>
                          <td className="hidden whitespace-nowrap px-2 py-2 align-top sm:table-cell">
                            <button
                              type="button"
                              onClick={openEditor}
                              className="hover:text-primary-deep hover:underline"
                              title="แก้ไขหน่วย"
                            >
                              {line.unit || "—"}
                            </button>
                          </td>
                          <td className="hidden whitespace-nowrap px-2 py-2 text-right align-top tabular-nums md:table-cell">
                            <button
                              type="button"
                              onClick={openEditor}
                              className="hover:text-primary-deep hover:underline"
                              title="แก้ไขราคา"
                            >
                              ฿{formatCurrency(line.unit_price)}
                            </button>
                          </td>
                          <td className="hidden whitespace-nowrap px-2 py-2 text-right align-top tabular-nums md:table-cell">
                            <button
                              type="button"
                              onClick={openEditor}
                              className="hover:text-primary-deep hover:underline"
                              title="แก้ไขส่วนลด"
                            >
                              {line.discount_percent ? `${formatQty(line.discount_percent)}%` : "—"}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right align-top tabular-nums">
                            <div className="font-medium text-ink-800">
                              ฿{formatCurrency(lineCalc.lineTotal)}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 align-top">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={openEditor}
                                aria-label={`แก้ไข ${line.item_name || `รายการที่ ${index + 1}`}`}
                                title="แก้ไขทั้งหมด"
                                className="flex h-8 w-8 items-center justify-center rounded-control border border-card-border text-ink-400 transition-colors hover:border-primary hover:text-primary"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <LineMoveButtons
                                onMoveUp={() => moveLine(line.id, "up")}
                                onMoveDown={() => moveLine(line.id, "down")}
                                canMoveUp={index > 0}
                                canMoveDown={index < lines.length - 1}
                              />
                              <button
                                type="button"
                                onClick={() => removeLine(line.id)}
                                aria-label={`ลบรายการ ${line.item_name || index + 1}`}
                                title="ลบรายการนี้"
                                className="flex h-8 w-8 items-center justify-center rounded-control border border-card-border text-ink-400 transition-colors hover:border-red-300 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleLines.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-label text-ink-400">
                          ยังไม่มีรายการ — กดปุ่มเพิ่มสินค้าด้านล่าง
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => setEditingLineId(addCustomLine())}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  เพิ่มสินค้าหรือบริการ
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center"
                  onClick={addSectionMarker}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  เพิ่มหัวข้อกลุ่ม (SO ของลูกค้า)
                </Button>
              </div>
              <button
                type="button"
                onClick={() => scrollToId("dn-step-print")}
                className="mt-1 w-full text-center text-label font-medium text-primary-deep hover:underline"
              >
                ไปเลือกการแสดงผล ↓
              </button>

              <LineItemEditorModal
                open={editingLine != null}
                line={editingLine}
                isNew={editingLine != null && newLineIdsRef.current.has(editingLine.id)}
                priceWarnPct={isBlankForm ? 0 : priceWarnPct}
                remaining={editingRemaining}
                over={editingOver}
                requirePriceReview={requirePriceReview}
                pricesInternalOnly={amountDisplay !== null && amountDisplay !== "full"}
                onClose={closeEditor}
                onPatch={(patch) => {
                  if (editingLine) updateLine(editingLine.id, patch);
                }}
                onQuantity={(value) => {
                  if (editingLine) updateQuantity(editingLine.id, value);
                }}
                onSetRemaining={() => {
                  if (editingLine) setQuantityToRemaining(editingLine.id);
                }}
                onDelete={() => {
                  if (editingLine) removeLine(editingLine.id);
                }}
                onSaveAndAddAnother={handleSaveAndAddAnother}
                items={catalogItems}
                onNameChange={(value) => {
                  if (editingLine) handleLineNameChange(editingLine.id, value);
                }}
                onPickCatalogItem={(item) => {
                  if (editingLine) applyCatalogItem(editingLine.id, item);
                }}
                canCreateCatalogItem={permissions.canManageCatalog}
                allowDiscount={isDiscountEnabled(clientProfile)}
                onCreateCatalogItem={async (input) => {
                  if (!editingLine)
                    throw new Error(
                      "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e17\u0e35\u0e48\u0e01\u0e33\u0e25\u0e31\u0e07\u0e41\u0e01\u0e49\u0e44\u0e02",
                    );
                  return createCatalogItem(editingLine.id, input);
                }}
                sourceSummary={
                  editingLine?.source
                    ? {
                        quoted: Number(editingLine.source.quantity) || 0,
                        delivered: editingLine.delivered,
                        pending: editingLine.pending,
                        unit: editingLine.source.unit || editingLine.unit,
                      }
                    : null
                }
                onOpenPriceHistory={
                  editingLine?.item_id
                    ? () => setPriceHistoryLineId(editingLine.id)
                    : undefined
                }
                priceHint={editingLine ? renderPriceHint(editingLine) : null}
              />
            </FormStep>

            <FormStep
              id="dn-step-print"
              number={2}
              title="สิ่งที่พิมพ์บนใบส่งของ"
              description="มีผลกับ PDF เท่านั้น — ยอดในระบบยังอยู่ครบไว้ออกบิลต่อ"
              status={s2Status}
              active={s2Status === "todo" && s1Eff}
            >
              {saveAttempted && !step2Done && (
                <div className="mb-3 flex items-start gap-2 rounded-control border border-amber-300 bg-amber-50/60 px-3 py-2 text-label leading-5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="font-medium">เลือกการแสดงจำนวนเงิน 1 แบบก่อนบันทึก</p>
                </div>
              )}
              <DnAmountDisplayPicker
                value={amountDisplay}
                showError={amountDisplaySubmitAttempted}
                hintValue={amountHint}
                onChange={(value) => {
                  if (amountDisplay === "hidden" && value === "full") {
                    setPendingAmount(value);
                    return;
                  }
                  applyAmountDisplay(value);
                }}
              />
              <div className="mt-3 border-t border-card-border pt-3">
                <PoTaskFields
                  taskName={taskName}
                  onTaskNameChange={setTaskName}
                  customerPo={customerPo}
                  onCustomerPoChange={setCustomerPo}
                  taskSuggestions={referenceHistory.taskValues}
                  poSuggestions={referenceHistory.poValues}
                  sourceHint={
                    taskName.trim() || customerPo.trim()
                      ? `ใบเสนอราคา ${quotation?.doc_number || ""}`
                      : null
                  }
                />
                <div className="mt-3">
                  <Input
                    label="หมายเหตุบนใบส่งของ"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="เช่น ส่งบางส่วนจากใบเสนอราคา"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => scrollToId("dn-step-review")}
                className="mt-3 text-label font-medium text-primary-deep hover:underline"
              >
                ไปตรวจสอบ ↓
              </button>
            </FormStep>

            <FormStep id="dn-step-review" number={3} title="ตรวจสอบและบันทึก" active={s2Eff}>
              <div className="space-y-3">
                <div className="rounded-card border border-card-border bg-paper-soft p-3 text-body">
                  <div className="mb-2 flex items-center gap-2 text-label font-medium text-ink-500">
                    <PackageCheck className="h-3.5 w-3.5" />
                    สรุปภายในระบบ
                  </div>
                  <div className="flex justify-between">
                    <span>จำนวนรายการที่จะสร้าง</span>
                    <span>
                      {selectedLines.filter((line) => !line.isSectionMarker).length} รายการ
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span>มูลค่าอ้างอิง</span>
                    <span className="tabular-nums">฿{formatCurrency(tax.total)}</span>
                  </div>
                  {amountDisplay === "full" ? (
                    <p className="mt-2 text-label leading-5 text-blue-600">
                      PDF ใบส่งของจะแสดงราคาและยอดรวมด้วย
                    </p>
                  ) : amountDisplay === "blank" ? (
                    <p className="mt-2 text-label leading-5 text-ink-500">
                      มูลค่านี้ใช้สำหรับรวมออกใบแจ้งหนี้ภายหลัง แต่ PDF
                      ใบส่งของจะเว้นช่องให้กรอกด้วยมือ
                    </p>
                  ) : amountDisplay === "hidden" ? (
                    <p className="mt-2 text-label leading-5 text-ink-500">
                      มูลค่านี้ใช้สำหรับรวมออกใบแจ้งหนี้ภายหลัง แต่ PDF ใบส่งของจะไม่แสดงราคา
                    </p>
                  ) : (
                    <p className="mt-2 text-label leading-5 text-ink-400">
                      เลือกการแสดงจำนวนเงินใน PDF ที่ขั้นตอนที่ 2 ก่อนบันทึก
                    </p>
                  )}
                </div>
                <EditableDocNumber
                  value={docNumberOverride}
                  onChange={setDocNumberOverride}
                  placeholder="เลขที่ใบส่งของ (เว้นว่าง = สร้างอัตโนมัติ)"
                  autoGenerate={async () =>
                    userId
                      ? await resolveDocNumber(
                          userId,
                          "delivery_note",
                          issueDate,
                          undefined,
                          documentId,
                        )
                      : ""
                  }
                  className="mb-3"
                />
              </div>
            </FormStep>

            <FormActionBar
              contextLabel={`${quotation?.customer?.name || ""} · ส่ง ${itemLineCount} รายการ`}
              totalLabel="มูลค่าอ้างอิง"
              total={tax.total}
              hint={
                !issueDate
                  ? "เลือกวันที่ส่งของ"
                  : itemLineCount === 0
                    ? "ใส่จำนวนส่งอย่างน้อย 1 รายการ"
                    : emptyMarkerIds.length > 0
                      ? "กรอกข้อความหัวข้อกลุ่มให้ครบ"
                      : amountDisplay == null
                        ? "เลือกการแสดงจำนวนเงินในขั้นตอนที่ 2"
                        : pricePendingIds.length > 0
                          ? `ยืนยันราคาอีก ${pricePendingIds.length} รายการ`
                          : null
              }
              hintOnClick={firstBlockerTarget ? () => scrollToId(firstBlockerTarget) : null}
              primary={{
                label: isEditing ? "บันทึกร่างใบส่งของ" : "สร้างใบส่งของฉบับร่าง",
                onClick: handleSave,
                loading: saving,
                // Readiness gate: never clickable while anything is missing —
                // the hint above names the blocker and jumps to it.
                disabled: firstBlockerTarget != null || saving,
              }}
            />
          </div>
        </div>

        <Modal
          open={pendingAmount != null}
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
                if (pendingAmount != null) applyAmountDisplay(pendingAmount);
                setPendingAmount(null);
              }}
            >
              แสดงราคา
            </Button>
          </div>
        </Modal>
        {(() => {
          const target = lines.find((line) => line.id === priceHistoryLineId) || null;
          const targetItem = target?.item_id
            ? catalogItems.find((item) => item.id === target.item_id)
            : null;
          if (!target || !targetItem || !userId) return null;
          return (
            <PriceHistorySheet
              open
              onClose={() => setPriceHistoryLineId(null)}
              userId={userId}
              itemId={targetItem.id}
              itemName={targetItem.name}
              customerId={quotation?.customer_id ?? null}
              customerName={quotation?.customer?.name ?? null}
              excludeDocumentId={documentId || null}
              currentPrice={target.unit_price}
              onApply={(price) => {
                updateLine(target.id, { unit_price: price, price_confirmed: true });
                setPriceHistoryLineId(null);
              }}
            />
          );
        })()}
      </div>
    </AppShell>
  );
}
