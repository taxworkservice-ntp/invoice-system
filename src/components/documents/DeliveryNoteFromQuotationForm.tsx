import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Check, PackageCheck, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Switch";
import { Input } from "../ui/Input";
import { DateInput } from "../ui/DateInput";
import { Spinner } from "../ui/Spinner";
import { EmptyState } from "../ui/EmptyState";
import { PriceReviewControl } from "./PriceReviewControl";
import { useAuth, useClientProfile } from "../../hooks/useAuth";
import { useCustomerReferenceHistory } from "../../hooks/useCustomerReferenceHistory";
import { useToast } from "../../hooks/useToast";
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
import { calculateLineAmounts, calculateTax } from "../../lib/tax";
import { formatBuddhistDate } from "../../lib/dates";
import { formatCurrency } from "../../lib/format";
import type { Customer, Document, DocumentLineItem, DocumentStatus } from "../../types";
import { EditableDocNumber } from "./EditableDocNumber";
import { DnAmountDisplayPicker, type DnAmountDisplay } from "./DocumentOptions";
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
  // Mandatory DN price review (opt-in per client): false until the officer
  // edits the price input or ticks the per-line confirm checkbox.
  price_confirmed: boolean;
  discount_percent: number;
  line_note: string;
  base_quantity: number | null;
  qty_carton: number | null;
  carton_unit: string | null;
  hide_amounts_on_print: boolean;
  /** Section-header (grouping) line: no qty/price, prints as a group header. */
  isSectionMarker: boolean;
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

/**
 * Focus the first input of a freshly inserted line row (insert-anywhere UX).
 * No-op when the row was not inserted (guard rejected) or not yet painted.
 */
function focusLineInput(id: string) {
  window.setTimeout(() => {
    const input = document.querySelector(`#dn-line-${id} input`);
    if (input instanceof HTMLElement) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus({ preventScroll: true });
    }
  }, 30);
}

