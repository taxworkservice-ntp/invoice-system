import { canSendDocumentType, type WorkspacePermissions } from "./permissions";
import type { Document } from "../types";

export type DocumentActionId =
  | "send"
  | "edit"
  | "delete"
  | "void"
  | "issue_cn"
  | "confirm_receipt"
  | "convert"
  | "billing"
  | "pay"
  | "invoice_from_dn"
  | "copy";

export interface DocumentAction {
  id: DocumentActionId;
  label: string;
  danger?: boolean;
}

const CORRECTION_TYPES = ["credit_note", "debit_note"];

function isDraftLike(doc: Document) {
  return doc.status === "draft";
}

/**
 * Every secondary action available for a document in a menu. Single source of
 * truth for the list overflow menu and the detail page, so permission rules
 * stay identical on both surfaces.
 */
export function getDocumentMenuActions(
  doc: Document,
  permissions: WorkspacePermissions,
): DocumentAction[] {
  const actions: DocumentAction[] = [];
  const seen = new Set<DocumentActionId>();
  const add = (action: DocumentAction) => {
    if (seen.has(action.id)) return;
    seen.add(action.id);
    actions.push(action);
  };

  const canSend = canSendDocumentType(permissions, doc.doc_type);
  const isCorrection = CORRECTION_TYPES.includes(doc.doc_type);

  if (isDraftLike(doc)) {
    if (isCorrection) {
      if (canSend) {
        add({
          id: "issue_cn",
          label: doc.doc_type === "debit_note" ? "ออกใบเพิ่มหนี้" : "ออกใบลดหนี้",
        });
      }
    } else if (doc.doc_type === "receipt") {
      if (permissions.canRecordPayments) {
        add({ id: "confirm_receipt", label: "ยืนยันการรับเงิน" });
      }
    } else if (canSend) {
      add({
        id: "send",
        label:
          doc.doc_type === "delivery_note"
            ? "บันทึกว่าส่งของแล้ว"
            : "ทำเครื่องหมายว่าส่งแล้ว",
      });
    }
    add({ id: "edit", label: "แก้ไข" });
    if (permissions.canDeleteDocuments) add({ id: "delete", label: "ลบ", danger: true });
  }

  if (isCorrection && doc.status === "issued" && permissions.canVoidDocuments) {
    add({ id: "void", label: "ยกเลิก", danger: true });
  }

  if (doc.status === "sent") {
    if (doc.doc_type === "quotation") {
      if (canSend) add({ id: "convert", label: "สร้างใบแจ้งหนี้" });
      if (permissions.canVoidDocuments) add({ id: "void", label: "ยกเลิก", danger: true });
    } else if (doc.doc_type === "invoice") {
      if (permissions.canRecordPayments) {
        add({ id: "billing", label: "สร้างใบวางบิล" });
        add({ id: "pay", label: "บันทึกรับเงิน" });
      }
      if (permissions.canVoidDocuments) add({ id: "void", label: "ยกเลิก", danger: true });
    } else if (doc.doc_type === "billing_note") {
      if (permissions.canRecordPayments) add({ id: "pay", label: "บันทึกรับเงิน" });
      if (permissions.canVoidDocuments) add({ id: "void", label: "ยกเลิก", danger: true });
    } else if (doc.doc_type === "delivery_note") {
      if (canSend) add({ id: "invoice_from_dn", label: "ออกใบแจ้งหนี้จากใบนี้" });
      if (permissions.canVoidDocuments) add({ id: "void", label: "ยกเลิก", danger: true });
    } else if (permissions.canVoidDocuments) {
      add({ id: "void", label: "ยกเลิก", danger: true });
    }
  }

  if (
    doc.status !== "draft" &&
    doc.status !== "voided" &&
    ["invoice", "quotation", "billing_note", "delivery_note"].includes(doc.doc_type)
  ) {
    add({ id: "copy", label: "สร้างฉบับเหมือนเดิม" });
  }

  return actions;
}
