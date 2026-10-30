import type { Document } from "../types";
import { isManualStage, MANUAL_STAGE_LABELS, type ManualStage } from "./dealStages";

export type DealQueue =
  "wait_send" | "wait_invoice" | "wait_collect" | "partial" | "overdue" | "progress" | "done";

export type DealPhase = "quote" | "deliver" | "invoice" | "collect" | "done";

export const DEAL_PHASE_ORDER: DealPhase[] = ["quote", "deliver", "invoice", "collect", "done"];

export const DEAL_PHASE_LABELS: Record<DealPhase, string> = {
  quote: "ใบเสนอราคา",
  deliver: "ส่งของ",
  invoice: "ออกบิล",
  collect: "เก็บเงิน",
  done: "เสร็จสิ้น",
};

export type WorkflowDoc = Pick<
  Document,
  "id" | "doc_type" | "doc_number" | "status" | "line_items"
>;

export interface DealStageInput {
  documents: WorkflowDoc[];
  latestDocument: WorkflowDoc | null;
  isDone: boolean;
  isOverdue: boolean;
  manualStage?: string | null;
}

export interface DealStageInfo {
  stageLabel: string;
  stageHint: string;
  queue: DealQueue;
  phase: DealPhase;
  skipped: DealPhase[];
  isManual: boolean;
}

export type DealStepState = "done" | "current" | "skipped" | "todo";

export interface DealLifecycleStep {
  phase: DealPhase;
  label: string;
  state: DealStepState;
}

export function getDealLifecycleSteps(
  phase: DealPhase,
  skipped: DealPhase[] = [],
): DealLifecycleStep[] {
  const skippedSet = new Set(skipped);
  const currentIndex = DEAL_PHASE_ORDER.indexOf(phase);
  return DEAL_PHASE_ORDER.map((step, index) => {
    let state: DealStepState;
    if (phase === "done" || index < currentIndex) {
      state = skippedSet.has(step) ? "skipped" : "done";
    } else if (index === currentIndex) {
      state = skippedSet.has(step) ? "skipped" : "current";
    } else {
      state = "todo";
    }
    return { phase: step, label: DEAL_PHASE_LABELS[step], state };
  });
}

function hasPartialPayment(documents: WorkflowDoc[]) {
  return documents.some((doc) => doc.status === "partially_paid");
}

function getDnWaitingForInvoice(documents: WorkflowDoc[]) {
  return documents.filter((doc) => doc.doc_type === "delivery_note" && doc.status === "sent");
}

function getBillingWaitingForPayment(documents: WorkflowDoc[]) {
  return documents.filter(
    (doc) => doc.doc_type === "billing_note" && (doc.status === "sent" || doc.status === "overdue"),
  );
}

function getQuotationDeliveryProgress(documents: WorkflowDoc[]) {
  const nonVoided = documents.filter((doc) => doc.status !== "voided");
  const quote = [...nonVoided].reverse().find((doc) => doc.doc_type === "quotation");
  if (!quote?.line_items?.length) return null;

  const deliveredByQuoteLine = new Map<string, number>();
  for (const doc of nonVoided) {
    if (doc.doc_type !== "delivery_note" || (doc.status !== "sent" && doc.status !== "converted"))
      continue;
    for (const line of doc.line_items || []) {
      if (line.source_document_id !== quote.id || !line.source_line_item_id) continue;
      deliveredByQuoteLine.set(
        line.source_line_item_id,
        (deliveredByQuoteLine.get(line.source_line_item_id) || 0) + line.quantity,
      );
    }
  }

  const quoted = quote.line_items.reduce((sum, line) => sum + line.quantity, 0);
  const delivered = quote.line_items.reduce(
    (sum, line) => sum + (deliveredByQuoteLine.get(line.id) || 0),
    0,
  );
  if (delivered <= 0) return null;
  return { delivered, quoted };
}

function phaseForDocType(docType: string | null | undefined): DealPhase {
  switch (docType) {
    case "quotation":
      return "quote";
    case "delivery_note":
      return "deliver";
    case "invoice":
      return "invoice";
    case "billing_note":
    case "receipt":
    case "credit_note":
    case "debit_note":
      return "collect";
    default:
      return "quote";
  }
}

function getSkippedPhases(documents: WorkflowDoc[]): DealPhase[] {
  const visible = documents.filter((doc) => doc.status !== "voided");
  if (visible.length === 0) return [];
  const types = new Set(visible.map((doc) => doc.doc_type));
  const skipped: DealPhase[] = [];
  const hasInvoice = types.has("invoice");
  const hasBilling = types.has("billing_note");
  const hasReceipt = types.has("receipt");
  const hasLaterDoc = hasInvoice || hasBilling || hasReceipt || types.has("delivery_note");
  if (!types.has("quotation") && hasLaterDoc) skipped.push("quote");
  if (!types.has("delivery_note") && (hasInvoice || hasBilling || hasReceipt)) {
    skipped.push("deliver");
  }
  if (!hasInvoice && (hasBilling || hasReceipt)) skipped.push("invoice");
  return skipped;
}

