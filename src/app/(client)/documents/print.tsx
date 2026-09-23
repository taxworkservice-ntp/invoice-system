import { useEffect, useRef, useState, type ReactNode } from "react";
import { localTodayString } from "../../../lib/devDate";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { SectionCard } from "../../../components/ui/SectionCard";
import { Select } from "../../../components/ui/Input";
import { Switch } from "../../../components/ui/Switch";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { PrintDocument } from "../../../components/print/PrintDocument";
import type { CopyType } from "../../../components/print/PrintDocument";
import { PrintDocumentClassicV2 } from "../../../components/print/PrintDocumentClassicV2";
import { PrintErrorBoundary } from "../../../components/print/PrintErrorBoundary";
import { PrintAppendix } from "../../../components/print/PrintAppendix";
import { getPrintDocumentData, type PrintDocumentData } from "../../../lib/print";
import {
  applyAppendixToData,
  isDnHeaderRow,
  type PrintAppendixData,
} from "../../../lib/print";
import { getDnVarianceParts } from "../../../lib/dnVariance";
import { isDnMarkerLine } from "../../../lib/print";
import { buildDnBlocks, buildDnSectionPlan, buildDnSoHeaderPlan, DN_GROUP_SPACER_MM, DN_GROUP_SPACER_COMPACT_MM, getDnSoHeaderText, planDnRows } from "../../../lib/dnGroups";
import { apiFetchBlob } from "../../../lib/api";
import { buildZipBlob, safeZipSegment } from "../../../lib/download/zip";
import { CLASSIC_V2_TYPE_GLOBAL_KEY, DOCUMENT_FONT_SCALE_DEFAULT, CLASSIC_V2_CHEQUE_STRIP_RESERVE_MM, CLASSIC_V2_META_ROW_RESERVE_MM, CLASSIC_V2_HIDE_EN_META_ROW_MM, CLASSIC_V2_HIDE_EN_THEAD_MM, CLASSIC_V2_HIDE_EN_SIG_MM, CLASSIC_V2_COMPACT_SIG_MM, CLASSIC_V2_COMPACT_DN_BONUS_MM, CLASSIC_V2_SIG_STRIP_MM, getClassicV2FontScaleMult, getClassicV2EffectiveFontScaleMult, getClassicV2EffectiveSectionScaleMult } from "../../../constants";
import { PRINT_TITLE_PRESETS, writeLastPrintTitleVariant } from "../../../lib/docLabels";
import { useWorkspaceFeatures } from "../../../hooks/useAuth";
import { paginateRows, type GenericPageBatch } from "../../../lib/pagination";
import type { ClassicV2FontScales } from "../../../lib/pagination";
import {
  estimateLineItemHeight,
  estimateSummaryRowHeight,
} from "../../../lib/printRowHeight";
import type {
  BillingNoteInvoice,
  DocumentLineItem,
  InvoiceDeliveryNote,
  ReceiptInvoice,
} from "../../../types";

import { supabase } from "../../../lib/supabase";

type CopyOrder = "original-first" | "copy-first";

type SaveMode = "single" | "combined" | "separate";

/** Small segmented toggle (rounded-control + line + primary tokens). */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-control border border-line bg-ink-50 p-0.5">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-[6px] px-2 py-0.5 text-label font-medium transition-colors ${
              active
                ? "border border-line-strong bg-white text-ink-900"
                : "border border-transparent text-ink-500 hover:text-ink-700"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Inline "label + control" group for the download toolbar. */