function blankDeliveryLine(): DeliveryLine {
  return {
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
  const { profile } = useAuth();
  const userId = profile?.id;
  const { clientProfile } = useClientProfile(userId);
  const businessToday = businessTodayString(clientProfile);
  const todayString = () => businessToday;
  const toast = useToast();

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
  // Section grouping is opt-in per DN (default off = today's flat flow).
  // UI-only state, initialized from data — never persisted on its own.
  const [groupingEnabled, setGroupingEnabled] = useState(false);
  // Hide lines that are already fully delivered (qty 0 + nothing remaining).
  const [hideCompleted, setHideCompleted] = useState(false);
  // Per-line "รายละเอียดราคา" disclosure — independent of save data.
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const toggleLineExpanded = (lineId: string) => {
    setExpandedLines((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [docNumberOverride, setDocNumberOverride] = useState("");
  const [error, setError] = useState("");
  // Required amount-display mode — never pre-selected. The officer picks
  // explicitly on every delivery note (draft edits hydrate the saved mode).
  const [amountDisplay, setAmountDisplay] = useState<DnAmountDisplay | null>(null);
  // Pending hidden→full switch awaiting modal confirmation (reveals prices to
  // the recipient — never a silent switch).
  const [pendingAmount, setPendingAmount] = useState<DnAmountDisplay | null>(null);

  const applyAmountDisplay = (value: DnAmountDisplay) => {
    setAmountDisplaySubmitAttempted(false);
    setAmountDisplay(value);
  };
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
  const requirePriceReview = clientProfile?.require_dn_price_review === true && !isBlankForm;

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
          if (legacyHeader || initialLines.some((line) => line.isSectionMarker)) {
            setGroupingEnabled(true);
          }
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
  const pricePendingIds = useMemo(
    () =>
      requirePriceReview
        ? selectedLines
            .filter((line) => !line.isSectionMarker && !line.price_confirmed)
            .map((line) => line.id)
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
      targetId: "dn-header",
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
  const spyActive = useScrollSpy(["dn-header", "dn-step-lines", "dn-step-print"]);
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
    ? "dn-header"
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
  const lineNumbers = useMemo(
    () => (groupingEnabled ? getDnSectionDisplayNumbers(lines) : null),
    [groupingEnabled, lines],
  );
  const emptySectionIds = useMemo(
    () => (groupingEnabled ? getDnSectionMarkersWithoutChildren(lines) : new Set<string>()),
    [groupingEnabled, lines],
  );
  // Item ids nested under a non-blank marker — indented as a visual section.
  // Mirrors getDnSectionDisplayNumbers: a blank marker ends the run.
  const inSectionIds = useMemo(() => {
    if (!groupingEnabled) return new Set<string>();
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
  }, [groupingEnabled, lines]);

  const moveLine = (lineId: string, direction: "up" | "down") => {
    setLines((current) => {
      const index = current.findIndex((line) => line.id === lineId);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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

  const stepQuantity = (lineId: string, delta: number) => {
    setLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? { ...line, quantity: Math.max(0, round3(line.quantity + delta)) }
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

  const addCustomLine = () => {
    const line = blankDeliveryLine();
    setLines((current) => [...current, line]);
    focusLineInput(line.id);
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

  /** Insert a blank header directly above a line — no append-then-shuffle. */
  const insertSectionMarkerAbove = (lineId: string) => {
    const marker = deliverySectionMarker();
    setLines((current) => {
      const idx = current.findIndex((item) => item.id === lineId);
      const at = idx < 0 ? current.length : idx;
      const prevLine = current[at - 1];
      if (prevLine && prevLine.isSectionMarker && !prevLine.item_name.trim()) return current;
      return [...current.slice(0, at), marker, ...current.slice(at)];
    });
    focusLineInput(marker.id);
  };

  /** Append a blank item at the end of a marker's section. */
  const addItemToSection = (markerId: string) => {
    const line = blankDeliveryLine();
    setLines((current) => {
      const index = findSectionEndIndex(current, markerId);
      return [...current.slice(0, index), line, ...current.slice(index)];
    });
    focusLineInput(line.id);
  };

  const removeLine = (lineId: string) => {
    setLines((current) => current.filter((line) => line.id !== lineId));
  };

  const toggleGrouping = (on: boolean) => {
    // Turning off deletes the headers (with confirmation) — hidden markers
    // that still affect the printout would be worse than asking once.
    if (!on && lines.some((line) => line.isSectionMarker)) {
      const count = lines.filter((line) => line.isSectionMarker).length;
      const ok = window.confirm(
        `ปิดการจัดกลุ่มจะลบหัวข้อกลุ่มทั้ง ${count} หัวข้อ — รายการสินค้าคงอยู่ครบและเรียงต่อเนื่องแบบปกติ ยืนยันหรือไม่?`,
      );
      if (!ok) return;
      setLines((current) => current.filter((line) => !line.isSectionMarker));
    }
    setGroupingEnabled(on);
  };

  const handleSave = async () => {
    if (!quotation || !userId || selectedLines.length === 0) return;
    // No-default date: the officer must pick explicitly.
    if (!issueDate) {
      setSaveAttempted(true);
      setError("กรุณาเลือกวันที่ส่งของ");
      scrollToId("dn-header");
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
      const pending = selectedLines.filter(
        (line) => !line.isSectionMarker && !line.price_confirmed,
      );
      if (pending.length > 0) {
        setSaveAttempted(true);
        setError(`กรุณายืนยันราคาทุกรายการก่อนบันทึกใบส่งของ (เหลือ ${pending.length} รายการ)`);
        // Auto-expand the pending lines so the confirm control is visible.
        setExpandedLines((current) => {
          const next = new Set(current);
          pending.forEach((line) => next.add(line.id));
          return next;
        });
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
          base_quantity: line.source
            ? getBaseQuantity(line.source, line.quantity)
            : line.base_quantity,
          discount_percent: line.discount_percent,
          discount_amount: calc.discountAmount,
          qty_carton: line.source
            ? line.source.qty_carton
              ? line.quantity
              : null
            : line.qty_carton,
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
        <Card id="dn-header" tone={issueDate ? "success" : undefined}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-label font-medium text-ink-500">อ้างอิงใบเสนอราคา</div>
              <div className="mt-1 text-subtitle font-semibold text-ink-900">
                {quotation.doc_number || "-"}
              </div>
              <div className="mt-1 text-body text-ink-500">
                {quotation.customer?.name || "ลูกค้า"}
              </div>
              <div className="mt-2 text-label leading-5 text-ink-500">
                เสนอ {formatQty(deliveryProgress.quoted)} · ส่งแล้ว{" "}
                {formatQty(deliveryProgress.delivered)} · รอบนี้{" "}
                {formatQty(deliveryProgress.thisRound)}
              </div>
            </div>
            <div className="w-[160px]">
              <label className="mb-1 block text-label font-medium text-ink-600">
                วันที่ส่งของ <span className="text-danger">*</span>
              </label>
              <DateInput value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
              {issueDate ? (
                <div className="mt-1 text-label text-ink-400">
                  วันที่ใบเสนอราคา {formatBuddhistDate(quotation.issue_date)}
                </div>
              ) : (
                <div className="mt-1 text-label font-medium text-ink-500">ยังไม่เลือกวันที่</div>
              )}
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
                  โหมดนี้ซ่อนราคาใน PDF — ราคาด้านล่างมีไว้คิดยอดออกบิลต่อเท่านั้น
                </p>
              )}
              <div className="rounded-control border border-dashed border-card-border px-3 py-2">
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
                    แปลงหัวข้อ SO เดี่ยวเดิมเป็นบรรทัดหัวข้อนี้แล้ว — ตรวจสอบและบันทึกเพื่อยืนยัน
                  </p>
                )}
              </div>
              <div className="space-y-2">
                {visibleLines.map((line) => {
                  const index = lines.findIndex((item) => item.id === line.id);
                  if (line.isSectionMarker && groupingEnabled) {
                    const markerNumber = lineNumbers?.get(line.id);
                    return (
                      <div key={line.id} id={`dn-line-${line.id}`} className="flex gap-2">
                        {markerNumber ? (
                          <div
                            className={`flex-shrink-0 w-6 h-6 mt-0 rounded-full border flex items-center justify-center leading-none ${
                              line.item_name.trim()
                                ? "border-success-border bg-paid-bg text-paid-text"
                                : "border-primary-border bg-primary-soft text-primary"
                            }`}
                            title={line.item_name.trim() ? "กรอกหัวข้อแล้ว" : "ยังไม่กรอกหัวข้อ"}
                          >
                            {line.item_name.trim() ? (
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

                  return (
                    <div
                      key={line.id}
                      id={`dn-line-${line.id}`}
                      className={`flex gap-2 ${inSectionIds.has(line.id) ? "ml-7" : ""}`}
                    >
                      {(() => {
                        const done = line.quantity > 0;
                        return (
                          <div
                            className={`flex-shrink-0 w-6 h-6 mt-0 rounded-full border flex items-center justify-center leading-none ${
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
                                {lineNumbers?.get(line.id) ?? index + 1}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <div
                        className={`flex-1 min-w-0 rounded-card border p-3 ${over ? "border-amber-300 bg-amber-50/40" : line.quantity > 0 ? "border-success-border bg-white" : "border-card-border bg-white"}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <Input
                              label="ชื่อสินค้า / รายละเอียด"
                              value={line.item_name}
                              onChange={(event) =>
                                updateLine(line.id, { item_name: event.target.value })
                              }
                              placeholder="ระบุชื่อสินค้า"
                            />
                            {line.source?.item_sku && (
                              <div className="mt-0.5 text-label text-ink-500">
                                SKU: {line.source.item_sku}
                              </div>
                            )}
                          </div>
                          <LineMoveButtons
                            className="mt-5"
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
                            className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-card-border text-ink-400 transition-colors hover:border-red-300 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {line.source &&
                          (() => {
                            const quoted = Number(line.source.quantity) || 0;
                            const done = round3(line.delivered + line.pending);
                            const pct =
                              quoted > 0 ? Math.min(100, Math.round((done / quoted) * 100)) : 0;
                            return (
                              <div className="mt-2">
                                <div className="text-label leading-5 text-ink-500">
                                  เสนอ {formatQty(quoted)} · ส่งแล้ว {formatQty(line.delivered)}
                                  {line.pending > 0
                                    ? ` · ร่างค้าง ${formatQty(line.pending)}`
                                    : ""}{" "}
                                  ·{" "}
                                  <span
                                    className={`font-medium ${remaining! < 0 ? "text-red-700" : "text-ink-800"}`}
                                  >
                                    คงเหลือ {formatQty(Math.max(0, remaining!))} {line.source.unit}
                                  </span>
                                </div>
                                <div
                                  className="mt-1 h-1 overflow-hidden rounded-full bg-line-soft"
                                  aria-hidden
                                >
                                  <div
                                    className="h-full rounded-full bg-primary/60"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()}

                        <div className="mt-3 flex flex-wrap items-end gap-2">
                          <div className="flex items-end gap-1">
                            <button
                              type="button"
                              onClick={() => stepQuantity(line.id, -1)}
                              aria-label="ลดจำนวน"
                              className="flex h-9 w-9 items-center justify-center rounded-control border border-card-border text-body text-ink-600 hover:border-primary hover:text-primary"
                            >
                              −
                            </button>
                            <div className="w-28">
                              <Input
                                label="จำนวนส่ง"
                                type="number"
                                min="0"
                                step="0.001"
                                value={line.quantity}
                                onChange={(event) => updateQuantity(line.id, event.target.value)}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => stepQuantity(line.id, 1)}
                              aria-label="เพิ่มจำนวน"
                              className="flex h-9 w-9 items-center justify-center rounded-control border border-card-border text-body text-ink-600 hover:border-primary hover:text-primary"
                            >
                              +
                            </button>
                          </div>
                          <div className="w-24">
                            <Input
                              label="หน่วย"
                              value={line.unit}
                              onChange={(event) =>
                                updateLine(line.id, { unit: event.target.value })
                              }
                              placeholder="ชิ้น"
                            />
                          </div>
                          {remaining != null && remaining > 0 && line.quantity !== remaining && (
                            <button
                              type="button"
                              onClick={() => setQuantityToRemaining(line.id)}
                              className="mb-0.5 rounded-full border border-primary-border bg-primary-soft px-2.5 py-1 text-label font-medium text-primary-deep hover:bg-primary-soft/70"
                            >
                              ทั้งหมด {formatQty(remaining)}
                            </button>
                          )}
                          <div className="mb-1 ml-auto text-right">
                            <div className="text-label font-medium tabular-nums text-ink-700">
                              ฿{formatCurrency(lineCalc.lineTotal)}
                            </div>
                            <div className="text-label tabular-nums text-ink-400">
                              {formatQty(line.quantity)} × ฿{formatCurrency(line.unit_price)}
                            </div>
                          </div>
                        </div>

                        {over && (
                          <div className="mt-2 text-label font-medium text-amber-800">
                            เกินคงเหลือ {formatQty(round3(line.quantity - Math.max(0, remaining!)))}{" "}
                            {line.source!.unit} — ตรวจสอบกับลูกค้าก่อนส่ง
                          </div>
                        )}
                        {groupingEnabled && (
                          <button
                            type="button"
                            onClick={() => insertSectionMarkerAbove(line.id)}
                            className="mt-2 text-label text-ink-400 hover:text-primary-deep hover:underline"
                          >
                            + เพิ่มหัวข้อกลุ่มเหนือรายการนี้
                          </button>
                        )}

                        {requirePriceReview && !line.price_confirmed && (
                          <div className="mt-2">
                            <PriceReviewControl
                              className="rounded-control border border-line bg-paper-field px-3 py-2"
                              confirmed={line.price_confirmed}
                              onConfirm={() => updateLine(line.id, { price_confirmed: true })}
                              onUnconfirm={() => updateLine(line.id, { price_confirmed: false })}
                            />
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleLineExpanded(line.id)}
                          aria-expanded={expandedLines.has(line.id)}
                          className="mt-2 text-label font-medium text-primary-deep hover:underline"
                        >
                          {expandedLines.has(line.id)
                            ? "ซ่อนราคา / หมายเหตุ"
                            : "ราคา / ส่วนลด / หมายเหตุ"}
                          {requirePriceReview && line.price_confirmed ? " · ยืนยันราคาแล้ว" : ""}
                          {line.hide_amounts_on_print ? " · ซ่อนราคาใน PDF" : ""}
                        </button>

                        {expandedLines.has(line.id) && (
                          <div className="mt-2 space-y-2 rounded-control border border-line bg-paper-field/60 p-3">
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                label="ราคา/หน่วย (เก็บไว้คิดบิลต่อ)"
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unit_price}
                                onChange={(event) => {
                                  const next = Number(event.target.value);
                                  updateLine(line.id, {
                                    unit_price: Number.isFinite(next) ? Math.max(0, next) : 0,
                                    price_confirmed: true,
                                  });
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
                                  updateLine(line.id, {
                                    discount_percent: Number.isFinite(next) ? Math.max(0, next) : 0,
                                  });
                                }}
                              />
                            </div>

                            {requirePriceReview && line.price_confirmed && (
                              <PriceReviewControl
                                className="rounded-control border border-line bg-white px-3 py-2"
                                confirmed={line.price_confirmed}
                                onConfirm={() => updateLine(line.id, { price_confirmed: true })}
                                onUnconfirm={() => updateLine(line.id, { price_confirmed: false })}
                              />
                            )}

                            <Input
                              label="หมายเหตุของรายการ"
                              value={line.line_note}
                              onChange={(event) =>
                                updateLine(line.id, { line_note: event.target.value })
                              }
                              placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                            />

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateLine(line.id, {
                                    hide_amounts_on_print: !line.hide_amounts_on_print,
                                  })
                                }
                                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-label transition-colors ${line.hide_amounts_on_print ? "border-amber-300 bg-amber-50 text-amber-800" : "border-card-border bg-white text-ink-500 hover:border-primary hover:text-primary"}`}
                                title={
                                  line.hide_amounts_on_print
                                    ? "คลิกเพื่อแสดงราคาในเอกสาร"
                                    : "คลิกเพื่อซ่อนราคาในเอกสาร"
                                }
                              >
                                {line.hide_amounts_on_print ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                                {line.hide_amounts_on_print
                                  ? "ซ่อนราคาแล้ว"
                                  : "ซ่อนราคาเฉพาะรายการนี้"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center"
                  onClick={addCustomLine}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  เพิ่มสินค้าหรือบริการ
                </Button>
                {groupingEnabled && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-center"
                    onClick={addSectionMarker}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    เพิ่มหัวข้อกลุ่ม (SO ของลูกค้า)
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => scrollToId("dn-step-print")}
                  className="mt-1 w-full text-center text-label font-medium text-primary-deep hover:underline"
                >
                  ไปเลือกการแสดงผล ↓
                </button>
              </div>
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
                disabled: selectedLines.length === 0 || saving,
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
      </div>
    </AppShell>
  );
}
