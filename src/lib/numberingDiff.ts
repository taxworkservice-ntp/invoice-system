import { DOC_TYPE_LABELS } from "../constants";
import type { DocumentType } from "../types";

export interface NumberingDraft {
  doc_type: DocumentType;
  prefix: string;
  reset_yearly: boolean;
  start_sequence: number;
}

export interface NumberingFieldChange {
  field: "prefix" | "reset_yearly" | "start_sequence";
  label: string;
  before: string;
  after: string;
}

export interface NumberingChange {
  docType: DocumentType;
  label: string;
  changes: NumberingFieldChange[];
}

const DOC_ORDER: DocumentType[] = [
  "quotation",
  "invoice",
  "billing_note",
  "receipt",
  "delivery_note",
  "credit_note",
  "debit_note",
];

export function toNumberingDraft(row: {
  doc_type: DocumentType;
  prefix: string;
  reset_yearly: boolean;
  start_sequence: number;
}): NumberingDraft {
  return {
    doc_type: row.doc_type,
    prefix: row.prefix,
    reset_yearly: row.reset_yearly,
    start_sequence: row.start_sequence,
  };
}

export function buildNumberingDiff(
  baseline: Partial<Record<DocumentType, NumberingDraft>>,
  next: Partial<Record<DocumentType, NumberingDraft>>,
): NumberingChange[] {
  const changes: NumberingChange[] = [];
  for (const docType of DOC_ORDER) {
    const before = baseline[docType];
    const after = next[docType];
    if (!before || !after) continue;
    const fields: NumberingFieldChange[] = [];
    const beforePrefix = before.prefix.trim();
    const afterPrefix = after.prefix.trim();
    if (beforePrefix !== afterPrefix) {
      fields.push({
        field: "prefix",
        label: "Prefix",
        before: beforePrefix || "—",
        after: afterPrefix || "—",
      });
    }
    if (before.reset_yearly !== after.reset_yearly) {
      fields.push({
        field: "reset_yearly",
        label: "รีเซ็ตเลขรัน",
        before: before.reset_yearly ? "ทุกเดือน" : "ไม่รีเซ็ต",
        after: after.reset_yearly ? "ทุกเดือน" : "ไม่รีเซ็ต",
      });
    }
    if (before.start_sequence !== after.start_sequence) {
      fields.push({
        field: "start_sequence",
        label: "Start at",
        before: String(before.start_sequence),
        after: String(after.start_sequence),
      });
    }
    if (fields.length > 0) {
      changes.push({
        docType,
        label: DOC_TYPE_LABELS[docType].th,
        changes: fields,
      });
    }
  }
  return changes;
}

export function hasNumberingChanges(changes: NumberingChange[]): boolean {
  return changes.length > 0;
}
