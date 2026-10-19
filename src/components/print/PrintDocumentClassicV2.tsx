import { Fragment } from "react";
import { formatCurrency, paymentMethodText, buildReceiptPaymentRows } from "../../lib/format";
import { formatPrintDate } from "../../lib/dates";
import { resolveYearEra } from "../../lib/yearEra";
import { getProxiedImageUrl } from "../../lib/storageApi";
import {
  buildDnBlocks,
  buildDnSectionPlan,
  buildDnSoHeaderPlan,
  dnHeaderLabel,
  filterDnRefMarkers,
  filterDnRenderLines,
  getDnSoHeaderText,
  getPrintableLineNote,
  planDnRows,
  splitDnSectionHeaders,
} from "../../lib/dnGroups";
import { getRowBudgets } from "../../lib/pagination";
import {
  estimateClassicV2FullRowHeight,
  estimateLineItemHeight,
} from "../../lib/printRowHeight";
import { getDnVarianceParts } from "../../lib/dnVariance";
import { printTitle } from "../../lib/docLabels";
import { splitTerms, resolveTermsByType } from "../../lib/terms";
import { PAYMENT_METHOD_LABELS, ASSET_SCALE_MULT, CLASSIC_V2_TYPE_GLOBAL_KEY, DOCUMENT_FONT_SCALE_DEFAULT, CLASSIC_V2_CHEQUE_STRIP_RESERVE_MM, CLASSIC_V2_META_ROW_RESERVE_MM, CLASSIC_V2_HIDE_EN_META_ROW_MM, CLASSIC_V2_HIDE_EN_THEAD_MM, CLASSIC_V2_HIDE_EN_SIG_MM, CLASSIC_V2_COMPACT_SIG_MM, getClassicV2FontScaleMult, getClassicV2EffectiveFontScaleMult, getClassicV2EffectiveSectionScaleMult } from "../../constants";
import type { PrintDocumentData } from "../../lib/print";
import type {
  BillingNoteInvoice,
  Customer,
  DocumentLineItem,
  InvoiceDeliveryNote,
  ReceiptInvoice,
} from "../../types";
import type { PageMode } from "../../lib/pagination";
import { PrintContinuationHeader } from "./PrintContinuationHeader";
import { DocLogo } from "./DocLogo";
import { RefItemName } from "./RefItemName";

/** Segmented hand-fill date: [DD] / [MM] / [YYYY] (classic V2 signature boxes). */
function SigDateFill() {
  return (
    <div className="print-classic-sig-date-fill">
      <span className="seg seg-dd" />
      <span className="slash">/</span>
      <span className="seg seg-mm" />
      <span className="slash">/</span>
      <span className="seg seg-yy" />
    </div>
  );
}

/** Per-document-type wording for the signature boxes (Box 1 + Box 2; Box 3
 * is the company signer — except invoices, which use four boxes:
 * received / delivered / issued / authorized). */
const SIG_LABELS: Record<string, { box1Title: string; box1TitleEn: string; box1RoleTh: string; box1RoleEn: string; box2RoleTh: string; box2RoleEn: string }> = {
  invoice: {
    box1Title: "ได้รับสินค้า/บริการถูกต้องแล้ว",
    box1TitleEn: "GOODS & SERVICES RECEIVED",
    box1RoleTh: "ผู้รับสินค้า/บริการ",
    box1RoleEn: "RECEIVED BY",
    box2RoleTh: "ผู้ส่งของ",
    box2RoleEn: "DELIVERED BY",
  },
  receipt: {
    box1Title: "ได้รับชำระเงินถูกต้องแล้ว",
    box1TitleEn: "PAYMENT RECEIVED",
    box1RoleTh: "ผู้รับเงิน",
    box1RoleEn: "RECEIVER",
    box2RoleTh: "ผู้จ่ายเงิน",
    box2RoleEn: "PAYER",
  },
  billing_note: {
    box1Title: "ได้รับใบวางบิลถูกต้อง",
    box1TitleEn: "BILLING ACKNOWLEDGED",
    box1RoleTh: "ผู้รับใบวางบิล",
    box1RoleEn: "ACKNOWLEDGED BY",
    box2RoleTh: "ผู้จ่ายเงิน",
    box2RoleEn: "PAYER",
  },
  quotation: {
    box1Title: "ยืนยันคำสั่งซื้อ",
    box1TitleEn: "ORDER CONFIRMED",
    box1RoleTh: "ผู้ยืนยันคำสั่งซื้อ",
    box1RoleEn: "CONFIRMED BY",
    box2RoleTh: "ผู้เสนอราคา",
    box2RoleEn: "QUOTED BY",
  },
  delivery_note: {
    box1Title: "ได้รับสินค้า/บริการถูกต้องแล้ว",
    box1TitleEn: "GOODS/SERVICES RECEIVED",
    box1RoleTh: "ผู้รับของ",
    box1RoleEn: "RECEIVED BY",
    box2RoleTh: "ผู้ส่งของ",
    box2RoleEn: "DELIVERED BY",
  },
  credit_note: {
    box1Title: "ได้รับใบลดหนี้ถูกต้อง",
    box1TitleEn: "CREDIT NOTE ACKNOWLEDGED",
    box1RoleTh: "ผู้รับใบลดหนี้",
    box1RoleEn: "ACKNOWLEDGED BY",
    box2RoleTh: "ผู้อนุมัติใบลดหนี้",
    box2RoleEn: "APPROVED BY",
  },
  debit_note: {
    box1Title: "ได้รับใบเพิ่มหนี้ถูกต้อง",
    box1TitleEn: "DEBIT NOTE ACKNOWLEDGED",
    box1RoleTh: "ผู้รับใบเพิ่มหนี้",
    box1RoleEn: "ACKNOWLEDGED BY",
    box2RoleTh: "ผู้อนุมัติใบเพิ่มหนี้",
    box2RoleEn: "APPROVED BY",
  },
};

const SIG_LABELS_DEFAULT = SIG_LABELS.invoice;

export type CopyType = "original" | "copy";

const COPY_LABELS: Record<CopyType, string> = {
  original: "ต้นฉบับลูกค้า",
  copy: "สำเนา",
};

// ป.80/2542 ข้อ 3(5): the corrected value on a credit note is the original
// invoice value minus the adjustment; on a debit note it is plus.
function adjustmentCorrectAmount(original: number, adjustment: number, isCreditNote: boolean): number {
  const corrected = isCreditNote ? original - adjustment : original + adjustment;
  return Math.max(0, Math.round(corrected * 100) / 100);
}

const SHOW_BANK_TYPES = new Set([
  "invoice",
  "billing_note",
  "receipt",
]);
const SHOW_PAYMENT_METHOD_TYPES = new Set([
  "invoice",
  "receipt",
]);
const MIN_CLASSIC_ITEM_ROWS = 8;
const MIN_CLASSIC_BILLING_NOTE_ROWS = 8;
const MIN_CLASSIC_RECEIPT_ROWS = 8;

/**
 * A synthetic one-line row, used to charge filler rows their rendered height.
 * It goes through the same estimator as a real line, so a filler can never be
 * charged less than a content row — the estimator carries both the text line
 * (which scales) and the per-row safety margin. An *empty* name would skip the
 * text line entirely (the estimator only charges lines beyond the first), so
 * the name is a single character.
 */
const FILLER_ROW_LINE = {
  item_name: "x",
  line_note: null,
  item_type: "service",
  unit: "",
  quantity: 0,
  unit_price: 0,
  discount_percent: 0,
  discount_amount: 0,
  line_total: 0,
} as unknown as DocumentLineItem;

interface PrintDocumentClassicProps {
  data: PrintDocumentData;
  copyType?: CopyType;
}

interface PrintDocumentClassicProps {
  data: PrintDocumentData;
  copyType?: CopyType;
  pageMode?: PageMode;
  pageIndex?: number;
  totalPages?: number;
  batchLineItems?: DocumentLineItem[];
  batchBillingNoteInvoices?: BillingNoteInvoice[];
  batchReceiptInvoices?: ReceiptInvoice[];
  batchDeliveryNotes?: InvoiceDeliveryNote[];
  batchDeliveryNoteStartIndex?: number;
  batchStartIndex?: number;
  summaryStartIndex?: number;
  blankForm?: boolean;
  refCollapse?: boolean;
}

