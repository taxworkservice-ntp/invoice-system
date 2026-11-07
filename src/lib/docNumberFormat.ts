import type { DocNumberFormatPreset } from "../types";

export type DocNumberResetPeriod = "never" | "yearly" | "monthly";

export interface DocNumberFormatOption {
  value: DocNumberFormatPreset;
  label: string;
  sample: string;
  defaultReset: DocNumberResetPeriod;
}

export const DOC_NUMBER_FORMATS: DocNumberFormatOption[] = [
  {
    value: "year_month",
    label: "ปี + เดือน + ลำดับ",
    sample: "INV-2569-11-0001",
    defaultReset: "monthly",
  },
  {
    value: "year",
    label: "ปี + ลำดับ",
    sample: "INV-2569-0001",
    defaultReset: "yearly",
  },
  {
    value: "running",
    label: "ลำดับอย่างเดียว",
    sample: "INV-0001",
    defaultReset: "never",
  },
  {
    value: "slash_year_month",
    label: "ปี/เดือน/ลำดับ (สแลช)",
    sample: "INV/2569/11/0001",
    defaultReset: "monthly",
  },
  {
    value: "short_year_month",
    label: "ปี 2 หลัก + เดือน + ลำดับ",
    sample: "INV-69-11-0001",
    defaultReset: "monthly",
  },
];

export const SEQ_PADDING_OPTIONS = [3, 4, 5] as const;

export const RESET_LABELS: Record<DocNumberResetPeriod, string> = {
  never: "ไม่รีเซ็ต",
  yearly: "รีเซ็ตรายปี",
  monthly: "รีเซ็ตรายเดือน",
};

export function formatOption(value: string | null | undefined): DocNumberFormatOption | null {
  return DOC_NUMBER_FORMATS.find((option) => option.value === value) ?? null;
}

export function resetOptionsForFormat(
  value: string | null | undefined,
): DocNumberResetPeriod[] {
  switch (value) {
    case "year":
      return ["yearly", "never"];
    case "running":
      return ["never"];
    case "year_month":
    case "slash_year_month":
    case "short_year_month":
      return ["monthly", "never"];
    default:
      return ["monthly", "yearly", "never"];
  }
}

export function formatDocNumberSample(
  format: DocNumberFormatPreset | string,
  padding: number,
  era: "be" | "ce",
  prefix = "INV",
): string {
  const year = era === "be" ? 2569 : 2026;
  const shortYear = String(year % 100).padStart(2, "0");
  const seq = String(1).padStart(padding, "0");
  switch (format) {
    case "year_month":
      return `${prefix}-${year}-11-${seq}`;
    case "year":
      return `${prefix}-${year}-${seq}`;
    case "running":
      return `${prefix}-${seq}`;
    case "slash_year_month":
      return `${prefix}/${year}/11/${seq}`;
    case "short_year_month":
      return `${prefix}-${shortYear}-11-${seq}`;
    default:
      return `${prefix}-${seq}`;
  }
}

export function eraLabel(era: "be" | "ce"): string {
  return era === "be" ? "พ.ศ." : "ค.ศ.";
}
