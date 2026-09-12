// Typed pay items — HumanSoft-inspired income taxonomy, scoped to our niche.
// Today additions/deductions are free-text; typing them lets payroll reports,
// recurring templates, and future bank/SSO exports group correctly without
// forcing users through a full HRMS chart of accounts.

export type PayItemKind =
  | "allowance"   // เบี้ยเลี้ยง / ค่าตำแหน่ง / เงินเพิ่มทั่วไป
  | "overtime"    // ค่าล่วงเวลา (manual top-up outside OT entries)
  | "bonus"       // โบนัส / เงินพิเศษงวดนี้
  | "commission"  // ค่าคอมมิชชั่น
  | "advance"     // เบิกเงินล่วงหน้า (หักคืน)
  | "loan"        // เงินกู้ / ค่างวด (ผ่อนเป็นงวด)
  | "fund"        // กองทุนสำรองเลี้ยงชีพ / กยศ. / ประกัน
  | "welfare"     // สวัสดิการหัก (อาหาร, หอพัก, ชุด)
  | "other";      // อื่นๆ (free text fallback)

export type PayItemDirection = "addition" | "deduction";

export interface PayItemKindMeta {
  kind: PayItemKind;
  label: string;
  direction: PayItemDirection;
  hint: string;
}

export const PAY_ITEM_KINDS: PayItemKindMeta[] = [
  { kind: "allowance", label: "เบี้ยเลี้ยง/เงินเพิ่ม", direction: "addition", hint: "ค่าตำแหน่ง, ค่าเดินทาง, ค่าอาหาร" },
  { kind: "overtime", label: "OT เหมาจ่าย", direction: "addition", hint: "OT เรทคงที่ ไม่ผ่านสูตรชั่วโมง" },
  { kind: "bonus", label: "โบนัส/เงินพิเศษ", direction: "addition", hint: "จ่ายครั้งเดียวงวดนี้" },
  { kind: "commission", label: "คอมมิชชั่น", direction: "addition", hint: "ตามยอดขาย/ผลงาน" },
  { kind: "advance", label: "เบิกล่วงหน้า", direction: "deduction", hint: "หักคืนเงินที่เบิกล่วงหน้า" },
  { kind: "loan", label: "เงินกู้/ค่างวด", direction: "deduction", hint: "ผ่อนชำระเป็นงวด" },
  { kind: "fund", label: "กองทุน/กยศ.", direction: "deduction", hint: "สำรองเลี้ยงชีพ, กยศ." },
  { kind: "welfare", label: "สวัสดิการหัก", direction: "deduction", hint: "อาหาร, หอพัก, ชุดพนักงาน" },
  { kind: "other", label: "อื่นๆ", direction: "deduction", hint: "ระบุเอง" },
];

const KIND_BY_VALUE = new Map(PAY_ITEM_KINDS.map((k) => [k.kind, k]));

export function payItemKindMeta(kind: string | null | undefined): PayItemKindMeta | null {
  if (!kind) return null;
  return KIND_BY_VALUE.get(kind as PayItemKind) ?? null;
}

/** Labels that behave as employee advances (for future credit-limit checks). */
export function isAdvanceLike(label: string, kind?: string | null): boolean {
  if (kind === "advance" || kind === "loan") return true;
  return /เบิก|ล่วงหน้า|advance/i.test(label.trim());
}

/** Labels that behave as fund/student-loan deductions. */
export function isFundLike(label: string, kind?: string | null): boolean {
  if (kind === "fund") return true;
  return /กยศ|กองทุน|สำรอง/i.test(label.trim());
}

/** Validate a typed pay row — returns Thai error or null when valid. */
export function validatePayItem(label: string, amount: number): string | null {
  if (!label.trim()) return "กรุณากรอกชื่อรายการ";
  if (!Number.isFinite(amount) || amount < 0) return "จำนวนเงินต้องไม่ติดลบ";
  return null;
}

/** Group totals by kind for summary rows / future exports. */
export function totalsByKind(items: { label: string; amount: number; kind?: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const key = (it.kind || "other") as string;
    out[key] = (out[key] || 0) + (Number(it.amount) || 0);
  }
  return out;
}
