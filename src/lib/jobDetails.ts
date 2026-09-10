import type { ItemJobDetailField, JobDetailFieldType, JobDetailPresetField } from "../types";

export interface JobDetailFieldConfig {
  field_key: JobDetailPresetField;
  label: string;
  placeholder: string;
  field_type: JobDetailFieldType;
  sort_order: number;
  is_enabled: boolean;
  is_custom: boolean;
  default_unit?: string | null;
}

export const DEFAULT_JOB_DETAIL_FIELDS: JobDetailFieldConfig[] = [
  {
    field_key: "color",
    label: "สี / ฟอยล์",
    placeholder: "",
    field_type: "text",
    sort_order: 0,
    is_enabled: true,
    is_custom: false,
  },
  {
    field_key: "size",
    label: "ขนาดใบพิมพ์ กว้าง x ยาว",
    placeholder: "",
    field_type: "dimension",
    sort_order: 1,
    is_enabled: true,
    is_custom: false,
    default_unit: "มม.",
  },
  {
    field_key: "position",
    label: "ตำแหน่ง",
    placeholder: "",
    field_type: "text",
    sort_order: 2,
    is_enabled: true,
    is_custom: false,
  },
  {
    field_key: "material",
    label: "วัสดุ",
    placeholder: "",
    field_type: "text",
    sort_order: 3,
    is_enabled: true,
    is_custom: false,
  },
  {
    field_key: "remark",
    label: "หมายเหตุ",
    placeholder: "",
    field_type: "text",
    sort_order: 4,
    is_enabled: true,
    is_custom: false,
  },
];

export function normalizeJobDetailFields(fields?: ItemJobDetailField[] | null): JobDetailFieldConfig[] {
  if (!fields || fields.length === 0) {
    return DEFAULT_JOB_DETAIL_FIELDS.map((field) => ({ ...field }));
  }

  const defaultsByKey = new Map(DEFAULT_JOB_DETAIL_FIELDS.map((field) => [field.field_key, field]));
  return fields
    .map((field) => {
      const defaultField = defaultsByKey.get(field.field_key);
      return {
        field_key: field.field_key,
        label: field.label || defaultField?.label || "รายละเอียด",
        placeholder: defaultField?.placeholder || "",
        field_type: field.field_type,
        sort_order: field.sort_order,
        is_enabled: field.is_enabled,
        is_custom: field.is_custom,
        default_unit: field.default_unit ?? defaultField?.default_unit ?? null,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function createCustomJobDetailField(label = "", fieldType: JobDetailFieldType = "text"): JobDetailFieldConfig {
  return {
    field_key: `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    label,
    placeholder: "",
    field_type: fieldType,
    sort_order: DEFAULT_JOB_DETAIL_FIELDS.length,
    is_enabled: true,
    is_custom: true,
    default_unit: fieldType === "dimension" ? "มม." : null,
  };
}

export function getJobDetailFieldLabel(fields: JobDetailFieldConfig[], fieldKey: JobDetailPresetField) {
  return fields.find((field) => field.field_key === fieldKey)?.label || "รายละเอียด";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Self-heal for legacy/hand-typed job-detail notes: when a note has NO line
 * breaks but packs 2+ known "Label:" fields onto one line, re-split it so
 * each field prints on its own line. Notes that already contain breaks, match
 * fewer than 2 labels, or get no labels pass through untouched — the user
 * always sees the result in the note field before saving.
 */
export function normalizeJobDetailsNote(
  note: string | null | undefined,
  labels: string[],
): string {
  const text = String(note || "");
  if (!text || text.includes("\n")) return text;
  const candidates = [...new Set(labels.map((l) => l.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (candidates.length === 0) return text;
  const pattern = new RegExp(`(${candidates.map(escapeRegExp).join("|")}):`, "g");
  const hits: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) hits.push(m.index);
  if (hits.length < 2) return text;
  let out = "";
  let last = 0;
  for (const idx of hits) {
    if (idx === 0) continue;
    out += `${text.slice(last, idx).trimEnd()}\n`;
    last = idx;
  }
  return `${out}${text.slice(last)}`.trim();
}
