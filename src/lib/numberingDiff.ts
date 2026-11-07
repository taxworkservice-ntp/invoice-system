import { DOC_TYPE_LABELS } from "../constants";
import type { DocNumberSequence, DocumentType } from "../types";
import { RESET_LABELS, formatOption } from "./docNumberFormat";

export interface NumberingDraft {
  doc_type: DocumentType;
  prefix: string;
  start_sequence: number;
}

export interface AdminNumberingDraft {
  doc_type: DocumentType;
  format_preset: string;
  seq_padding: number;
  reset_period: string;
}

export type NumberingChangeField =
  "prefix" | "start_sequence" | "format_preset" | "seq_padding" | "reset_period";

export interface NumberingFieldChange {
  field: NumberingChangeField;
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
  start_sequence: number;
}): NumberingDraft {
  return {
    doc_type: row.doc_type,
    prefix: row.prefix,
    start_sequence: row.start_sequence,
  };
}

export function toAdminNumberingDraft(
  row: Pick<DocNumberSequence, "doc_type" | "format_preset" | "seq_padding" | "reset_period">,
): AdminNumberingDraft {
  return {
    doc_type: row.doc_type,
    format_preset: row.format_preset,
    seq_padding: row.seq_padding,
    reset_period: row.reset_period,
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
    if (before.start_sequence !== after.start_sequence) {
      fields.push({
        field: "start_sequence",
        label: "Start at",
        before: String(before.start_sequence),
        after: String(after.start_sequence),
      });
    }
    if (fields.length > 0) {
      changes.push({ docType, label: DOC_TYPE_LABELS[docType].th, changes: fields });
    }
  }
  return changes;
}

export function buildAdminNumberingDiff(
  baseline: Partial<Record<DocumentType, AdminNumberingDraft>>,
  next: Partial<Record<DocumentType, AdminNumberingDraft>>,
): NumberingChange[] {
  const changes: NumberingChange[] = [];
  for (const docType of DOC_ORDER) {
    const before = baseline[docType];
    const after = next[docType];
    if (!before || !after) continue;
    const fields: NumberingFieldChange[] = [];
    if (before.format_preset !== after.format_preset) {
      fields.push({
        field: "format_preset",
        label: "รูปแบบ",
        before: formatOption(before.format_preset)?.label ?? before.format_preset,
        after: formatOption(after.format_preset)?.label ?? after.format_preset,
      });
    }
    if (before.seq_padding !== after.seq_padding) {
      fields.push({
        field: "seq_padding",
        label: "จำนวนหลัก",
        before: String(before.seq_padding),
        after: String(after.seq_padding),
      });
    }
    if (before.reset_period !== after.reset_period) {
      fields.push({
        field: "reset_period",
        label: "รีเซ็ต",
        before:
          RESET_LABELS[before.reset_period as keyof typeof RESET_LABELS] ?? before.reset_period,
        after: RESET_LABELS[after.reset_period as keyof typeof RESET_LABELS] ?? after.reset_period,
      });
    }
    if (fields.length > 0) {
      changes.push({ docType, label: DOC_TYPE_LABELS[docType].th, changes: fields });
    }
  }
  return changes;
}

export function hasNumberingChanges(changes: NumberingChange[]): boolean {
  return changes.length > 0;
}
