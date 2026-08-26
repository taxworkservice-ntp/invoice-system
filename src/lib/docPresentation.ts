import type { Document } from "../types";

/**
 * Amount shown as the headline figure for a document on list/detail pages.
 * Delivery notes carry no VAT net, so their gross total is displayed.
 */
export function getDisplayAmount(doc: Pick<Document, "doc_type" | "total_amount" | "net_payable">): number {
  return doc.doc_type === "delivery_note" ? doc.total_amount : doc.net_payable;
}

/**
 * Amount surfaced on the deal page. Quotes and other billing docs show their
 * gross total; collection docs show the net payable.
 */
export function getDealDocumentAmount(doc: Pick<Document, "doc_type" | "total_amount" | "net_payable">): number {
  if (["quotation", "invoice", "tax_invoice_receipt", "delivery_note"].includes(doc.doc_type)) {
    return doc.total_amount;
  }
  return doc.net_payable;
}

export function isOverdueDocument(doc: Pick<Document, "status" | "doc_type" | "due_date">): boolean {
  if (doc.status === "overdue") return true;
  if (doc.doc_type !== "billing_note" || !doc.due_date) return false;
  return (
    new Date(doc.due_date) < new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())) &&
    doc.status !== "paid" &&
    doc.status !== "partially_paid"
  );
}

export function getDocStage(doc: Pick<Document, "status" | "doc_type">): "quote" | "invoice" | "collect" | "done" {
  if (doc.status === "voided" || doc.status === "converted") return "done";
  if (doc.doc_type === "quotation") return "quote";
  if (doc.doc_type === "tax_invoice_receipt") return "done";
  if (doc.doc_type === "invoice" && doc.status !== "paid" && doc.status !== "partially_paid") return "invoice";
  if (doc.doc_type === "billing_note" && doc.status !== "paid" && doc.status !== "partially_paid") return "collect";
  if (doc.status === "paid" || doc.status === "generated") return "done";
  if (doc.status === "partially_paid") return "collect";
  if (doc.doc_type === "delivery_note") return "invoice";
  if (doc.doc_type === "receipt") return doc.status === "draft" ? "collect" : "done";
  if (doc.doc_type === "credit_note") {
    if (doc.status === "draft") return "collect";
    return "done";
  }
  return "invoice";
}

export function isUtilityLineItem(line: { line_note?: string | null } | null | undefined): boolean {
  return Boolean(line && (line.line_note || "").includes("[USAGE_BILL]"));
}

export function buildDocumentStatusMessage(doc: Document): string {
  const isPaid = doc.status === "paid" || doc.status === "generated" || doc.status === "issued";
  const isPartiallyPaid = doc.status === "partially_paid";
  const isVoided = doc.status === "voided";
  const isConverted = doc.status === "converted";
  const isOverdue = isOverdueDocument(doc);

  if (isVoided) return "ยกเลิกแล้ว เก็บไว้เป็นประวัติ";
  if (doc.doc_type === "delivery_note" && isConverted) {
    return "ออกบิลแล้ว ใบส่งของนี้ถูกใช้สร้างใบแจ้งหนี้แล้ว";
  }
  if (doc.doc_type === "delivery_note" && doc.status === "sent") {
    return "ส่งของแล้ว / รอออกบิล เอกสารถูกล็อกหลังยืนยันส่งของแล้ว";
  }
  if (isPaid) return "ปิดงานแล้วและมีข้อมูลรับเงินครบ";
  if (isPartiallyPaid) return "ชำระบางส่วน ยังเหลือยอดค้างชำระ";
  if (isOverdue) return "เกินกำหนดแล้ว ควรติดตามการชำระ";
  if (doc.status === "sent" || doc.status === "issued") return "เอกสารถูกส่งแล้ว รอดำเนินการขั้นถัดไป";
  return "ฉบับร่าง ตรวจสอบและส่งเมื่อพร้อม";
}