function deriveBaseStage(input: DealStageInput): DealStageInfo {
  const { documents, latestDocument, isDone, isOverdue } = input;
  const skipped = getSkippedPhases(documents);
  const dnWaiting = getDnWaitingForInvoice(documents);
  const billingWaiting = getBillingWaitingForPayment(documents);
  const quoteProgress = getQuotationDeliveryProgress(documents);

  if (isDone) {
    return {
      stageLabel: "เสร็จแล้ว",
      stageHint: "ปิดงานแล้ว",
      queue: "done",
      phase: "done",
      skipped,
      isManual: false,
    };
  }
  if (isOverdue) {
    return {
      stageLabel: "เกินกำหนด",
      stageHint: "ต้องติดตาม",
      queue: "overdue",
      phase: latestDocument?.doc_type === "quotation" ? "quote" : "collect",
      skipped,
      isManual: false,
    };
  }
  if (hasPartialPayment(documents)) {
    return {
      stageLabel: "ชำระบางส่วน",
      stageHint: "ยังรับเงินไม่ครบ",
      queue: "partial",
      phase: "collect",
      skipped,
      isManual: false,
    };
  }
  if (dnWaiting.length > 0) {
    return {
      stageLabel: "รอออกใบแจ้งหนี้",
      stageHint: `ส่งของแล้ว ${dnWaiting.length} ใบ`,
      queue: "wait_invoice",
      phase: "invoice",
      skipped,
      isManual: false,
    };
  }
  if (billingWaiting.length > 0) {
    return {
      stageLabel: "รอรับเงิน",
      stageHint: "ใบวางบิลส่งแล้ว",
      queue: "wait_collect",
      phase: "collect",
      skipped,
      isManual: false,
    };
  }
  const draftReceipt = documents.find(
    (doc) => doc.doc_type === "receipt" && doc.status === "draft",
  );
  if (draftReceipt) {
    return {
      stageLabel: "รอยืนยันการรับเงิน",
      stageHint: "ใบเสร็จร่าง",
      queue: "wait_collect",
      phase: "collect",
      skipped,
      isManual: false,
    };
  }
  if (latestDocument?.status === "draft") {
    const label =
      latestDocument.doc_type === "quotation"
        ? "รอส่งใบเสนอราคา"
        : latestDocument.doc_type === "delivery_note"
          ? "รอส่งของ"
          : latestDocument.doc_type === "invoice"
            ? "รอส่งใบแจ้งหนี้"
            : latestDocument.doc_type === "billing_note"
              ? "รอส่งใบวางบิล"
              : "รอส่งเอกสาร";
    const draftCount = documents.filter((doc) => doc.status === "draft").length;
    return {
      stageLabel: label,
      stageHint: draftCount > 1 ? `ฉบับร่าง • มี ${draftCount} ร่างค้าง` : "ฉบับร่าง",
      queue: "wait_send",
      phase: phaseForDocType(latestDocument.doc_type),
      skipped,
      isManual: false,
    };
  }
  if (quoteProgress) {
    return {
      stageLabel: "กำลังส่งของ",
      stageHint: `ส่งแล้ว ${quoteProgress.delivered.toLocaleString("th-TH")} / ${quoteProgress.quoted.toLocaleString("th-TH")}`,
      queue: "progress",
      phase: "deliver",
      skipped,
      isManual: false,
    };
  }
  if (latestDocument?.doc_type === "quotation") {
    return {
      stageLabel: "ใบเสนอราคา",
      stageHint: "รอลูกค้าตอบ",
      queue: "progress",
      phase: "quote",
      skipped,
      isManual: false,
    };
  }
  if (latestDocument?.doc_type === "invoice") {
    return {
      stageLabel: "รอวางบิล",
      stageHint: "ใบแจ้งหนี้ส่งแล้ว",
      queue: "progress",
      phase: "collect",
      skipped,
      isManual: false,
    };
  }
  if (latestDocument?.doc_type === "delivery_note") {
    return {
      stageLabel: "ใบส่งของ",
      stageHint: "รอดำเนินการต่อ",
      queue: "progress",
      phase: "invoice",
      skipped,
      isManual: false,
    };
  }
  return {
    stageLabel: "กำลังดำเนินการ",
    stageHint: latestDocument?.doc_number || "",
    queue: "progress",
    phase: phaseForDocType(latestDocument?.doc_type),
    skipped,
    isManual: false,
  };
}

export function deriveDealStage(input: DealStageInput): DealStageInfo {
  const base = deriveBaseStage(input);
  if (!input.isDone && isManualStage(input.manualStage ?? null)) {
    const manual = input.manualStage as ManualStage;
    return {
      ...base,
      stageLabel: MANUAL_STAGE_LABELS[manual],
      stageHint: "ตั้งค่าสถานะเอง",
      queue: manual,
      isManual: true,
    };
  }
  return base;
}
