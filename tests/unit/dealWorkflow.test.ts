import { describe, expect, it } from "vitest";
import {
  DEAL_PHASE_LABELS,
  DEAL_PHASE_ORDER,
  deriveDealStage,
  getDealLifecycleSteps,
  type WorkflowDoc,
} from "../../src/lib/dealWorkflow";

type DocType = WorkflowDoc["doc_type"];
type DocStatus = WorkflowDoc["status"];

function doc(
  id: string,
  doc_type: DocType,
  status: DocStatus,
  line_items: WorkflowDoc["line_items"] = [],
): WorkflowDoc {
  return { id, doc_type, doc_number: id, status, line_items };
}

function derive(
  documents: WorkflowDoc[],
  options: {
    latestDocument?: WorkflowDoc | null;
    isDone?: boolean;
    isOverdue?: boolean;
    manualStage?: string | null;
  } = {},
) {
  return deriveDealStage({
    documents,
    latestDocument:
      options.latestDocument === undefined
        ? (documents[documents.length - 1] ?? null)
        : options.latestDocument,
    isDone: options.isDone ?? false,
    isOverdue: options.isOverdue ?? false,
    manualStage: options.manualStage ?? null,
  });
}

function line(
  id: string,
  quantity: number,
  sourceDocumentId: string | null,
  sourceLineItemId: string | null,
) {
  return {
    id,
    quantity,
    source_document_id: sourceDocumentId,
    source_line_item_id: sourceLineItemId,
  } as unknown as NonNullable<WorkflowDoc["line_items"]>[number];
}