export function PrintDocumentClassicV2({
  data,
  copyType = "original",
  pageMode = "single",
  pageIndex = 1,
  totalPages = 1,
  batchLineItems,
  batchBillingNoteInvoices,
  batchReceiptInvoices,
  batchDeliveryNotes,
  batchDeliveryNoteStartIndex,
  batchStartIndex,
  summaryStartIndex = 1,
  blankForm = false,
  refCollapse = false,
}: PrintDocumentClassicProps) {
  const {
    document,
    clientProfile,
    customer,
    referenceDoc,
    billingNoteInvoices,
    receiptInvoices,
    invoiceDeliveryNotes,
    lineDeliveryNoteMap,
    invoiceNumberMap,
    receiptOutstanding,
    receiptPaymentNumber,
    receiptCumulativePaid,
    bankAccount,
  } = data;
  const lineItems = batchLineItems ?? data.lineItems;
  const era = resolveYearEra(clientProfile);
  // Classic V2 detail mode: qty-0 DN marker rows and DN section-header
  // lines never render. Numbering is hierarchical (BOQ-style: groups 1..n,
  // children 1.1..) derived from the FULL line list, so numbers stay
  // continuous across page batches.
  const tableLines = filterDnRenderLines(lineItems);
  // Opt-in SO group modes (delivery notes, classic V2): an explicitly typed
  // single header wraps every line in one "1." group and takes precedence;
  // otherwise section-marker lines split the DN into multiple named groups.
  // Empty/neither = existing path. Markers are DN-only — other doc types
  // always take the legacy plan.
  const soGroupHeader = getDnSoHeaderText(document.doc_type, document.dn_so_header);
  // Plan input keeps section markers (they become headers); the rendered
  // tableLines above drop them (they never render as rows).
  const fullRenderLines = filterDnRefMarkers(data.lineItems);
  const dnRowPlanById = new Map(
    (soGroupHeader
      ? buildDnSoHeaderPlan(fullRenderLines, soGroupHeader)
      : document.doc_type === "delivery_note"
        ? buildDnSectionPlan(fullRenderLines, lineDeliveryNoteMap)
        : planDnRows(buildDnBlocks(fullRenderLines, lineDeliveryNoteMap))
    ).map((p) => [p.item.id, p]),
  );
  const billingRows = batchBillingNoteInvoices ?? billingNoteInvoices;
  const receiptRows = batchReceiptInvoices ?? receiptInvoices;
  // Collapsed reference batches contain NEW row objects — the caller passes
  // the batch's real start index because indexOf can't find them.
  const startIndex =
    batchStartIndex ??
    (batchLineItems ? data.lineItems.indexOf(batchLineItems[0]) + 1 : summaryStartIndex);
  const isCopy = copyType === "copy";
  const isDeliveryNote = document.doc_type === "delivery_note";
  // Quotation: no WHT deduction row, no NET PAYABLE (grand total is final).
  const isQuotation = document.doc_type === "quotation";
  // Opt-in compact DN spacing (no font change) — mirrors the classic_v2_compact_dn
  // profile setting; only affects the CSS class and the pagination estimate.
  const compactDn = isDeliveryNote && clientProfile.classic_v2_compact_dn === true;
  const hideDeliveryAmounts =
    isDeliveryNote && document.hide_amounts_on_print !== false;
  // Amount columns always render their grid (headers, cells, vertical
  // rules) so the table geometry is identical whether amounts print or
  // not — only the VALUES hide. Previously the columns collapsed entirely
  // and the description column stretched to fill the gap.
  const showAmountValues = blankForm || !hideDeliveryAmounts;
  const showFullTotals = isDeliveryNote && document.show_full_totals === true;
  const isBillingNote = document.doc_type === "billing_note";
  const isReceiptOrBillingNoteTable =
    (isBillingNote || (document.doc_type === "receipt" && receiptRows.length > 0)) && document.vat_registered;
  // Reference mode renders the DN summary table (same 136-unit geometry as
  // the billing-note/receipt tables), so the bottom-row divider must use the
  // 88/48 VAT-edge grid instead of the detail table's 122/60 grid.
  const showDnReferenceTable =
    refCollapse && document.doc_type === "invoice" && invoiceDeliveryNotes.length > 0;
  // Paginated ref-mode batches arrive as row slices; single-page renders
  // (fixture, legacy callers) fall back to the full link list.
  const dnTableRows = batchDeliveryNotes ?? (showDnReferenceTable ? invoiceDeliveryNotes : undefined);
  const dnTableStart = batchDeliveryNoteStartIndex ?? 1;
  const useSummaryGrid = isReceiptOrBillingNoteTable || !!dnTableRows;
  const isReceipt = document.doc_type === "receipt";
  const isCreditNote = document.doc_type === "credit_note";
  const isDebitNote = document.doc_type === "debit_note";
  const receiptCash = document.amount_received ?? document.net_payable;
  const receiptTaxable = isReceipt && document.vat_registered && document.vat_rate > 0 && document.subtotal > 0;
  const receiptPreTax = isReceipt ? document.subtotal : 0;
  const receiptVatAmount = isReceipt ? document.vat_amount : 0;
  const receiptAmount = isReceipt ? document.total_amount : receiptCash;
  const receiptWhtTotal = isReceipt ? document.wht_amount || 0 : 0;
  const receiptReferenceAmount = referenceDoc?.total_amount ?? document.total_amount;
  const receiptPaidInFull = isReceipt && receiptOutstanding !== undefined && receiptOutstanding <= 0.01;
  const showFooter = pageMode === "single" || pageMode === "last";
  const fullHeaderPerPage = clientProfile.classic_v2_full_page_header === true;
  // Per-page signature initials (เซ็นกำกับทุกหน้า, opt-in): a compact strip
  // pinned to the bottom of every NON-final page. Mirrors the
  // stripReserveMm budget in getPrintBatches — render condition and budget
  // must agree or preview/PDF diverge. Single/last pages show the full
  // signature band instead (never both).
  const showInitialsStrip =
    (pageMode === "first" || pageMode === "continuation") &&
    clientProfile.classic_v2_sign_every_page === true;
  const isContinuationPage = pageMode === "continuation" || pageMode === "last";
  const showHeader =
    pageMode === "single" || pageMode === "first" || (fullHeaderPerPage && isContinuationPage);
  const showContinuationHeader = isContinuationPage && !fullHeaderPerPage;
  const documentClass = isDeliveryNote ? " print-delivery-note" : "";
  const showBank = SHOW_BANK_TYPES.has(document.doc_type) &&
    (document.doc_type !== "receipt" || !!bankAccount);
  const showPaymentMethod = SHOW_PAYMENT_METHOD_TYPES.has(document.doc_type);
  const bankName = bankAccount?.bank_name ?? clientProfile.bank_name;
  const bankAccountNumber = bankAccount?.account_number ?? clientProfile.bank_account;
  const bankAccountHolder = bankAccount?.account_holder_name;
  const signatureUrl = clientProfile.signature_url;
  const stampUrl = clientProfile.stamp_url;
  const signatureScaleMult = ASSET_SCALE_MULT[clientProfile.signature_scale ?? "medium"] ?? 1;
  const stampScaleMult = ASSET_SCALE_MULT[clientProfile.stamp_scale ?? "medium"] ?? 1;
  const typeFontScales = (clientProfile.pdf_type_font_scales ?? clientProfile.classic_v2_type_font_scales)?.[document.doc_type];
  // An explicit per-document override applies to the whole document (all
  // sections) — it beats type and workspace scales.
  const docOverrideMult =
    document.print_font_scale && document.print_font_scale !== DOCUMENT_FONT_SCALE_DEFAULT
      ? getClassicV2FontScaleMult(document.print_font_scale)
      : null;
  const fontScaleMult = docOverrideMult ?? getClassicV2EffectiveFontScaleMult(
    document.print_font_scale,
    typeFontScales?.[CLASSIC_V2_TYPE_GLOBAL_KEY],
    clientProfile.pdf_font_scale ?? clientProfile.classic_v2_font_scale,
  );
  const sectionScales = clientProfile.pdf_section_font_scales ?? clientProfile.classic_v2_section_font_scales;
  const headerScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("header", typeFontScales, sectionScales, fontScaleMult);
  const companyScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("header_company", typeFontScales, sectionScales, fontScaleMult);
  const titleScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("header_title", typeFontScales, sectionScales, fontScaleMult);
  const infoScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("header_info", typeFontScales, sectionScales, fontScaleMult);
  const itemsScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("items", typeFontScales, sectionScales, fontScaleMult);
  const numScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("num", typeFontScales, sectionScales, fontScaleMult);
  const numUnitScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("num_unit", typeFontScales, sectionScales, fontScaleMult);
  const theadScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("thead", typeFontScales, sectionScales, fontScaleMult);
  const totalsScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("totals", typeFontScales, sectionScales, fontScaleMult);
  const netScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("totals_net", typeFontScales, sectionScales, fontScaleMult);
  const paymentScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("payment", typeFontScales, sectionScales, fontScaleMult);
  const termsScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("terms", typeFontScales, sectionScales, fontScaleMult);
  const footerScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("footer", typeFontScales, sectionScales, fontScaleMult);
  // ป้ายภาษาอังกฤษ: one shared slot for every English sub-label; falls back to
  // the document global scale when unset.
  const enScaleMult = docOverrideMult ?? getClassicV2EffectiveSectionScaleMult("en", typeFontScales, sectionScales, fontScaleMult);
  const label = printTitle(document);
  const copyLabel = COPY_LABELS[copyType];
  const classicTerms = resolveTermsByType(clientProfile.classic_terms_by_type, clientProfile.classic_terms, document.doc_type);
  const isLastOrSingle = pageMode === "last" || pageMode === "single";
  // The project name is a job heading above the work, so it renders as the
  // items table's first row on the page that carries the first item — not on a
  // continuation page, and never on a blank form.
  const isFirstOrSingle = pageMode === "single" || pageMode === "first";
  const showProjectRow = !blankForm && !!document.task_name;
  const noteText = document.note?.trim();
  // Reserved heights (mm) for the two full-width table rows — the same helper
  // and the same scales the paginator uses in getPrintBatches(), so the filler
  // count below and the page breaks cannot disagree.
  const noteRowMm = estimateClassicV2FullRowHeight(noteText, { labelChars: 15, fontScale: totalsScaleMult });
  const projectRowMm = estimateClassicV2FullRowHeight(document.task_name, { fontScale: itemsScaleMult });
  // Group header rows, sum rows and inter-group spacers occupy physical rows
  // on the sheet — count them so the blank-row padding keeps the fixed height.
  const groupHeaderCount = tableLines.reduce(
    (count, line) => count + (dnRowPlanById.get(line.id)?.header ? 1 : 0),
    0,
  );
  // Elastic filler rows: blank rows are decoration, never content. The table is
  // padded to MIN_CLASSIC_ITEM_ROWS, and then — when the page budget has room
  // for at least two more — filled out to whatever the budget actually allows,
  // so a short document doesn't leave a dead band above the bottom row. They
  // still shrink back (down to 0) for tall last pages, so they can never push a
  // note or row off the sheet. Fillers never reach the paginator (it plans
  // rows, not decoration), so page breaks are unaffected. Mirrors
  // getPrintBatches() budgets so preview and PDF agree; falls back to the
  // minimum table height on any error.
  const minBlankLines = isLastOrSingle
    ? Math.max(0, MIN_CLASSIC_ITEM_ROWS - (tableLines.length + groupHeaderCount))
    : 0;
  const blankLineCount = (() => {
    if (!isLastOrSingle) return 0;
    try {
      const hideEn = clientProfile.classic_v2_hide_english_labels === true;
      const compactSig = clientProfile.classic_v2_compact_signature === true;
      const metaRowReserveMm = hideEn
        ? CLASSIC_V2_META_ROW_RESERVE_MM - CLASSIC_V2_HIDE_EN_META_ROW_MM
        : CLASSIC_V2_META_ROW_RESERVE_MM;
      const extraReserveMm =
        (document.doc_type === "billing_note" && document.status !== "paid"
          ? CLASSIC_V2_CHEQUE_STRIP_RESERVE_MM
          : 0) +
        (document.customer_po_number ? metaRowReserveMm : 0) * headerScaleMult;
      const metaRowCount =
        2 +
        (document.due_date ? 1 : 0) +
        (document.customer_po_number ? 1 : 0);
      const hideEnBandMm = hideEn ? metaRowCount * CLASSIC_V2_HIDE_EN_META_ROW_MM : 0;
      const hideEnTheadMm = hideEn ? CLASSIC_V2_HIDE_EN_THEAD_MM : 0;
      const spaceBonusMm = hideEn || compactSig
        ? {
            first: hideEnBandMm + hideEnTheadMm + (hideEn ? CLASSIC_V2_HIDE_EN_SIG_MM : 0) + (compactSig ? CLASSIC_V2_COMPACT_SIG_MM : 0),
            firstMulti: hideEnBandMm + hideEnTheadMm,
            continuation: hideEnTheadMm,
            last: hideEnBandMm + hideEnTheadMm + (hideEn ? CLASSIC_V2_HIDE_EN_SIG_MM : 0) + (compactSig ? CLASSIC_V2_COMPACT_SIG_MM : 0),
          }
        : undefined;
      const budgetScales = docOverrideMult ?? {
        header: headerScaleMult,
        header_company: companyScaleMult,
        header_title: titleScaleMult,
        header_info: infoScaleMult,
        items: itemsScaleMult,
        num: numScaleMult,
        thead: theadScaleMult,
        totals: totalsScaleMult,
        totals_net: netScaleMult,
        payment: paymentScaleMult,
        terms: termsScaleMult,
        footer: footerScaleMult,
      };
      const budgets = getRowBudgets("classic_v2", budgetScales, "line_items", extraReserveMm + noteRowMm, {
        continuationFullHeader: fullHeaderPerPage,
        spaceBonusMm,
        firstPageReserveMm: projectRowMm,
        // Mirror the paginator: a hidden-amount delivery note draws no totals
        // column, so the scaled totals block must not be charged against the
        // space we are about to fill.
        reserveTotalsBlock:
          document.doc_type !== "delivery_note" ||
          (document.hide_amounts_on_print === false && !blankForm),
      });
      const budget = pageMode === "last" ? budgets.last : budgets.first;
      const hasMultiInvoiceRefs =
        !document.vat_registered &&
        ((receiptInvoices?.length ?? 0) > 1 || (billingNoteInvoices?.length ?? 0) > 1);
      let usedMm = 0;
      for (const line of tableLines) {
        const entry = dnRowPlanById.get(line.id);
        usedMm +=
          estimateLineItemHeight(line, "classic_v2", {
            fontScale: itemsScaleMult,
            numScale: numScaleMult,
            // The description column is always the narrow (87mm) variant in
            // V2 — amount columns keep their grid even when values hide — so
            // wrapping must always estimate against the narrow width.
            hideDeliveryAmounts: false,
            hasLineDiscount:
              (line.discount_amount ?? 0) > 0 || (line.discount_percent ?? 0) > 0,
            hasInlineDnRef: false,
            hasDnGroupBand: !!entry && entry.header !== null,
            dnGroupSoHeader: entry?.header?.soHeader ?? null,
            dnGroupHasRefLine: !!entry?.header?.number,
            dnNotes: isDeliveryNote,
            compactDn,
            hasLineImage: document.doc_type === "quotation" && !!line.image_url,
            hasInvoiceRef: hasMultiInvoiceRefs && !!invoiceNumberMap[line.document_id],
          });
      }
      const blankRowMm = Math.max(
        1,
        // Charge a filler row what it really renders: the same single-line row
        // metric the paginator uses for content (text line + safety margin).
        // The bare base row under-counts by ~0.8mm per row, which is enough to
        // push a filled page past A4.
        estimateLineItemHeight(FILLER_ROW_LINE, "classic_v2", {
          fontScale: itemsScaleMult,
          numScale: numScaleMult,
        }),
      );
      // The project heading and the document note are reserved through the
      // budgets above (firstPageReserveMm / extraReserveMm), exactly like
      // getPrintBatches() does, so the filler count needs no hand-made charge
      // for them — the budget already excludes both.
      //
      // Leave one row spare: the row estimator is calibrated conservatively but
      // is not exact (a quotation's photo rows run ~1mm tall apiece), and a
      // single over-counted filler pushes the sheet past A4 — which clips in
      // print. The spare row costs nothing visible (it is the gap that would
      // otherwise sit above the bottom row).
      const fit = Math.floor((budget - usedMm) / blankRowMm + 1e-6) - 1;
      const fill = Math.max(0, fit);
      // Fill the page when it buys at least two ruled rows; otherwise keep the
      // minimum table height — but never more than the budget actually allows,
      // so a tight budget (large font scales) still shrinks the fillers instead
      // of pushing the sheet past A4.
      return fill >= minBlankLines + 2
        ? fill
        : Math.max(0, Math.min(minBlankLines, fill));
    } catch {
      return minBlankLines;
    }
  })();
  const billingBlankCount = isLastOrSingle
    ? Math.max(0, MIN_CLASSIC_BILLING_NOTE_ROWS - billingRows.length)
    : 0;
  const receiptBlankCount = isLastOrSingle
    ? Math.max(0, MIN_CLASSIC_RECEIPT_ROWS - receiptRows.length)
    : 0;
  const dnBlankCount = isLastOrSingle && dnTableRows
    ? Math.max(0, MIN_CLASSIC_BILLING_NOTE_ROWS - dnTableRows.length)
    : 0;
  const bankInfo = [
    bankName && showBank ? `ธนาคาร: ${bankName}` : null,
    bankAccountNumber && showBank ? `เลขที่บัญชี: ${bankAccountNumber}` : null,
  ].filter(Boolean) as string[];

  const holderInfo = bankAccountHolder && showBank ? `ชื่อบัญชี: ${bankAccountHolder}` : null;

  const payInfo = [
    showPaymentMethod && document.payment_method
      ? `วิธีชำระเงิน: ${paymentMethodText(PAYMENT_METHOD_LABELS[document.payment_method] || document.payment_method, document)}`
      : null,
    document.doc_type === "receipt" && document.amount_received != null
      ? `จำนวนเงินที่รับ: ${formatCurrency(document.amount_received)}`
      : null,
    document.wht_certificate_no
      ? `เลขที่หนังสือรับรองหัก ณ ที่จ่าย: ${document.wht_certificate_no}`
      : null,
  ].filter(Boolean) as string[];

  const paymentLines = [
    bankInfo.length > 0 ? bankInfo.join(" · ") : null,
    holderInfo,
    payInfo.length > 0 ? payInfo.join(" · ") : null,
  ].filter(Boolean) as string[];

  const titleTh = label.thai;
  const titleEn = label.en.toUpperCase();

  // Reference doc label
  const refLabel = (() => {
    if (!referenceDoc) return null;
    if (document.doc_type === "credit_note" || document.doc_type === "debit_note") {
      if (referenceDoc.doc_type === "invoice") return "อ้างอิงใบแจ้งหนี้";
      if (referenceDoc.doc_type === "receipt") return "อ้างอิงใบเสร็จรับเงิน";
    }
    if (document.doc_type === "receipt") {
      if (referenceDoc.doc_type === "invoice") return "อ้างอิงใบแจ้งหนี้";
      if (referenceDoc.doc_type === "billing_note") return "อ้างอิงใบวางบิล";
    }
    return "เอกสารอ้างอิง";
  })();

  return (
    <article
      className={
        `print-sheet print-theme-classic print-theme-classic-v2${isCopy ? " print-copy" : ""}${documentClass}`
        + `${clientProfile.classic_v2_hide_english_labels ? " print-hide-en" : ""}`
        + `${clientProfile.classic_v2_compact_signature ? " print-sig-compact" : ""}`
        + `${clientProfile.classic_v2_regular_item_font ? " print-regular-items" : ""}`
        + `${compactDn ? " print-dn-compact" : ""}`
      }
      style={{
        "--classic-font-scale": fontScaleMult,
        "--classic-fs-header": headerScaleMult,
        "--classic-fs-company": companyScaleMult,
        "--classic-fs-title": titleScaleMult,
        "--classic-fs-info": infoScaleMult,
        "--classic-fs-items": itemsScaleMult,
        "--classic-fs-num": numScaleMult,
        "--classic-fs-num-unit": numUnitScaleMult,
        "--classic-fs-thead": theadScaleMult,
        "--classic-fs-totals": totalsScaleMult,
        "--classic-fs-net": netScaleMult,
        "--classic-fs-payment": paymentScaleMult,
        "--classic-fs-terms": termsScaleMult,
        "--classic-fs-footer": footerScaleMult,
        "--classic-fs-en": enScaleMult,
      } as React.CSSProperties}
    >
      {/* ============== TOP HEADER ============== */}
      {showContinuationHeader && (
        <PrintContinuationHeader
          data={data}
          pageIndex={pageIndex}
          totalPages={totalPages}
        />
      )}
      {showHeader && (
        <>
          <header className={`print-classic-top${clientProfile.show_company_name === false ? " print-classic-top--no-name" : ""}${clientProfile.logo_layout === "above" && clientProfile.show_logo !== false && clientProfile.logo_url ? " print-classic-top--above" : ""}`}>
            <div className="print-classic-logo">
              {clientProfile.logo_url && clientProfile.show_logo !== false ? (
                <DocLogo
                  src={clientProfile.logo_url}
                  alt={clientProfile.company_name_th}
                  logoSize={clientProfile.logo_size}
                  banner={clientProfile.show_company_name === false}
                />
              ) : null}
            </div>
            <div className="print-classic-company">
              {clientProfile.show_company_name !== false ? (
                <>
                  <div className="print-classic-company-th">
                    {clientProfile.company_name_th}
                  </div>
                  {clientProfile.company_name_en ? (
                    <div className="print-classic-company-en">
                      {clientProfile.company_name_en}
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="print-classic-company-meta">
                {clientProfile.address ? (
                  <>
                    <div>{clientProfile.address}</div>
                  </>
                ) : null}
                {clientProfile.tax_id ? (
                  <div>เลขที่ผู้เสียภาษี : {clientProfile.tax_id}</div>
                ) : null}
                {clientProfile.phone ? (
                  <div>ติดต่อ: {clientProfile.phone}</div>
                ) : null}
              </div>
            </div>
            <div className="print-classic-top-right">
              <div className="print-classic-doc-title print-classic-doc-title--inline">
                <div className="print-classic-doc-title-th">{titleTh}</div>
                {titleEn ? (
                  <div className="print-classic-doc-title-en">{titleEn}</div>
                ) : null}
              </div>
              <div className="print-classic-copy-badge">
                <div className="print-classic-copy-th">{copyLabel}</div>
                <div className="print-classic-copy-en">
                  {isCopy ? "CUSTOMER COPY" : "CUSTOMER ORIGINAL"}
                </div>
              </div>
            </div>
          </header>

          {/* ============== INFO BAND ============== */}
          <section className="print-classic-info-band">
            <div className="print-classic-panel print-classic-customer-panel">
              <div className="print-classic-customer-row">
                <div className="print-classic-label">
                  <span className="print-classic-label-th">ชื่อลูกค้า :</span>
                  <span className="print-classic-label-en">CUSTOMER NAME</span>
                </div>
                <div className="print-classic-val">{customer.name}</div>

                <div className="print-classic-label">
                  <span className="print-classic-label-th">ที่อยู่ :</span>
                  <span className="print-classic-label-en">ADDRESS</span>
                </div>
                <div className="print-classic-val">{customer.address || "—"}</div>

                <div className="print-classic-label">
                  <span className="print-classic-label-th">โทรศัพท์ :</span>
                  <span className="print-classic-label-en">TELEPHONE</span>
                </div>
                <div className="print-classic-val">{customer.phone || "—"}</div>

                <div className="print-classic-label">
                  <span className="print-classic-label-th">เลขที่ผู้เสียภาษี :</span>
                  <span className="print-classic-label-en">TAX ID NO.</span>
                </div>
                <div className="print-classic-val">{customer.tax_id || "—"}</div>

                {customer.contact_name ? (
                  <>
                    <div className="print-classic-label">
                      <span className="print-classic-label-th">
                        ชื่อผู้ติดต่อ :
                      </span>
                      <span className="print-classic-label-en">
                        CONTACT PERSON
                      </span>
                    </div>
                    <div className="print-classic-val">
                      {customer.contact_name}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="print-classic-panel">
              <table className="print-classic-meta-table">
                <tbody>
                  <tr>
                    <th>
                      <span className="print-classic-meta-th-th">เลขที่ :</span>
                      <span className="print-classic-meta-th-en">NO.</span>
                    </th>
                    <td className="print-classic-meta-val">
                      {document.doc_number || "-"}
                    </td>
                  </tr>
                  <tr>
                    <th>
                      <span className="print-classic-meta-th-th">วันที่ :</span>
                      <span className="print-classic-meta-th-en">DATE</span>
                    </th>
                    <td className="print-classic-meta-val">
                      {formatPrintDate(document.issue_date, era)}
                    </td>
                  </tr>
                  {document.customer_po_number ? (
                    <tr>
                      <th>
                        <span className="print-classic-meta-th-th">เลขที่ใบสั่งซื้อ :</span>
                        <span className="print-classic-meta-th-en">PO NO.</span>
                      </th>
                      <td className="print-classic-meta-val">{document.customer_po_number}</td>
                    </tr>
                  ) : null}
                  {isReceipt && receiptPaymentNumber && !receiptPaidInFull ? (
                    <tr>
                      <th>
                        <span className="print-classic-meta-th-th">
                          ชำระครั้งที่ :
                        </span>
                        <span className="print-classic-meta-th-en">
                          PAYMENT NO.
                        </span>
                      </th>
                      <td className="print-classic-meta-val">
                        {receiptPaymentNumber}
                      </td>
                    </tr>
                  ) : null}
                  {referenceDoc && refLabel ? (
                    <tr>
                      <th>
                        <span className="print-classic-meta-th-th">
                          {refLabel} :
                        </span>
                        <span className="print-classic-meta-th-en">
                          REF. NO.
                        </span>
                      </th>
                      <td className="print-classic-meta-val">
                        {referenceDoc.doc_number || "-"}
                      </td>
                    </tr>
                  ) : null}
                  {document.due_date ? (
                    <tr>
                      <th>
                        <span className="print-classic-meta-th-th">
                          วันครบกำหนด :
                        </span>
                        <span className="print-classic-meta-th-en">
                          DUE DATE
                        </span>
                      </th>
                      <td className="print-classic-meta-val">
                        {formatPrintDate(document.due_date, era)}
                      </td>
                    </tr>
                  ) : null}
                  {/* ชื่อโครงการ prints as the items table's first row (a job
                      heading above the work), not here — see showProjectRow. */}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ============== ITEMS TABLE ============== */}
      <section className="print-classic-items-wrap">
        {isBillingNote && document.vat_registered ? (
          <div className="print-classic-items-title">
            รายการใบแจ้งหนี้ (INVOICES)
          </div>
        ) : document.doc_type === "receipt" &&
          receiptRows.length > 0 &&
          document.vat_registered ? (
          <div className="print-classic-items-title">
            {data.receiptPaidViaBillingNote
              ? "ใบวางบิลที่ชำระ (PAID BILLING NOTE)"
              : "รายการที่ชำระ (PAID INVOICES)"}
          </div>
        ) : (
          <div className="print-classic-items-title">
            {dnTableRows
              ? "รายการใบส่งของ (DELIVERY NOTES)"
              : document.doc_type === "receipt"
                ? "รายการที่ชำระ"
                : "รายการสินค้าและบริการ"}
            <span className="en">ITEMS</span>
          </div>
        )}

        <div className="print-classic-table-frame">
          {dnTableRows ? (
            <table className="print-classic-items-table">
              <colgroup>
                <col style={{ width: "12mm" }} />
                <col style={{ width: "32mm" }} />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    เลขที่<span className="en">NO.</span>
                  </th>
                  <th>
                    เลขที่ใบส่งของ<span className="en">DELIVERY NOTE NO.</span>
                  </th>
                  <th>
                    วันที่ส่งของ<span className="en">DELIVERY DATE</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    มูลค่า<span className="en">SUBTOTAL</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    ภาษีมูลค่าเพิ่ม<span className="en">VAT</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    รวม<span className="en">AMOUNT</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {dnTableRows.map((dn, i) => (
                  <tr key={dn.id}>
                    <td className="center">{dnTableStart + i}</td>
                    <td>{dn.delivery_note_number}</td>
                    <td>{dn.issue_date ? formatPrintDate(dn.issue_date, era) : "-"}</td>
                    <td className="right">{formatCurrency(dn.subtotal)}</td>
                    <td className="right">{formatCurrency(dn.vat_amount)}</td>
                    <td className="right bold">{formatCurrency(dn.total_amount)}</td>
                  </tr>
                ))}
                {Array.from({ length: dnBlankCount }).map((_, index) => (
                  <tr key={`dn-blank-${index}`} className="print-classic-blank-row">
                    <td className="center">&nbsp;</td>
                    <td>&nbsp;</td>
                    <td className="center">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right bold">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : isBillingNote && document.vat_registered ? (
            <table className="print-classic-items-table">
              <colgroup>
                <col style={{ width: "12mm" }} />
                <col style={{ width: "32mm" }} />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    เลขที่<span className="en">NO.</span>
                  </th>
                  <th>
                    เลขที่ใบแจ้งหนี้<span className="en">INVOICE NO.</span>
                  </th>
                  <th>
                    วันที่ออก<span className="en">ISSUE DATE</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    มูลค่า<span className="en">SUBTOTAL</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    ภาษีมูลค่าเพิ่ม<span className="en">VAT</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    รวม<span className="en">AMOUNT</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {billingRows.map((inv, i) => (
                  <tr key={inv.id}>
                    <td className="center">{startIndex + i}</td>
                    <td>{inv.invoice_number}</td>
                    <td>{formatPrintDate(inv.issue_date, era)}</td>
                    <td className="right">{formatCurrency(inv.subtotal)}</td>
                    <td className="right">{formatCurrency(inv.vat_amount)}</td>
                    <td className="right bold">
                      {formatCurrency(inv.total_amount)}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: billingBlankCount }).map((_, index) => (
                  <tr
                    key={`billing-blank-${index}`}
                    className="print-classic-blank-row"
                  >
                    <td className="center">&nbsp;</td>
                    <td>&nbsp;</td>
                    <td className="center">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right bold">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : document.doc_type === "receipt" &&
            receiptRows.length > 0 &&
            document.vat_registered ? (
            <table className="print-classic-items-table">
              <colgroup>
                <col style={{ width: "12mm" }} />
                <col style={{ width: "32mm" }} />
                <col style={{ width: "20mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
                <col style={{ width: "24mm" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    เลขที่<span className="en">NO.</span>
                  </th>
                  <th>
                    {data.receiptPaidViaBillingNote
                      ? "เลขที่ใบวางบิล"
                      : "เลขที่ใบแจ้งหนี้"}
                    <span className="en">
                      {data.receiptPaidViaBillingNote ? "BILLING NOTE NO." : "INVOICE NO."}
                    </span>
                  </th>
                  <th>
                    วันที่ออก<span className="en">ISSUE DATE</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    มูลค่า<span className="en">SUBTOTAL</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    ภาษีมูลค่าเพิ่ม<span className="en">VAT</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    จำนวนเงิน<span className="en">AMOUNT</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {receiptRows.map((inv, i) => (
                  <tr key={inv.id}>
                    <td className="center">{startIndex + i}</td>
                    <td>{inv.invoice_number}</td>
                    <td>{formatPrintDate(inv.issue_date, era)}</td>
                    <td className="right">{formatCurrency(inv.subtotal)}</td>
                    <td className="right">{formatCurrency(inv.vat_amount)}</td>
                    <td className="right bold">
                      {formatCurrency(inv.total_amount)}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: receiptBlankCount }).map((_, index) => (
                  <tr
                    key={`receipt-blank-${index}`}
                    className="print-classic-blank-row"
                  >
                    <td className="center">&nbsp;</td>
                    <td>&nbsp;</td>
                    <td className="center">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right bold">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="print-classic-items-table">
              <colgroup>
                <col style={{ width: "12mm" }} />
                <col style={{ width: "87mm" }} />
                <col style={{ width: "23mm" }} />
                <col style={{ width: "14mm" }} />
                <col style={{ width: "21mm" }} />
                <col style={{ width: "25mm" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    เลขที่<span className="en">ITEM</span>
                  </th>
                  <th>
                    รายการ<span className="en">DESCRIPTION</span>
                  </th>
                  <th style={{ textAlign: "center" }}>
                    จำนวน<span className="en">QTY</span>
                  </th>
                  <th style={{ textAlign: "center" }}>
                    หน่วย<span className="en">UNIT</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    ราคา/หน่วย<span className="en">UNIT PRICE</span>
                  </th>
                  <th style={{ textAlign: "right" }}>
                    จำนวนเงิน<span className="en">AMOUNT</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isFirstOrSingle && showProjectRow ? (
                  <tr className="print-classic-note-row print-classic-project-row">
                    {/* The NO./เลขที่ column stays empty so the heading starts
                        in the description column, lined up with the item names —
                        the row still reads as part of the table and the first
                        column keeps its rule. */}
                    <td />
                    <td colSpan={5}>
                      {/* The project name is the heading for the work below —
                          it stands alone, with no ชื่อโครงการ label. */}
                      <span className="print-classic-project-name">{document.task_name}</span>
                    </td>
                  </tr>
                ) : null}
                {tableLines.map((item) => {
                    // Hierarchical number ("G" / "G.j") + optional group header
                    // come from the global row plan, so numbering stays
                    // continuous across page batches.
                    const entry = dnRowPlanById.get(item.id);
                    const number = entry?.number ?? "";
                    const header = entry?.header ?? null;
                    // Child numbers (G.j) print in front of the description —
                    // only group and standalone numbers use the NO. column.
                    const isChild = number.includes(".");

                    const hasLineDiscount =
                      item.discount_amount > 0 || item.discount_percent > 0;
                    const deliveryNoteRef = lineDeliveryNoteMap[item.id];
                    const printableNote = getPrintableLineNote(item.line_note);
                    return (
                      <Fragment key={item.id}>
                        {header ? (
                          <tr className="print-classic-dn-group-row">
                            <td className="center">{header.g}</td>
                            {/* Merged band: the section text uses the full row
                                width (the paginator budgets it that way), so the
                                column rules stop at this row — the spacer below
                                is what keeps the grid running. */}
                            <td className="print-classic-dn-group-label" colSpan={5}>
                              {/* SO-only header (DN opt-in): the free text IS
                                  the header. Standard groups keep the DN ref
                                  line and append each frozen SO section as its
                                  own line below it. */}
                              {header.number ? (
                                <RefItemName name={dnHeaderLabel(header, era)} />
                              ) : null}
                              {header.soHeader ? (
                                header.number ? (
                                  <>
                                    {splitDnSectionHeaders(header.soHeader).map((soLine, soIndex) => (
                                      <div key={soIndex} className="print-classic-dn-group-so">
                                        <RefItemName name={soLine} />
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  <RefItemName name={header.soHeader} />
                                )
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                        <tr className={isChild ? "print-classic-dn-child" : undefined}>
                          <td className="center">{isChild ? "" : number}</td>
                          <td className="print-classic-item-name">
                            {isChild ? (
                              <span className="print-classic-dn-child-no">{number} </span>
                            ) : null}
                            <RefItemName name={item.item_name} />
                            {printableNote ? (
                              <div className="print-classic-item-note">
                                {printableNote}
                              </div>
                            ) : null}
                            {hasLineDiscount && !hideDeliveryAmounts && !item.hide_amounts_on_print && !blankForm ? (
                              <div className="print-classic-discount-note">
                                ส่วนลด {item.discount_percent || 0}%
                                {item.discount_amount > 0
                                  ? ` | -${formatCurrency(item.discount_amount)}`
                                  : ""}
                              </div>
                            ) : null}
                            {document.show_dn_variance && item.source_document_id ? (() => {
                              const parts = getDnVarianceParts({
                                deliveredQty: item.source_delivered_qty,
                                billedQty: Number(item.quantity) || 0,
                                unit: item.unit || "ชิ้น",
                                dnUnitPrice: item.source_unit_price,
                                unitPrice: Number(item.unit_price) || 0,
                                dnDocNumber: deliveryNoteRef?.number,
                                sourceKind: deliveryNoteRef?.kind,
                              });
                              return parts.length ? (
                                <div className="print-classic-dn-note">{parts.join(" | ")}</div>
                              ) : null;
                            })() : null}
                            {!document.vat_registered &&
                            (receiptRows.length > 1 ||
                              billingRows.length > 1) &&
                            invoiceNumberMap[item.document_id] ? (
                              <div className="print-classic-dn-note">
                                ใบแจ้งหนี้ {invoiceNumberMap[item.document_id]}
                              </div>
                            ) : null}
                            {document.doc_type === "quotation" && item.image_url ? (
                              <img
                                src={getProxiedImageUrl(item.image_url)}
                                alt={`รูปตัวอย่าง: ${item.item_name}`}
                                className="print-classic-line-image"
                              />
                            ) : null}
                          </td>
                          <td className="center">{blankForm ? "" : item.quantity.toLocaleString("th-TH")}</td>
                          <td className="center print-classic-item-unit">{item.unit}</td>
                          <td className="right">
                            {blankForm || !showAmountValues ? "" : item.hide_amounts_on_print ? "-" : formatCurrency(item.unit_price)}
                          </td>
                          <td className="right bold">
                            {blankForm || !showAmountValues ? "" : item.hide_amounts_on_print ? "-" : formatCurrency(item.line_total)}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                {Array.from({ length: blankLineCount }).map((_, index) => (
                  <tr
                    key={`blank-${index}`}
                    className="print-classic-blank-row"
                  >
                    <td className="center">&nbsp;</td>
                    <td className="print-classic-item-name">&nbsp;</td>
                    <td className="center">&nbsp;</td>
                    <td className="center">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                    <td className="right">&nbsp;</td>
                  </tr>
                ))}
                {showFooter && noteText ? (
                  <tr className="print-classic-note-row">
                    <td colSpan={6}>
                      {/* The document's own note closes the table, below the
                          ruled filler rows. Its label is บันทึก (NOTE) — the
                          workspace's closing terms own หมายเหตุ (REMARK). */}
                      <span className="print-classic-note-label">บันทึก (NOTE):</span>{" "}
                      <span className="print-classic-note-body">{noteText}</span>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}

          {/* ============== INVOICE DELIVERY NOTES ============== */}
          {invoiceDeliveryNotes.length > 0 &&
          !isDeliveryNote &&
          !data.showInlineDeliveryNotes &&
          !data.isDeliveryNoteSummaryInvoice ? (
            <div className="print-classic-frame-section">
              <div className="print-classic-frame-section-title">
                อ้างอิงใบส่งของ<span className="en">DELIVERY NOTES</span>
              </div>
              <table className="print-classic-items-table">
                <colgroup>
                  <col style={{ width: "12mm" }} />
                  <col />
                  <col style={{ width: "24mm" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      เลขที่<span className="en">NO.</span>
                    </th>
                    <th>
                      เลขที่ใบส่งของ<span className="en">DELIVERY NO.</span>
                    </th>
                    <th>
                      วันที่ส่งของ<span className="en">DELIVERY DATE</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceDeliveryNotes.map((dn, i) => (
                    <tr key={dn.id}>
                      <td className="center">{i + 1}</td>
                      <td>{dn.delivery_note_number}</td>
                      <td>{formatPrintDate(dn.issue_date, era)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* ============== REMARK (terms) / PAYMENT + TOTALS ============== */}
          {/* Terms print on every document type that has them configured,
              delivery notes included (Settings › เอกสาร offers a tab per
              type). A page with nothing to draw — hidden amounts and no terms
              or payment lines — skips the row entirely rather than printing an
              empty band. */}
          {showFooter && ((classicTerms.length > 0 || paymentLines.length > 0 || isReceipt) || (!hideDeliveryAmounts && !blankForm)) ? (
          <div className={`print-classic-bottom-row${useSummaryGrid ? " print-classic-bottom-row-receipt" : ""}`}>
            <div className="print-classic-terms-col">
              {/* Terms print in the remark slot, above PAYMENT — on delivery
                notes too, when that type has terms configured. */}
                {classicTerms.length > 0 ? (
                  <section className="print-classic-terms-section">
                    <div className="print-classic-terms-title">
                      หมายเหตุ (REMARK)
                    </div>
                    <ol className="print-classic-note-list">
                      {classicTerms.map((term, index) => (
                        <li key={`${index}-${term}`}>{term}</li>
                      ))}
                    </ol>
                  </section>
                ) : null}
                {paymentLines.length > 0 && !isReceipt ? (
                  <section className="print-classic-terms-section print-classic-terms-section--payment">
                    <div className="print-classic-terms-title">
                      รายละเอียดการชำระเงิน (PAYMENT)
                    </div>
                    <ul className="print-classic-payment-list">
                      {paymentLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {isReceipt ? (
                  <section className="print-classic-terms-section">
                    <div className="print-classic-settle-head">
                      <div className="print-classic-terms-title">
                        สถานะการชำระเงิน (SETTLEMENT)
                      </div>
                      {receiptPaidInFull ? (
                        <span className="print-classic-paid-badge">
                          <span>ชำระครบถ้วน</span>
                          <span className="print-classic-paid-badge-en">PAID IN FULL</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="print-classic-settle-row">
                      <span>ยอดตามเอกสารอ้างอิง (REFERENCE AMOUNT)</span>
                      <span>{formatCurrency(receiptReferenceAmount)}</span>
                    </div>
                    <div className="print-classic-settle-row">
                      <span>ยอดชำระสะสมก่อนหักภาษี ณ ที่จ่าย (TOTAL SETTLED)</span>
                      <span>{formatCurrency(receiptCumulativePaid ?? 0)}</span>
                    </div>
                    <div className="print-classic-settle-row">
                      <span>ยอดคงเหลือค้างชำระ (BALANCE DUE)</span>
                      <span>{formatCurrency(receiptOutstanding ?? 0)}</span>
                    </div>
                  </section>
                ) : null}
                {(document.doc_type === "credit_note" || document.doc_type === "debit_note") && referenceDoc ? (
                  <section className="print-classic-terms-section">
                    <div className="print-classic-terms-title">
                      อ้างอิงใบกำกับภาษีเดิม (ORIGINAL TAX INVOICE)
                    </div>
                    <div className="print-classic-settle-row">
                      <span>เลขที่ / วันที่</span>
                      <span>{referenceDoc.doc_number || "-"}{referenceDoc.issue_date ? ` · ${formatPrintDate(referenceDoc.issue_date, era)}` : ""}</span>
                    </div>
                    <div className="print-classic-settle-row">
                      <span>มูลค่าตามใบกำกับเดิม (ก่อน VAT)</span>
                      <span>{formatCurrency(referenceDoc.subtotal || 0)}</span>
                    </div>
                    <div className="print-classic-settle-row">
                      <span>มูลค่าตามใบกำกับเดิม (รวม VAT)</span>
                      <span>{formatCurrency(referenceDoc.total_amount || 0)}</span>
                    </div>
                    <div className="print-classic-settle-row">
                      <span>มูลค่าที่ถูกต้องหลังปรับปรุง (ก่อน VAT)</span>
                      <span>{formatCurrency(adjustmentCorrectAmount(referenceDoc.subtotal || 0, document.subtotal || 0, isCreditNote))}</span>
                    </div>
                    <div className="print-classic-settle-row">
                      <span>มูลค่าที่ถูกต้องหลังปรับปรุง (รวม VAT)</span>
                      <span>{formatCurrency(adjustmentCorrectAmount(referenceDoc.total_amount || 0, document.total_amount || 0, isCreditNote))}</span>
                    </div>
                    <div className="print-classic-settle-row">
                      <span>ผลต่าง = ยอดตามเอกสารฉบับนี้</span>
                      <span>{formatCurrency(document.total_amount || 0)}</span>
                    </div>
                  </section>
                ) : null}
                {classicTerms.length === 0 && paymentLines.length === 0 && !isReceipt ? (
                  <div className="print-classic-terms-body">-</div>
                ) : null}
            </div>
            {!hideDeliveryAmounts && !blankForm && (
              <div className="print-classic-totals-col">
                {isReceipt ? (
                  <>
                    {receiptTaxable ? (
                      <>
                        <div className="print-classic-totals-row">
                          <div className="print-classic-totals-lab">
                            <div className="print-classic-totals-th">ยอดก่อนภาษี</div>
                            <div className="print-classic-totals-en">AMOUNT BEFORE TAX</div>
                          </div>
                          <div className="print-classic-totals-val">{formatCurrency(receiptPreTax)}</div>
                        </div>
                        <div className="print-classic-totals-row">
                          <div className="print-classic-totals-lab">
                            <div className="print-classic-totals-th">ภาษีมูลค่าเพิ่ม {document.vat_rate}%</div>
                            <div className="print-classic-totals-en">VAT {document.vat_rate}%</div>
                          </div>
                          <div className="print-classic-totals-val">{formatCurrency(receiptVatAmount)}</div>
                        </div>
                      </>
                    ) : null}
                    <div className="print-classic-totals-row print-classic-totals-row-grand">
                      <div className="print-classic-totals-lab">
                        <div className="print-classic-totals-th">รับชำระครั้งนี้</div>
                        <div className="print-classic-totals-en">AMOUNT RECEIVED</div>
                      </div>
                      <div className="print-classic-totals-val">{formatCurrency(receiptAmount)}</div>
                    </div>
                    {document.wht_amount > 0 ? (
                      <div className="print-classic-totals-row">
                        <div className="print-classic-totals-lab">
                          <div className="print-classic-totals-th">หัก ณ ที่จ่าย {document.wht_rate}%</div>
                          <div className="print-classic-totals-en">WHT {document.wht_rate}%</div>
                        </div>
                        <div className="print-classic-totals-val">-{formatCurrency(document.wht_amount)}</div>
                      </div>
                    ) : null}
                    <div className="print-classic-totals-row print-classic-totals-row-net">
                      <div className="print-classic-totals-lab">
                        <div className="print-classic-totals-th">ยอดรับสุทธิ</div>
                        <div className="print-classic-totals-en">NET RECEIVED</div>
                      </div>
                      <div className="print-classic-totals-val">{formatCurrency(receiptAmount - receiptWhtTotal)}</div>
                    </div>
                  </>
                ) : isDeliveryNote && !showFullTotals ? (
                  <div className="print-classic-totals-row print-classic-totals-row-grand">
                    <div className="print-classic-totals-lab">
                      <div className="print-classic-totals-th">มูลค่ารวม</div>
                      <div className="print-classic-totals-en">TOTAL VALUE</div>
                    </div>
                    <div className="print-classic-totals-val">
                      {formatCurrency(document.subtotal)}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="print-classic-totals-row">
                      <div className="print-classic-totals-lab">
                            <div className="print-classic-totals-th">{isCreditNote ? "ยอดลดก่อน VAT" : isDebitNote ? "ยอดเพิ่มก่อน VAT" : "รวมเงิน"}</div>
                            <div className="print-classic-totals-en">{isCreditNote || isDebitNote ? "ADJUSTMENT SUBTOTAL" : "SUB TOTAL"}</div>
                      </div>
                        <div className="print-classic-totals-val">{formatCurrency(document.subtotal)}</div>
                    </div>
                    {document.discount_amount > 0 ? (
                      <div className="print-classic-totals-row">
                        <div className="print-classic-totals-lab">
                          <div className="print-classic-totals-th">
                            ส่วนลดท้ายบิล
                            {document.discount_percent
                              ? ` (${document.discount_percent}%)`
                              : ""}
                          </div>
                          <div className="print-classic-totals-en">DISCOUNT</div>
                        </div>
                        <div className="print-classic-totals-val">
                          -{formatCurrency(document.discount_amount)}
                        </div>
                      </div>
                    ) : null}
                    {document.vat_registered && document.vat_amount > 0 ? (
                      <div className="print-classic-totals-row">
                        <div className="print-classic-totals-lab">
                          <div className="print-classic-totals-th">
                              {isCreditNote ? "ภาษีที่ลด" : isDebitNote ? "ภาษีที่เพิ่ม" : "ภาษีมูลค่าเพิ่ม"} {document.vat_rate}%
                          </div>
                          <div className="print-classic-totals-en">
                            {isCreditNote || isDebitNote ? "VAT ADJUSTMENT" : `VAT ${document.vat_rate}%`}
                          </div>
                        </div>
                        <div className="print-classic-totals-val">
                          {formatCurrency(document.vat_amount)}
                        </div>
                      </div>
                    ) : null}
                    <div className="print-classic-totals-row print-classic-totals-row-grand">
                      <div className="print-classic-totals-lab">
                        <div className="print-classic-totals-th">
                          {isCreditNote ? "ยอดลดรวม (รวม VAT)" : isDebitNote ? "ยอดเพิ่มรวม (รวม VAT)" : "ยอดรวมทั้งสิ้น"}
                        </div>
                        <div className="print-classic-totals-en">
                          {isCreditNote ? "TOTAL CREDIT NOTE" : isDebitNote ? "TOTAL DEBIT NOTE" : "GRAND TOTAL"}
                        </div>
                      </div>
                      <div className="print-classic-totals-val">
                        {formatCurrency(document.total_amount)}
                      </div>
                    </div>
                    {document.wht_amount > 0 && !isCreditNote && !isDebitNote && !isQuotation ? (
                      <div className="print-classic-totals-row">
                        <div className="print-classic-totals-lab">
                          <div className="print-classic-totals-th">
                            หัก ณ ที่จ่าย {document.wht_rate}%
                          </div>
                          <div className="print-classic-totals-en">
                            WHT {document.wht_rate}%
                          </div>
                        </div>
                        <div className="print-classic-totals-val">
                          -{formatCurrency(document.wht_amount)}
                        </div>
                      </div>
                    ) : null}
                    {!isCreditNote && !isDebitNote && !isQuotation ? (
                      <div className="print-classic-totals-row print-classic-totals-row-net">
                        <div className="print-classic-totals-lab">
                          <div className="print-classic-totals-th">ยอดชำระสุทธิ</div>
                          <div className="print-classic-totals-en">NET PAYABLE</div>
                        </div>
                        <div className="print-classic-totals-val">
                          {formatCurrency(document.wht_amount > 0 ? document.net_payable : document.total_amount)}
                        </div>
                      </div>
                    ) : null}
                    {isQuotation && document.wht_rate > 0 ? (
                      <div className="print-classic-quotation-wht-note">
                        ราคานี้ไม่รวมภาษีหัก ณ ที่จ่าย (ถ้ามี)
                        <span className="print-classic-quotation-wht-note-en">
                          Excluding withholding tax, if any.
                        </span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>
          ) : null}
        </div>
      </section>

      {lineItems.length > 0 && pageMode !== "single" && pageMode !== "last" && (
        <div
          className="mt-1.5 text-center text-[#94a3b8] tracking-[0.08em] border-b-[0.5px] border-[#D3DAE6] pb-1"
          style={{ fontSize: "calc(8.5px * var(--classic-fs-items, 1))" }}
        >
          รายการต่อไป… (CONTINUED)
        </div>
      )}

      {showFooter && (
        <>

          {/* ============== BOTTOM BAND (signatures) ============== */}
          {/* The pin spacer absorbs rounding slack so the band always sits
              at the sheet bottom (see .print-classic-bottom-pin). */}
          <div className="print-classic-bottom-pin" aria-hidden="true" />
          <div className={`print-classic-bottom-band${document.doc_type === "invoice" ? " print-sig-4col" : ""}${document.doc_type === "receipt" ? " print-sig-receipt" : ""}${document.doc_type === "billing_note" ? " print-sig-2col" : ""}${isQuotation ? " print-sig-2eq" : ""}`}>
            {(() => {
              const sig = SIG_LABELS[document.doc_type] ?? SIG_LABELS_DEFAULT;
              // Tax invoice: four boxes (received / delivered / issued /
              // authorized) with no per-box dates. The company signature and
              // stamp stay on the authorized box; the issuing officer signs
              // the issued box by hand.
              if (document.doc_type === "invoice") {
                return (
                  <>
                    <div className="print-classic-sig-cell">
                      <div className="print-classic-sig-th">{sig.box1Title}</div>
                      <div className="print-classic-sig-th-en">{sig.box1TitleEn}</div>
                      <div className="print-classic-sig-line"></div>
                      <div className="print-classic-sig-role">
                        <span className="print-classic-sig-role-th">{sig.box1RoleTh}</span>
                        <span className="print-classic-sig-role-en"> / {sig.box1RoleEn}</span>
                      </div>
                    </div>
                    <div className="print-classic-sig-cell print-classic-sig-cell-mid">
                      <div className="print-classic-sig-line"></div>
                      <div className="print-classic-sig-role">
                        <span className="print-classic-sig-role-th">{sig.box2RoleTh}</span>
                        <span className="print-classic-sig-role-en"> / {sig.box2RoleEn}</span>
                      </div>
                    </div>
                    <div className="print-classic-sig-cell print-classic-sig-cell-mid">
                      <div className="print-classic-sig-line"></div>
                      <div className="print-classic-sig-role">
                        <span className="print-classic-sig-role-th">ผู้ออกเอกสาร</span>
                        <span className="print-classic-sig-role-en"> / ISSUED BY</span>
                      </div>
                    </div>
                    <div className="print-classic-sig-cell">
                      <div className="print-classic-sig-th">
                        {clientProfile.company_name_th}
                      </div>
                      <div className="print-classic-sig-th-en">
                        {clientProfile.company_name_en?.toUpperCase() ||
                          clientProfile.company_name_th.toUpperCase()}
                      </div>
                      <div className="print-classic-sig-line">
                        {signatureUrl ? (
                          <img
                            src={signatureUrl}
                            alt="ลายเซ็น"
                            className="print-classic-sig-img"
                            style={{ height: `${(12 * signatureScaleMult).toFixed(1)}mm` }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : null}
                        {stampUrl ? (
                          <img
                            src={stampUrl}
                            alt="ตราประทับ"
                            className="print-classic-sig-stamp"
                            style={{ height: `${(18 * stampScaleMult).toFixed(1)}mm` }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : null}
                      </div>
                      <div className="print-classic-sig-role">
                        <span className="print-classic-sig-role-th">ผู้มีอำนาจลงนาม</span>
                        <span className="print-classic-sig-role-en"> / AUTHORIZED BY</span>
                      </div>
                    </div>
                  </>
                );
              }
              // Receipt: the two signer boxes merge into one wide payment-info
              // cell (moved up from the body — info only, no sign lines, no
              // dates); the company authorized box stays as the sole signer.
              if (document.doc_type === "receipt") {
                return (
                  <>
                    <div className="print-classic-sig-cell print-classic-pay-cell">
                      <div className="print-classic-pay-title">
                        รายละเอียดการชำระเงิน (PAYMENT)
                      </div>
                      {(() => {
                        const method = document.payment_method;
                        const rows = buildReceiptPaymentRows({
                          methodLabel:
                            showPaymentMethod && method
                              ? PAYMENT_METHOD_LABELS[method] || method
                              : null,
                          isCheque: method === "cheque",
                          isTransfer: method === "bank_transfer",
                          chequeNo: document.payment_detail?.cheque_no,
                          chequeBank: document.payment_detail?.cheque_bank,
                          chequeDate: document.payment_detail?.cheque_date,
                          bankAccountLine: showBank
                            ? [bankName, bankAccountNumber].filter(Boolean).join(" · ") || null
                            : null,
                          amountReceived: document.amount_received,
                          whtCertificateNo: document.wht_certificate_no,
                          issueDate: document.issue_date,
                          era,
                        });
                        return rows.length > 0 ? (
                          <>
                            <div className="print-classic-pay-rows">
                              {rows.map((row) => (
                                <div key={row.label} className="print-classic-pay-row">
                                  <span className="print-classic-pay-lab">{row.label}</span>
                                  {row.emphasize ? (
                                    <span className="print-classic-pay-val print-classic-pay-method">{row.value}</span>
                                  ) : (
                                    <span className="print-classic-pay-val">{row.value}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div className="print-classic-pay-note">
                              การชำระเงินจะถือว่าเสร็จสมบูรณ์เมื่อได้รับชำระเงินครบถ้วนตามจำนวนที่ระบุในเอกสารฉบับนี้
                            </div>
                          </>
                        ) : (
                          <div className="print-classic-pay-list">-</div>
                        );
                      })()}
                    </div>
                    <div className="print-classic-sig-cell print-classic-sig-cell-fill">
                      <div className="print-classic-sig-th">
                        {clientProfile.company_name_th}
                      </div>
                      <div className="print-classic-sig-th-en">
                        {clientProfile.company_name_en?.toUpperCase() ||
                          clientProfile.company_name_th.toUpperCase()}
                      </div>
                      <div className="print-classic-sig-line">
                        {signatureUrl ? (
                          <img
                            src={signatureUrl}
                            alt="ลายเซ็น"
                            className="print-classic-sig-img"
                            style={{ height: `${(12 * signatureScaleMult).toFixed(1)}mm` }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : null}
                        {stampUrl ? (
                          <img
                            src={stampUrl}
                            alt="ตราประทับ"
                            className="print-classic-sig-stamp"
                            style={{ height: `${(18 * stampScaleMult).toFixed(1)}mm` }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : null}
                      </div>
                      <div className="print-classic-sig-role">
                        <span className="print-classic-sig-role-th">ผู้มีอำนาจลงนาม</span>
                        <span className="print-classic-sig-role-en"> / AUTHORIZED BY</span>
                      </div>
                    </div>
                  </>
                );
              }
              // Billing note: acknowledged and issued boxes only — the cheque
              // received date lives inside the acknowledged box (unpaid notes),
              // and there is no company authorized box.
              if (document.doc_type === "billing_note") {
                return (
                  <>
                    <div className="print-classic-sig-cell print-classic-sig-cell-ack">
                      <div className="print-classic-sig-title-row">
                        <div className="print-classic-sig-th">{sig.box1Title}</div>
                        <div className="print-classic-sig-th-en">{sig.box1TitleEn}</div>
                      </div>
                      <div className="print-classic-sig-line"></div>
                      <div className="print-classic-sig-role">
                        <span className="print-classic-sig-role-th">{sig.box1RoleTh}</span>
                        <span className="print-classic-sig-role-en"> / {sig.box1RoleEn}</span>
                      </div>
                      <div className="print-classic-sig-dates">
                        <div className="print-classic-sig-daterow">
                          <span className="print-classic-sig-daterow-lab">วันที่ได้รับใบวางบิล</span>
                          <SigDateFill />
                        </div>
                        {document.status !== "paid" && (
                          <div className="print-classic-sig-daterow">
                            <span className="print-classic-sig-daterow-lab">วันที่นัดรับเช็ค</span>
                            <SigDateFill />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="print-classic-sig-cell print-classic-sig-cell-mid">
                      <div className="print-classic-sig-line"></div>
                      <div className="print-classic-sig-role">
                        <span className="print-classic-sig-role-th">ผู้ออกเอกสาร</span>
                        <span className="print-classic-sig-role-en"> / ISSUED BY</span>
                      </div>
                    </div>
                  </>
                );
              }
              return (
                <>
                  <div className="print-classic-sig-cell">
                    <div className="print-classic-sig-th">{sig.box1Title}</div>
                    <div className="print-classic-sig-th-en">{sig.box1TitleEn}</div>
                    <div className="print-classic-sig-line"></div>
                    <div className="print-classic-sig-dt">
                      วันที่ <span className="print-classic-sig-dt-en">/ DATE</span>
                    </div>
                    <SigDateFill />
                    <div className="print-classic-sig-role">
                      <span className="print-classic-sig-role-th">{sig.box1RoleTh}</span>
                      <span className="print-classic-sig-role-en"> / {sig.box1RoleEn}</span>
                    </div>
                  </div>                  <div className="print-classic-sig-cell print-classic-sig-cell-mid">
                    <div className="print-classic-sig-line"></div>
                    <div className="print-classic-sig-dt">
                      วันที่ <span className="print-classic-sig-dt-en">/ DATE</span>
                    </div>
                    <SigDateFill />
                    <div className="print-classic-sig-role">
                      <span className="print-classic-sig-role-th">{sig.box2RoleTh}</span>
                      <span className="print-classic-sig-role-en"> / {sig.box2RoleEn}</span>
                    </div>
                  </div>
                  {/* Quotation: two signer boxes only — no company
                      authorized box. */}
                  {!isQuotation ? (
                  <div className={
                    document.doc_type === "delivery_note"
                      // Title-less like the middle box: bottom-pin the content
                      // so the signature lines align across all three boxes.
                      ? "print-classic-sig-cell print-classic-sig-cell-mid"
                      : "print-classic-sig-cell"
                  }>
                    {document.doc_type === "delivery_note" ? null : (
                      <>
                        <div className="print-classic-sig-th">
                          {clientProfile.company_name_th}
                        </div>
                        <div className="print-classic-sig-th-en">
                          {clientProfile.company_name_en?.toUpperCase() ||
                            clientProfile.company_name_th.toUpperCase()}
                        </div>
                      </>
                    )}
                    <div className="print-classic-sig-line">
                      {signatureUrl ? (
                        <img
                          src={signatureUrl}
                          alt="ลายเซ็น"
                          className="print-classic-sig-img"
                          style={{ height: `${(12 * signatureScaleMult).toFixed(1)}mm` }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : null}
                      {stampUrl ? (
                        <img
                          src={stampUrl}
                          alt="ตราประทับ"
                          className="print-classic-sig-stamp"
                          style={{ height: `${(18 * stampScaleMult).toFixed(1)}mm` }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : null}
                    </div>
                    <div className="print-classic-sig-dt">
                      วันที่ <span className="print-classic-sig-dt-en">/ DATE</span>
                    </div>
                    <SigDateFill />
                    <div className="print-classic-sig-role">
                      {document.doc_type === "delivery_note" ? (
                        <>
                          <span className="print-classic-sig-role-th">ผู้ออกเอกสาร</span>
                          <span className="print-classic-sig-role-en"> / ISSUED BY</span>
                        </>
                      ) : (
                        <>
                          <span className="print-classic-sig-role-th">ผู้มีอำนาจลงนาม</span>
                          <span className="print-classic-sig-role-en"> / AUTHORIZED BY</span>
                        </>
                      )}
                    </div>
                  </div>
                  ) : null}
                </>
              );
            })()}
          </div>

          {/* ============== FOOTER ============== */}
        </>
      )}

      {showInitialsStrip && (
        <div className="print-classic-initials-strip" aria-hidden="true">
          <span className="print-classic-initials-co">
            {document.doc_type === "delivery_note" ? "ผู้ออกเอกสาร" : <>ในนาม&nbsp;{clientProfile.company_name_th}</>}
          </span>
          <span className="print-classic-initials-sign">
            {signatureUrl || stampUrl ? (
              <span className="print-classic-initials-chop">
                {signatureUrl ? (
                  <img
                    src={signatureUrl}
                    alt=""
                    className="print-classic-initials-sig"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : null}
                {stampUrl ? (
                  <img
                    src={stampUrl}
                    alt=""
                    className="print-classic-initials-stamp"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : null}
              </span>
            ) : (
              <>
                ลงชื่อ&nbsp;<span className="print-classic-initials-fill" />
                &nbsp;{document.doc_type === "delivery_note" ? "ผู้ออกเอกสาร" : "ผู้มีอำนาจลงนาม"}
              </>
            )}
          </span>
          <span className="print-classic-initials-page">หน้า&nbsp;{pageIndex}/{totalPages}</span>
        </div>
      )}

      {isCopy && (
        <div className="print-copy-watermark">ฉบับสำเนา</div>
      )}

      {totalPages > 1 && (
        <div className="print-classic-page-no">
          หน้า {pageIndex}/{totalPages}
        </div>
      )}
    </article>
  );
}