function InlineControl({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2 ${className}`}>
      <span className="text-label font-medium text-ink-500">{label}</span>
      {children}
    </div>
  );
}

type PrintBatch =
  | { kind: "line_items"; batch: GenericPageBatch<DocumentLineItem> }
  | { kind: "billing_invoices"; batch: GenericPageBatch<BillingNoteInvoice> }
  | { kind: "receipt_invoices"; batch: GenericPageBatch<ReceiptInvoice> }
  | { kind: "dn_summary"; batch: GenericPageBatch<InvoiceDeliveryNote> };

function getPrintBatches(data: PrintDocumentData, blankForm = false, dnAppendix = data.document.dn_appendix, refMode = false): PrintBatch[] {
  const { filteredLineItems } = applyAppendixToData({ ...data, document: { ...data.document, dn_appendix: dnAppendix } });
  const isClassicV2 = data.template === "classic_v2";
  const sectionScales = data.clientProfile.pdf_section_font_scales ?? data.clientProfile.classic_v2_section_font_scales;
  const typeFontScales = (data.clientProfile.pdf_type_font_scales ?? data.clientProfile.classic_v2_type_font_scales)?.[data.document.doc_type];
  // An explicit per-document override applies to the whole document (all
  // sections) — it beats type and workspace scales.
  const docOverrideMult =
    data.document.print_font_scale && data.document.print_font_scale !== DOCUMENT_FONT_SCALE_DEFAULT
      ? getClassicV2FontScaleMult(data.document.print_font_scale)
      : null;
  // Shared font scales apply to both HTML templates (Modern + Classic V2); the
  // Modern-only extras below (space bonus, cheque strip, per-page strip,
  // continuation-full-header) stay gated on isClassicV2.
  const globalScale = docOverrideMult ?? getClassicV2EffectiveFontScaleMult(
    data.document.print_font_scale,
    typeFontScales?.[CLASSIC_V2_TYPE_GLOBAL_KEY],
    data.clientProfile.pdf_font_scale ?? data.clientProfile.classic_v2_font_scale,
  );
  const itemsScale = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("items", typeFontScales, sectionScales, globalScale);
  const numScale = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("num", typeFontScales, sectionScales, globalScale);
  const headerScale = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("header", typeFontScales, sectionScales, globalScale);
  const termsScale = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("terms", typeFontScales, sectionScales, globalScale);
  // Budgets account for every fixed page block; row-text estimates use the
  // description (items) + numeric column scales. Sub-slots (company/title/
  // info/net/payment) ride along so the paginator can reserve using the
  // tallest sub-scale of each fixed block.
  const budgetScales: number | ClassicV2FontScales = docOverrideMult ?? {
    header: headerScale,
    header_company: getClassicV2EffectiveSectionScaleMult("header_company", typeFontScales, sectionScales, globalScale),
    header_title: getClassicV2EffectiveSectionScaleMult("header_title", typeFontScales, sectionScales, globalScale),
    header_info: getClassicV2EffectiveSectionScaleMult("header_info", typeFontScales, sectionScales, globalScale),
    items: itemsScale,
    num: numScale,
    thead: getClassicV2EffectiveSectionScaleMult("thead", typeFontScales, sectionScales, globalScale),
    totals: getClassicV2EffectiveSectionScaleMult("totals", typeFontScales, sectionScales, globalScale),
    totals_net: getClassicV2EffectiveSectionScaleMult("totals_net", typeFontScales, sectionScales, globalScale),
    payment: getClassicV2EffectiveSectionScaleMult("payment", typeFontScales, sectionScales, globalScale),
    terms: termsScale,
    footer: getClassicV2EffectiveSectionScaleMult("footer", typeFontScales, sectionScales, globalScale),
  };
  // Billing notes carry the slim cheque-date row (CLASSIC_V2_CHEQUE_STRIP_RESERVE_MM) — reserved
  // from every page budget so rows never clip under it. Optional meta rows
  // (ชื่อโครงการ / PO NO.) grow the info band the same way — reserve their
  // measured height so dense pages never overflow A4. With ซ่อนป้ายภาษาอังกฤษ
  // the meta rows render shorter, so their reserve shrinks accordingly.
  const hideEn = isClassicV2 && data.clientProfile.classic_v2_hide_english_labels === true;
  const compactSig = isClassicV2 && data.clientProfile.classic_v2_compact_signature === true;
  // Opt-in compact delivery-note spacing (no font change) — mirrors the CSS
  // class and the compactDn row metrics; DN-only.
  const compactDn =
    isClassicV2 &&
    data.document.doc_type === "delivery_note" &&
    data.clientProfile.classic_v2_compact_dn === true;
  const metaRowReserveMm = hideEn
    ? CLASSIC_V2_META_ROW_RESERVE_MM - CLASSIC_V2_HIDE_EN_META_ROW_MM
    : CLASSIC_V2_META_ROW_RESERVE_MM;
  // The strip only prints while the billing note is unpaid — paid notes get
  // the space back (matches PrintDocumentClassicV2's render condition).
  const extraReserveMm = (isClassicV2 && data.document.doc_type === "billing_note" && data.document.status !== "paid"
    ? CLASSIC_V2_CHEQUE_STRIP_RESERVE_MM
    : 0) + (isClassicV2
    ? ((data.document.task_name ? metaRowReserveMm : 0) +
       (data.document.customer_po_number ? metaRowReserveMm : 0)) * headerScale
    : 0);
  // Space savings returned to the budgets (fixed blocks render smaller):
  // hide-EN shrinks each visible meta row + thead + signature titles; the
  // compact signature band shrinks the whole band. DATE/NO always print;
  // DUE DATE / PO / PROJECT are conditional. The multi-page first page has
  // no totals/signature band, so its bonus covers the band + thead only.
  const metaRowCount =
    2 +
    (data.document.due_date ? 1 : 0) +
    (data.document.task_name ? 1 : 0) +
    (data.document.customer_po_number ? 1 : 0);
  const hideEnBandMm = hideEn ? metaRowCount * CLASSIC_V2_HIDE_EN_META_ROW_MM : 0;
  const hideEnTheadMm = hideEn ? CLASSIC_V2_HIDE_EN_THEAD_MM : 0;
  const hideEnSigBonus = hideEn ? CLASSIC_V2_HIDE_EN_SIG_MM : 0;
  const compactSigBonus = compactSig ? CLASSIC_V2_COMPACT_SIG_MM : 0;
  const spaceBonusMm = isClassicV2 && (hideEn || compactSig || compactDn)
    ? {
        first: hideEnBandMm + hideEnTheadMm + hideEnSigBonus + compactSigBonus + (compactDn ? CLASSIC_V2_COMPACT_DN_BONUS_MM.first : 0),
        firstMulti: hideEnBandMm + hideEnTheadMm + (compactDn ? CLASSIC_V2_COMPACT_DN_BONUS_MM.firstMulti : 0),
        continuation: hideEnTheadMm + (compactDn ? CLASSIC_V2_COMPACT_DN_BONUS_MM.continuation : 0),
        last: hideEnBandMm + hideEnTheadMm + hideEnSigBonus + compactSigBonus + (compactDn ? CLASSIC_V2_COMPACT_DN_BONUS_MM.last : 0),
      }
    : undefined;
  const continuationFullHeader = isClassicV2 && data.clientProfile.classic_v2_full_page_header === true;
  // Per-page signature-initials strip (เซ็นกำกับทุกหน้า): pinned to the
  // bottom of multi-page first + continuation pages. Reserve its height in
  // those pages' row budgets (mirrors the render condition in
  // PrintDocumentClassicV2); single/last pages show the full band instead.
  const stripReserveMm = isClassicV2 && data.clientProfile.classic_v2_sign_every_page === true
    ? CLASSIC_V2_SIG_STRIP_MM
    : 0;
  // Reference mode (classic V2): the DN summary table paginates with the
  // same summary machinery as the billing-note table — identical fill-first
  // behavior, continuous numbering, last-only padding and footer.
  if (
    isClassicV2 &&
    refMode &&
    data.document.doc_type === "invoice" &&
    data.invoiceDeliveryNotes.length > 0
  ) {
    return paginateRows(
      data.invoiceDeliveryNotes,
      data.template,
      "summary_rows",
      { estimateHeight: () => estimateSummaryRowHeight(data.template, itemsScale, numScale), fontScale: budgetScales, extraReserveMm, spaceBonusMm, stripReserveMm },
    ).map((batch) => ({ kind: "dn_summary", batch }));
  }
  if (data.document.doc_type === "billing_note" && data.document.vat_registered) {
    return paginateRows(
      data.billingNoteInvoices,
      data.template,
      "summary_rows",
      { estimateHeight: () => estimateSummaryRowHeight(data.template, itemsScale, numScale), fontScale: budgetScales, extraReserveMm, spaceBonusMm, stripReserveMm },
    ).map((batch) => ({ kind: "billing_invoices", batch }));
  }

  if (
    data.document.doc_type === "receipt" &&
    data.document.vat_registered &&
    data.receiptInvoices.length > 0
  ) {
    return paginateRows(
      data.receiptInvoices,
      data.template,
      "summary_rows",
      { estimateHeight: () => estimateSummaryRowHeight(data.template, itemsScale, numScale), fontScale: budgetScales, stripReserveMm },
    ).map((batch) => ({ kind: "receipt_invoices", batch }));
  }

  const hideDeliveryAmounts =
    data.document.doc_type === "delivery_note" &&
    data.document.hide_amounts_on_print !== false;
  const effectiveHideAmounts = blankForm ? false : hideDeliveryAmounts;
  // Classic V2 delivery notes draw their totals column only when amounts are
  // shown and the form isn't blank (see PrintDocumentClassicV2). Mirror that
  // gate here so the paginator does not reserve the scaled totals block for a
  // block the sheet never renders — that phantom reserve was splitting small
  // DNs into an extra page at large font scales.
  const reserveDnTotalsBlock =
    data.document.doc_type !== "delivery_note" ||
    (data.document.hide_amounts_on_print === false && !blankForm);

  const hasMultiInvoiceRefs =
    !data.document.vat_registered &&
    (data.receiptInvoices.length > 1 || data.billingNoteInvoices.length > 1);

  // Classic V2 detail mode renders hierarchical DN group headers derived at
  // print time — the qty-0 marker rows and DN section-header lines never
  // render, so pagination must exclude them. Each group header paginates as one atomic unit with its
  // first child (strict keep-with-next: a header can never strand at a page
  // bottom), so pagination runs on { item, hasHeader } units and unwraps back
  // to plain line batches. Classic V1 still renders marker rows; modern
  // renders plain lines.
  const itemsForPagination = isClassicV2
    ? filteredLineItems.filter((item) => !isDnMarkerLine(item))
    : filteredLineItems;

  if (isClassicV2) {
    // Same SO-group precedence as the renderer: an explicitly typed header
    // on a delivery note wraps every line in one group, otherwise DN
    // section markers split it into named groups. The plan input keeps
    // section markers (they become headers); batches unwrap back to real
    // lines only, so markers never paginate as rows. Pagination and
    // render share the predicates, so they can never disagree.
    const soGroupHeader = getDnSoHeaderText(data.document.doc_type, data.document.dn_so_header);
    const rowPlan = soGroupHeader
      ? buildDnSoHeaderPlan(itemsForPagination, soGroupHeader)
      : data.document.doc_type === "delivery_note"
        ? buildDnSectionPlan(itemsForPagination, data.lineDeliveryNoteMap)
        : planDnRows(buildDnBlocks(itemsForPagination, data.lineDeliveryNoteMap));
    const units = rowPlan.map((p) => ({
      item: p.item,
      hasHeader: p.header !== null,
      hasFooterAfter: p.footerAfter !== null,
      hasSpacerAfter: p.spacerAfter,
      soHeader: p.header?.soHeader ?? null,
      // Empty number = SO-only band (DN section/legacy header): its first SO
      // line is already part of the band charge.
      headerHasRefLine: !!p.header?.number,
    }));
    return paginateRows(units, data.template, "line_items", {
      estimateHeight: (unit) =>
        estimateLineItemHeight(unit.item, data.template, {
          fontScale: itemsScale,
          numScale,
          // Classic V2 always renders the amount-column grid (values hide,
          // geometry doesn't), so the description column is always the
          // narrow variant — estimate wrapping against it unconditionally.
          hideDeliveryAmounts: false,
          hasLineDiscount:
            (unit.item.discount_amount ?? 0) > 0 || (unit.item.discount_percent ?? 0) > 0,
          hasInlineDnRef: false,
          // Group header and sum rows share one geometry (single line, same
          // padding), so both charge the same reserve. They never coincide on
          // one unit: single-line groups get no sum row.
          hasDnGroupBand: unit.hasHeader || unit.hasFooterAfter,
          dnGroupSoHeader: unit.soHeader,
          dnGroupHasRefLine: unit.headerHasRefLine,
          // DN line notes are shorter than the item-name metric; scope the
          // calibrated metric to delivery notes.
          dnNotes: data.document.doc_type === "delivery_note",
          compactDn,
          hasLineImage:
            data.document.doc_type === "quotation" && !!unit.item.image_url,
          hasInvoiceRef: hasMultiInvoiceRefs && !!data.invoiceNumberMap[unit.item.document_id],
        }) +
        (unit.hasSpacerAfter ? (compactDn ? DN_GROUP_SPACER_COMPACT_MM : DN_GROUP_SPACER_MM) : 0),
      fontScale: budgetScales,
      extraReserveMm,
      continuationFullHeader,
      spaceBonusMm,
      stripReserveMm,
      reserveTotalsBlock: reserveDnTotalsBlock,
    }).map((batch) => ({
      kind: "line_items" as const,
      batch: { ...batch, items: batch.items.map((u) => u.item) },
    }));
  }

  return paginateRows(itemsForPagination, data.template, "line_items", {
    estimateHeight: (item) =>
      estimateLineItemHeight(item, data.template, {
        fontScale: itemsScale,
        numScale,
        hideDeliveryAmounts: effectiveHideAmounts,
        hasLineDiscount:
          (item.discount_amount ?? 0) > 0 || (item.discount_percent ?? 0) > 0,
        hasInlineDnRef:
          data.template !== "classic_v2" &&
          !!data.showInlineDeliveryNotes &&
          !!data.lineDeliveryNoteMap[item.id],
        hasDnGroupBand: false,
        hasLineImage:
          isClassicV2 && data.document.doc_type === "quotation" && !!item.image_url,
        hasInvoiceRef: hasMultiInvoiceRefs && !!data.invoiceNumberMap[item.document_id],
      }),
    fontScale: budgetScales,
    extraReserveMm,
    continuationFullHeader,
    spaceBonusMm,
  }).map((batch) => ({ kind: "line_items", batch }));
}

export default function DocumentPrintPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PrintDocumentData | null>(null);
  const { hasFeature } = useWorkspaceFeatures(data?.document.user_id);
  const dnAppendixFeatureEnabled = hasFeature("dn_appendix");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const previewSheetRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [previewViewportWidth, setPreviewViewportWidth] = useState<number | null>(null);
  const [previewMarginLeft, setPreviewMarginLeft] = useState<number | null>(null);
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null);
  const savingPdf = savingMode !== null;
  const [dnAppendix, setDnAppendix] = useState(
    data?.document.dn_appendix === true && (data?.invoiceDeliveryNotes.length ?? 0) > 0,
  );
  const blankForm = data?.document.is_blank_form === true;
  const exportMode = searchParams.get("export") === "pdf";
  const exportCopyTypes = searchParams.get("copyTypes") === "copy,original"
    ? ["copy", "original"] as CopyType[]
    : searchParams.get("copyTypes") === "original,copy"
      ? ["original", "copy"] as CopyType[]
      : [searchParams.get("copyType") === "copy" ? "copy" : "original"] as CopyType[];
  // โหมดอ้างอิง (classic V2): the DN reference table (เหมือนใบวางบิล) replaces
  // the items table in BOTH the preview and the exported PDF.
  // PDF render instances get the flag from the URL; the preview uses state.
  // Default is รายการเต็ม — reference mode is opt-in (remembered per browser).
  const refCollapseParam = searchParams.get("refCollapse");
  const [refCollapse, setRefCollapse] = useState(() => {
    if (refCollapseParam !== null) return refCollapseParam === "1";
    return window.localStorage.getItem("invoice-system.ref-collapse") === "1";
  });
  const toggleRefCollapse = (value: boolean) => {
    setRefCollapse(value);
    window.localStorage.setItem("invoice-system.ref-collapse", value ? "1" : "0");
  };
  const hasDnMarkers = !!data?.lineItems?.some(
    (l) => l.quantity === 0 && l.source_document_id && !l.source_line_item_id,
  );
  const isClassicV2 = data?.template === "classic_v2";
  const showRefModeToggle =
    isClassicV2 &&
    (hasDnMarkers ||
      (data?.document.doc_type === "invoice" && (data.invoiceDeliveryNotes.length ?? 0) > 0));
  const [copyType, setCopyType] = useState<CopyType>(exportCopyTypes[0] || "original");
  const [copyOrder, setCopyOrder] = useState<CopyOrder>(() => {
    if (typeof window === "undefined") return "original-first";
    return window.localStorage.getItem("invoice-system.copy-order") === "copy-first"
      ? "copy-first"
      : "original-first";
  });
  // Two-copy download layout: interleave pages (original p1, copy p1, …) or
  // print each copy complete first. Remembered per browser like copyOrder.
  const [interleaveCopies, setInterleaveCopies] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("invoice-system.interleave-copies") !== "0";
  });
  const toggleInterleaveCopies = (value: boolean) => {
    setInterleaveCopies(value);
    window.localStorage.setItem("invoice-system.interleave-copies", value ? "1" : "0");
  };
  const handleCopyOrderChange = (value: CopyOrder) => {
    setCopyOrder(value);
    window.localStorage.setItem("invoice-system.copy-order", value);
  };

  useEffect(() => {
    if (!exportMode) return;

    document.documentElement.classList.add("print-export-document");
    document.body.classList.add("print-export-document");
    document.documentElement.dataset.accentMode = "element";

    return () => {
      document.documentElement.classList.remove("print-export-document");
      document.body.classList.remove("print-export-document");
      delete document.documentElement.dataset.accentMode;
    };
  }, [exportMode]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const result = await getPrintDocumentData(id);
        if (cancelled) return;
        setData(result);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "ไม่สามารถเปิดหน้าแสดงเอกสารได้";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    function updatePreviewScale() {
      const frame = previewFrameRef.current;
      const sheet = previewSheetRef.current;
      if (!frame || !sheet) return;

      if (window.innerWidth >= 768) {
        setPreviewScale(1);
        setPreviewHeight(null);
        setPreviewViewportWidth(null);
        setPreviewMarginLeft(null);
        return;
      }

      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const availableWidth = Math.max(280, viewportWidth - 16);
      const sheetWidth = sheet.scrollWidth;
      const sheetHeight = sheet.scrollHeight;
      if (!sheetWidth || !sheetHeight) return;

      const scale = Math.min(1, availableWidth / sheetWidth);
      const scaledWidth = sheetWidth * scale;
      setPreviewScale(scale);
      setPreviewHeight(sheetHeight * scale);
      setPreviewViewportWidth(availableWidth);
      setPreviewMarginLeft((availableWidth - scaledWidth) / 2);
    }

    requestAnimationFrame(() => updatePreviewScale());

    const observer = new ResizeObserver(() => updatePreviewScale());
    if (previewSheetRef.current) observer.observe(previewSheetRef.current);

    window.addEventListener("resize", updatePreviewScale);
    window.visualViewport?.addEventListener("resize", updatePreviewScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePreviewScale);
      window.visualViewport?.removeEventListener("resize", updatePreviewScale);
    };
  }, [data]);

  async function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);

    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (isMobile && typeof navigator.share === "function") {
        const shareData = { files: [file], title: filename };
        if (typeof navigator.canShare !== "function" || navigator.canShare(shareData)) {
          try {
            await navigator.share(shareData);
            return;
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
              return;
            }
            console.warn("Native PDF share failed; falling back to browser download:", err);
          }
        }
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (isMobile) {
        window.setTimeout(() => {
          if (!document.hidden) {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        }, 400);
      }
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  function pdfBaseName(data: PrintDocumentData) {
    const safeName = (data.clientProfile?.company_name_th || "")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9\u0E00-\u0E7F\-_]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    const docNumber = data.document.doc_number || "doc";
    const datePart = data.document.issue_date
      ? data.document.issue_date.slice(0, 10)
      : localTodayString();
    const parts = [docNumber];
    if (safeName) parts.push(safeName);
    parts.push(datePart);
    return parts.join("_");
  }

  function pdfFilename(data: PrintDocumentData, suffix?: string) {
    const parts = [pdfBaseName(data)];
    if (suffix) parts.push(suffix);
    return `${parts.join("_")}.pdf`;
  }

  async function getServerPdfBlob(copyTypes: Array<"original" | "copy">) {
    if (!id) throw new Error("Missing document id");
    // apiFetchBlob refreshes near-expiry sessions and retries 401s — a raw
    // getSession() fetch sends stale tokens after an idle tab and fails.
    return apiFetchBlob(`/api/documents/${encodeURIComponent(id)}/pdf`, {
      method: "POST",
      body: JSON.stringify({ copyTypes, refCollapse: refCollapse ? 1 : 0, interleave: interleaveCopies ? 1 : 0 }),
    });
  }

  async function handleSavePdf() {
    if (savingPdf || !data) return;
    setSavingMode("single");
    setPdfError("");
    try {
      // Honor the ประเภท toggle: "สำเนา" downloads the copy variant.
      const suffix = copyType === "copy" ? "สำเนา" : undefined;
      await triggerDownload(await getServerPdfBlob([copyType]), pdfFilename(data, suffix));
    } catch (err) {
      console.error("Failed to save PDF:", err);
      setPdfError("บันทึก PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSavingMode(null);
    }
  }

  async function handleSaveBothPdf() {
    if (savingPdf || !data) return;
    setSavingMode("combined");
    setPdfError("");
    try {
      const copyTypes: Array<"original" | "copy"> = copyOrder === "copy-first"
        ? ["copy", "original"]
        : ["original", "copy"];
      await triggerDownload(await getServerPdfBlob(copyTypes), pdfFilename(data, "2ฉบับ"));
    } catch (err) {
      console.error("Failed to save PDF:", err);
      setPdfError("บันทึก PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSavingMode(null);
    }
  }

  // Two separate PDF files (ต้นฉบับ + สำเนา) packaged as one ZIP. Each copy is
  // its own cached server variant, so repeats are cache hits.
  async function handleSaveBothSeparatePdf() {
    if (savingPdf || !data) return;
    setSavingMode("separate");
    setPdfError("");
    try {
      const [originalBlob, copyBlob] = await Promise.all([
        getServerPdfBlob(["original"]),
        getServerPdfBlob(["copy"]),
      ]);
      const base = pdfBaseName(data);
      const entries = copyOrder === "copy-first"
        ? [
            { path: `${base}_สำเนา.pdf`, blob: copyBlob },
            { path: `${base}_ต้นฉบับ.pdf`, blob: originalBlob },
          ]
        : [
            { path: `${base}_ต้นฉบับ.pdf`, blob: originalBlob },
            { path: `${base}_สำเนา.pdf`, blob: copyBlob },
          ];
      const zip = await buildZipBlob(
        entries.map((entry) => ({ path: safeZipSegment(entry.path), blob: entry.blob })),
      );
      await triggerDownload(zip, `${base}_ต้นฉบับ+สำเนา.zip`);
    } catch (err) {
      console.error("Failed to save PDFs:", err);
      setPdfError("บันทึก PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSavingMode(null);
    }
  }

  // Tax-invoice printed-title preset (print only — doc_type stays "invoice").
  // Saved on the document so preview, export PDF, and reprints agree.
  const [savingPrintTitle, setSavingPrintTitle] = useState(false);
  async function handlePrintTitleChange(value: string) {
    if (!data || savingPrintTitle) return;
    const prev = data.document.print_title_variant || "";
    if (value === prev) return;
    setSavingPrintTitle(true);
    setPdfError("");
    try {
      const { error } = await supabase
        .from("documents")
        .update({ print_title_variant: value || null })
        .eq("id", data.document.id);
      if (error) throw error;
      setData({ ...data, document: { ...data.document, print_title_variant: value || null } });
      // Remember for the next new tax invoice.
      writeLastPrintTitleVariant(value);
    } catch (err) {
      console.error("Failed to save document print title:", err);
      setPdfError("บันทึกชื่อเรื่องเอกสารไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSavingPrintTitle(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-[#E4E7EC] bg-white p-8 shadow-sm">
          <h1 className="text-[24px] font-semibold text-[#101828]">ไม่สามารถแสดงเอกสารได้</h1>
          <p className="mt-3 text-[14px] text-[#475467]">{error || "ไม่สามารถเตรียมเอกสารสำหรับการพิมพ์ได้"}</p>
          <div className="mt-6">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              กลับ
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (exportMode) {
    const batches = getPrintBatches(data, blankForm, undefined, refCollapse);
    const { appendix } = applyAppendixToData({ ...data, document: { ...data.document, dn_appendix: dnAppendix } });
    // Two-copy page order (?interleave=0 restores the legacy layout where
    // each copy prints complete first). Default interleaves page-by-page
    // (original p1, copy p1, …) so page pairs stay together;
    // exportCopyTypes order still decides which copy leads each pair, and
    // page numbers stay per-copy (หน้า i/N of that copy), not per-PDF.
    const exportInterleave = searchParams.get("interleave") !== "0";
    const pagePlan = exportInterleave
      ? batches.flatMap((_, i) => exportCopyTypes.map((type) => ({ type, index: i })))
      : exportCopyTypes.flatMap((type) => batches.map((_, i) => ({ type, index: i })));
    return (
      <div className="print-export-stack">
        <PrintErrorBoundary onError={() => {}}>
          {pagePlan.map(({ type, index: i }) => {
            const { kind, batch } = batches[i];
            return (
              <div className="print-export-page" key={`${type}-p${i}`}>
                {data.template === "classic_v2" ? (
                  <PrintDocumentClassicV2
                    data={data}
                    copyType={type}
                    pageMode={batch.mode}
                    pageIndex={i + 1}
                    totalPages={batches.length}
                    batchLineItems={kind === "line_items" ? batch.items : undefined}
                    batchBillingNoteInvoices={kind === "billing_invoices" ? batch.items : undefined}
                    batchReceiptInvoices={kind === "receipt_invoices" ? batch.items : undefined}
                    batchDeliveryNotes={kind === "dn_summary" ? batch.items : undefined}
                    batchDeliveryNoteStartIndex={kind === "dn_summary" ? batch.startIndex : undefined}
                    batchStartIndex={kind === "line_items" ? batch.startIndex : undefined}
                    summaryStartIndex={batch.startIndex}
                    blankForm={blankForm}
                  />
                ) : (
                  <PrintDocument
                    data={data}
                    copyType={type}
                    pageMode={batch.mode}
                    pageIndex={i + 1}
                    totalPages={batches.length}
                    batchLineItems={kind === "line_items" ? batch.items : undefined}
                    batchBillingNoteInvoices={kind === "billing_invoices" ? batch.items : undefined}
                    batchReceiptInvoices={kind === "receipt_invoices" ? batch.items : undefined}
                    summaryStartIndex={batch.startIndex}
                    blankForm={blankForm}
                  />
                )}
              </div>
            );
          })}
          {appendix.enabled && (
            <div className="print-export-page">
              <PrintAppendix data={appendix} template={data.template} />
            </div>
          )}
        </PrintErrorBoundary>
      </div>
    );
  }

  const showPrintTitle = data.document.doc_type === "invoice" && data.document.vat_registered;
  const showDnAppendixOption = dnAppendixFeatureEnabled && data.invoiceDeliveryNotes.length > 0;
  const hasDocumentOptions = showPrintTitle || showRefModeToggle || showDnAppendixOption;
  const headerDescription = blankForm
    ? `${data.document.doc_number || "เอกสาร"} · ฟอร์มเปล่า — ให้พนักงานกรอกจำนวนและราคาด้วยมือ`
    : data.document.doc_number || "เอกสาร";

return (
    <div className="print-preview-shell min-h-screen bg-cool-75 px-2 py-3 sm:px-4 sm:py-6">
      <div
        className="print-toolbar mx-auto mb-3 w-full max-w-[230mm] sm:mb-4"
        style={previewViewportWidth ? { maxWidth: `${previewViewportWidth}px` } : undefined}
      >
        <SectionCard
          title="ดาวน์โหลดเอกสาร"
          description={headerDescription}
          titleRight={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusBadge docType={data.document.doc_type} vatRegistered={data.document.vat_registered === true} />
              <StatusBadge status={data.document.status} />
              {blankForm ? <StatusBadge tone="amber" label="ฟอร์มเปล่า" /> : null}
            </div>
          }
        >
          {hasDocumentOptions ? (
            <div className="flex flex-col gap-2 border-b border-line pb-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="shrink-0 text-label font-medium text-ink-400 sm:w-[180px]">เนื้อหาเอกสาร</span>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {showPrintTitle ? (
                  <InlineControl label="ชื่อเรื่องบนหัวเอกสาร">
                    <div className="w-[220px]">
                      <Select
                        value={data.document.print_title_variant || ""}
                        onChange={(event) => void handlePrintTitleChange(event.target.value)}
                        disabled={savingPrintTitle}
                      >
                        <option value="">ใบกำกับภาษี (ค่าเริ่มต้น)</option>
                        {Object.entries(PRINT_TITLE_PRESETS).map(([value, preset]) => (
                          <option key={value} value={value}>{preset.thai}</option>
                        ))}
                      </Select>
                    </div>
                  </InlineControl>
                ) : null}
                {showRefModeToggle ? (
                  <InlineControl label="รูปแบบรายการ">
                    <Segmented
                      value={refCollapse ? "ref" : "full"}
                      onChange={(value) => toggleRefCollapse(value === "ref")}
                      options={[
                        { value: "ref", label: "แบบอ้างอิง", title: "แบบอ้างอิง (ตารางใบส่งของ)" },
                        { value: "full", label: "รายการเต็ม", title: "แสดงรายการสินค้าเต็ม" },
                      ]}
                    />
                  </InlineControl>
                ) : null}
                {showDnAppendixOption ? (
                  <InlineControl label="แนบภาคผนวกการส่งของ">
                    <Switch checked={dnAppendix} onChange={setDnAppendix} />
                  </InlineControl>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={`flex flex-col gap-3 ${hasDocumentOptions ? "pt-3" : ""}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <Button
                onClick={handleSavePdf}
                loading={savingMode === "single"}
                size="sm"
                className="w-full sm:order-2 sm:w-[160px] sm:shrink-0"
              >
                บันทึกเป็น PDF
              </Button>
              <InlineControl label="ประเภท" className="sm:order-1">
                <Segmented
                  value={copyType}
                  onChange={setCopyType}
                  options={[
                    { value: "original", label: "ต้นฉบับ" },
                    { value: "copy", label: "สำเนา" },
                  ]}
                />
              </InlineControl>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <Button
                onClick={handleSaveBothPdf}
                loading={savingMode === "combined"}
                variant="secondary"
                size="sm"
                className="w-full sm:order-2 sm:w-[160px] sm:shrink-0"
              >
                2 ฉบับ รวมไฟล์เดียว
              </Button>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:order-1">
                <InlineControl label="ลำดับ">
                  <Segmented
                    value={copyOrder}
                    onChange={handleCopyOrderChange}
                    options={[
                      { value: "original-first", label: "ต้นฉบับ → สำเนา" },
                      { value: "copy-first", label: "สำเนา → ต้นฉบับ" },
                    ]}
                  />
                </InlineControl>
                <InlineControl label="การเรียงหน้า">
                  <Segmented
                    value={interleaveCopies ? "interleave" : "grouped"}
                    onChange={(value) => toggleInterleaveCopies(value === "interleave")}
                    options={[
                      { value: "interleave", label: "สลับทีละหน้า", title: "ต้นฉบับและสำเนาสลับกันทีละหน้า" },
                      { value: "grouped", label: "แยกชุดละฉบับ", title: "พิมพ์ให้จบทีละชุดตามลำดับที่เลือก" },
                    ]}
                  />
                </InlineControl>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <Button
                onClick={handleSaveBothSeparatePdf}
                loading={savingMode === "separate"}
                variant="secondary"
                size="sm"
                className="w-full sm:order-2 sm:w-[160px] sm:shrink-0"
              >
                2 ฉบับ แยกไฟล์
              </Button>
              <span className="text-label text-ink-300 sm:order-1">ZIP · 2 ไฟล์</span>
            </div>

            {pdfError ? <div className="text-label text-danger-text">{pdfError}</div> : null}
          </div>
        </SectionCard>
      </div>

      <div
        className="mx-auto w-full max-w-[230mm]"
        style={previewViewportWidth ? { maxWidth: `${previewViewportWidth}px` } : undefined}
      >
        <div
          ref={previewFrameRef}
          className="print-preview-frame"
          style={previewHeight ? { height: `${previewHeight}px` } : undefined}
        >
          <div
            ref={previewSheetRef}
            className="print-preview-scale"
            style={{
              transform: `scale(${previewScale})`,
              ...(previewMarginLeft != null ? { marginLeft: `${previewMarginLeft}px` } : {}),
            }}
          >
            <PrintErrorBoundary onError={() => {}}>
              {(() => {
                  const batches = getPrintBatches(data, blankForm, undefined, refCollapse);
                  return batches.map(({ kind, batch }, i) => {
                    const props = {
                      data,
                      copyType,
                      pageMode: batch.mode,
                      pageIndex: i + 1,
                      totalPages: batches.length,
                      batchLineItems: kind === "line_items" ? batch.items : undefined,
                      batchBillingNoteInvoices: kind === "billing_invoices" ? batch.items : undefined,
                      batchReceiptInvoices: kind === "receipt_invoices" ? batch.items : undefined,
                      batchStartIndex: kind === "line_items" ? batch.startIndex : undefined,
                      summaryStartIndex: batch.startIndex,
                      blankForm,
                    };
                    return data.template === "classic_v2" ? (
                      <PrintDocumentClassicV2
                        key={`p${i}`}
                        {...props}
                        batchDeliveryNotes={kind === "dn_summary" ? batch.items : undefined}
                        batchDeliveryNoteStartIndex={kind === "dn_summary" ? batch.startIndex : undefined}
                      />
                    ) : (
                      <PrintDocument key={`p${i}`} {...props} />
                    );
                  });
                })()
              }
            </PrintErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