describe("deal workflow stage", () => {
  it("exposes one fixed lifecycle order and labels", () => {
    expect(DEAL_PHASE_ORDER).toEqual(["quote", "deliver", "invoice", "collect", "done"]);
    expect(DEAL_PHASE_LABELS.done).toBe("เสร็จสิ้น");
  });

  it("marks a done deal as done and ignores a manual override", () => {
    const stage = derive([doc("inv-1", "invoice", "paid")], {
      isDone: true,
      manualStage: "wait_collect",
    });
    expect(stage.phase).toBe("done");
    expect(stage.queue).toBe("done");
    expect(stage.stageLabel).toBe("เสร็จแล้ว");
    expect(stage.isManual).toBe(false);
  });

  it("keeps the overdue label while pointing at the collect phase", () => {
    const stage = derive([doc("inv-1", "invoice", "sent")], { isOverdue: true });
    expect(stage.stageLabel).toBe("เกินกำหนด");
    expect(stage.queue).toBe("overdue");
    expect(stage.phase).toBe("collect");
  });

  it("keeps an overdue quotation in the quote phase", () => {
    const stage = derive([doc("q-1", "quotation", "sent")], { isOverdue: true });
    expect(stage.stageLabel).toBe("เกินกำหนด");
    expect(stage.phase).toBe("quote");
  });

  it("reads a partial payment as the collect phase", () => {
    const stage = derive([doc("inv-1", "invoice", "partially_paid")]);
    expect(stage.stageLabel).toBe("ชำระบางส่วน");
    expect(stage.queue).toBe("partial");
    expect(stage.phase).toBe("collect");
  });

  it("asks for an invoice once a delivery note is sent", () => {
    const stage = derive([doc("dn-1", "delivery_note", "sent")]);
    expect(stage.stageLabel).toBe("รอออกใบแจ้งหนี้");
    expect(stage.stageHint).toBe("ส่งของแล้ว 1 ใบ");
    expect(stage.queue).toBe("wait_invoice");
    expect(stage.phase).toBe("invoice");
  });

  it("waits for money once the billing note is sent", () => {
    const stage = derive([doc("inv-1", "invoice", "sent"), doc("bn-1", "billing_note", "sent")]);
    expect(stage.stageLabel).toBe("รอรับเงิน");
    expect(stage.queue).toBe("wait_collect");
    expect(stage.phase).toBe("collect");
  });

  it("waits for confirmation on a draft receipt", () => {
    const stage = derive([doc("inv-1", "invoice", "sent"), doc("rc-1", "receipt", "draft")]);
    expect(stage.stageLabel).toBe("รอยืนยันการรับเงิน");
    expect(stage.queue).toBe("wait_collect");
    expect(stage.phase).toBe("collect");
  });

  it("maps each draft document to its own phase", () => {
    const quotation = derive([doc("q-1", "quotation", "draft")]);
    expect(quotation.stageLabel).toBe("รอส่งใบเสนอราคา");
    expect(quotation.phase).toBe("quote");

    const delivery = derive([doc("dn-1", "delivery_note", "draft")]);
    expect(delivery.stageLabel).toBe("รอส่งของ");
    expect(delivery.phase).toBe("deliver");

    const invoice = derive([doc("inv-1", "invoice", "draft")]);
    expect(invoice.stageLabel).toBe("รอส่งใบแจ้งหนี้");
    expect(invoice.phase).toBe("invoice");

    const billing = derive([doc("bn-1", "billing_note", "draft")]);
    expect(billing.stageLabel).toBe("รอส่งใบวางบิล");
    expect(billing.phase).toBe("collect");
  });

  it("reads a sent quotation as the quote phase", () => {
    const stage = derive([doc("q-1", "quotation", "sent")]);
    expect(stage.stageLabel).toBe("ใบเสนอราคา");
    expect(stage.queue).toBe("progress");
    expect(stage.phase).toBe("quote");
  });

  it("reads a converted delivery note as delivery progress", () => {
    const quote = doc("q-1", "quotation", "sent", [line("ql-1", 10, null, null)]);
    const delivery = doc("dn-1", "delivery_note", "converted", [line("dl-1", 4, "q-1", "ql-1")]);
    const stage = derive([quote, delivery]);
    expect(stage.stageLabel).toBe("กำลังส่งของ");
    expect(stage.stageHint).toBe("ส่งแล้ว 4 / 10");
    expect(stage.queue).toBe("progress");
    expect(stage.phase).toBe("deliver");
  });

  it("lets a sent delivery note win over delivery progress", () => {
    const quote = doc("q-1", "quotation", "sent", [line("ql-1", 10, null, null)]);
    const delivery = doc("dn-1", "delivery_note", "sent", [line("dl-1", 4, "q-1", "ql-1")]);
    const stage = derive([quote, delivery]);
    expect(stage.stageLabel).toBe("รอออกใบแจ้งหนี้");
    expect(stage.phase).toBe("invoice");
  });

  it("reads a sent invoice as waiting to bill, in the collect phase", () => {
    const stage = derive([doc("inv-1", "invoice", "sent")]);
    expect(stage.stageLabel).toBe("รอวางบิล");
    expect(stage.queue).toBe("progress");
    expect(stage.phase).toBe("collect");
  });

  it("applies a manual stage to the home-facing label but not the phase", () => {
    const stage = derive([doc("q-1", "quotation", "draft")], {
      manualStage: "wait_collect",
    });
    expect(stage.stageLabel).toBe("รอรับเงิน");
    expect(stage.stageHint).toBe("ตั้งค่าสถานะเอง");
    expect(stage.queue).toBe("wait_collect");
    expect(stage.phase).toBe("quote");
    expect(stage.isManual).toBe(true);
  });

  it("does not mark steps skipped on a brand-new deal with no documents", () => {
    const stage = derive([]);
    expect(stage.phase).toBe("quote");
    expect(stage.skipped).toEqual([]);
  });

  it("reports the phases a quote-less, delivery-less deal skipped", () => {
    const stage = derive([doc("inv-1", "invoice", "sent")]);
    expect(stage.skipped).toEqual(["quote", "deliver"]);
  });

  it("does not call delivery skipped while only a quotation exists", () => {
    const stage = derive([doc("q-1", "quotation", "draft")]);
    expect(stage.skipped).toEqual([]);
  });

  it("keeps skipped phases factual on a done deal", () => {
    const stage = derive([doc("inv-1", "invoice", "paid")], { isDone: true });
    expect(stage.phase).toBe("done");
    expect(stage.skipped).toEqual(["quote", "deliver"]);
  });

  it("names the empty deal instead of claiming step 1 is in progress", () => {
    const stage = derive([]);
    expect(stage.stageLabel).toBe("ยังไม่มีเอกสาร");
    expect(stage.phase).toBe("quote");
    expect(stage.skipped).toEqual([]);
    expect(stage.isManual).toBe(false);
  });

  it("labels a draft credit note and skips the untouched phases", () => {
    const stage = derive([doc("cn-1", "credit_note", "draft")]);
    expect(stage.stageLabel).toBe("รอส่งใบลดหนี้");
    expect(stage.queue).toBe("wait_send");
    expect(stage.phase).toBe("collect");
    expect(stage.skipped).toEqual(["quote", "deliver", "invoice"]);
  });

  it("labels a draft debit note and skips the untouched phases", () => {
    const stage = derive([doc("dn-1", "debit_note", "draft")]);
    expect(stage.stageLabel).toBe("รอส่งใบเพิ่มหนี้");
    expect(stage.queue).toBe("wait_send");
    expect(stage.phase).toBe("collect");
    expect(stage.skipped).toEqual(["quote", "deliver", "invoice"]);
  });
});

describe("deal lifecycle steps", () => {
  it("marks the derived phase as the only current step", () => {
    const steps = getDealLifecycleSteps("quote");
    expect(steps.map((step) => step.state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
  });

  it("marks earlier steps done and later steps todo", () => {
    const steps = getDealLifecycleSteps("collect");
    expect(steps.map((step) => step.phase)).toEqual(DEAL_PHASE_ORDER);
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done", "current", "todo"]);
  });

  it("renders skipped steps as skipped, not current or done", () => {
    const steps = getDealLifecycleSteps("invoice", ["quote", "deliver"]);
    expect(steps.map((step) => step.state)).toEqual([
      "skipped",
      "skipped",
      "current",
      "todo",
      "todo",
    ]);
  });

  it("keeps skipped steps visible on a completed deal", () => {
    const steps = getDealLifecycleSteps("done", ["quote", "deliver"]);
    expect(steps.map((step) => step.state)).toEqual(["skipped", "skipped", "done", "done", "done"]);
  });

  it("uses the shared phase labels", () => {
    const steps = getDealLifecycleSteps("invoice");
    expect(steps.map((step) => step.label)).toEqual(
      DEAL_PHASE_ORDER.map((phase) => DEAL_PHASE_LABELS[phase]),
    );
  });
});
