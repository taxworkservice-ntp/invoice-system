// Pure pay-cycle window suggestion utilities.
// All dates are ISO "YYYY-MM-DD" strings handled in UTC to avoid TZ drift.

export type PayFrequency = "monthly" | "semimonthly" | "weekly" | "custom";

export interface PayWindow {
  start: string;
  end: string;
}

function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

function lastDayOfMonth(y: number, m1Based: number): number {
  return new Date(Date.UTC(y, m1Based, 0)).getUTCDate();
}

/**
 * Next pay window following a cycle.
 * - With lastRunEnd: windows chain strictly from the day after it.
 * - Without history: the first window is derived from the reference month when provided,
 *   otherwise from the current calendar month (for weekly/custom, cycles step from the 1st
 *   until covering the reference/today date).
 */
export function suggestNextWindow(
  frequency: PayFrequency,
  opts: { anchorDay?: number; cycleLenDays?: number },
  lastRunEnd?: string | null,
  reference?: { year: number; month: number } | null,
): PayWindow {
  const anchorDay = clamp(Math.round(opts.anchorDay ?? 1), 1, 27);
  const refYm =
    reference && reference.month >= 1 && reference.month <= 12
      ? `${reference.year}-${pad(reference.month)}`
      : todayISO().slice(0, 7);

  if (frequency === "monthly") {
    if (lastRunEnd) {
      const next = nextMonthFirst(lastRunEnd);
      return { start: next, end: monthEndOf(next) };
    }
    const first = `${refYm}-01`;
    return { start: first, end: monthEndOf(first) };
  }

  if (frequency === "semimonthly") {
    if (lastRunEnd) {
      const endDay = Number(lastRunEnd.slice(8, 10));
      if (endDay <= anchorDay) {
        // First window of the month just ended -> second window till month end
        return { start: addDaysISO(lastRunEnd, 1), end: monthEndOf(lastRunEnd) };
      }
      // Second window ended -> first window of next month: 1 .. anchor
      const ym = nextMonthFirst(lastRunEnd).slice(0, 7);
      return { start: `${ym}-01`, end: `${ym}-${pad(anchorDay)}` };
    }
    // Fresh start within the reference month: first cut-off window [1..anchor]
    return { start: `${refYm}-01`, end: `${refYm}-${pad(anchorDay)}` };
  }

  // weekly / custom: fixed-length chained windows
  const len = frequency === "weekly" ? 7 : clamp(Math.round(opts.cycleLenDays ?? 7), 1, 31);
  if (lastRunEnd) {
    const start = addDaysISO(lastRunEnd, 1);
    return { start, end: addDaysISO(start, len - 1) };
  }
  // No history: seed cycles from the 1st of the reference month until one covers its last day
  const targetEnd = monthEndOf(`${refYm}-15`);
  let start = `${refYm}-01`;
  let win = { start, end: addDaysISO(start, len - 1) };
  let guard = 0;
  while (win.end < targetEnd && guard < 62) {
    start = addDaysISO(win.end, 1);
    win = { start, end: addDaysISO(start, len - 1) };
    guard += 1;
  }
  return win;
}

/** Human-readable Thai range label, e.g. "11–20 ส.ค." or "30 ส.ค.–3 ก.ย." */
export function formatPayRangeLabel(win: PayWindow): string {
  const THAI_MONTHS = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];
  const s = parseISO(win.start);
  const e = parseISO(win.end);
  const sameMonth =
    s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  if (sameMonth) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${THAI_MONTHS[s.getUTCMonth()]}`;
  }
  return `${s.getUTCDate()} ${THAI_MONTHS[s.getUTCMonth()]}–${e.getUTCDate()} ${THAI_MONTHS[e.getUTCMonth()]}`;
}

// ---------- Monthly disbursement plan ----------

export interface MonthPlanSlot {
  batchType: BatchType;
  start: string;
  end: string;
  /** Plain-Thai label, e.g. "เงินเดือนต้นเดือน" or "OT 1–5". */
  label: string;
}

/**
 * The whole month's disbursement plan: salary halves + evenly sliced OT
 * windows. Every slot stays inside the month, so the statutory-month rule
 * (month of period_end) never surprises: planned slots always belong to
 * the month being viewed.
 *
 * OT slicing: sliceLen = round(daysInMonth / otPerMonth), chunks from the
 * 1st, last chunk runs to month end. 6/month in a 30-day month →
 * 1–5, 6–10, 11–15, 16–20, 21–25, 26–30.
 */
export function suggestMonthPlan(
  year: number,
  month: number,
  opts: { frequency?: PayFrequency; anchorDay?: number; otPerMonth?: number } = {},
): MonthPlanSlot[] {
  const frequency = opts.frequency ?? "semimonthly";
  const anchor = clamp(Math.round(opts.anchorDay ?? 15), 1, 27);
  const otPerMonth = Math.max(0, Math.round(opts.otPerMonth ?? 0));
  const ym = `${year}-${pad(month)}`;
  const dim = lastDayOfMonth(year, month);
  const monthEnd = `${ym}-${pad(dim)}`;
  const slots: MonthPlanSlot[] = [];

  if (frequency === "monthly") {
    slots.push({ batchType: "salary", start: `${ym}-01`, end: monthEnd, label: "เงินเดือน" });
  } else if (frequency === "semimonthly") {
    const firstEnd = `${ym}-${pad(Math.min(anchor, dim))}`;
    slots.push({
      batchType: "salary",
      start: `${ym}-01`,
      end: firstEnd,
      label: "เงินเดือนต้นเดือน",
    });
    const secondStart = addDaysISO(firstEnd, 1);
    if (secondStart <= monthEnd) {
      slots.push({
        batchType: "salary",
        start: secondStart,
        end: monthEnd,
        label: "เงินเดือนปลายเดือน",
      });
    }
  }
  // weekly/custom stay ad-hoc: no fixed monthly salary slots.

  if (otPerMonth > 0) {
    const sliceLen = Math.max(1, Math.round(dim / otPerMonth));
    const chunks: { startDay: number; endDay: number }[] = [];
    let startDay = 1;
    while (startDay <= dim) {
      const endDay = Math.min(startDay + sliceLen - 1, dim);
      chunks.push({ startDay, endDay });
      startDay = endDay + 1;
    }
    // Merge a short tail stub backwards so the slot count equals the plan
    // (31-day months at 6/month would otherwise sprout a 7th one-day slot).
    while (chunks.length > otPerMonth && chunks.length > 1) {
      const tail = chunks.pop()!;
      chunks[chunks.length - 1].endDay = tail.endDay;
    }
    for (const chunk of chunks) {
      const start = `${ym}-${pad(chunk.startDay)}`;
      const end = `${ym}-${pad(chunk.endDay)}`;
      slots.push({
        batchType: "ot",
        start,
        end,
        label: `OT ${chunk.startDay}–${chunk.endDay}`,
      });
    }
  }

  return slots;
}

// ---------- Batch types ----------

export type BatchType = "salary" | "ot" | "adjustment";

export const BATCH_TYPE_LABELS: Record<BatchType, string> = {
  salary: "เงินเดือน",
  ot: "OT",
  adjustment: "ปรับปรุง",
};

/**
 * Deterministic salary batches expected per statutory month.
 * Returns null when the cadence has no fixed monthly count
 * (weekly varies 4–5, custom is ad-hoc) — callers then show actuals only.
 */
export function expectedSalaryBatches(frequency: PayFrequency): number | null {
  switch (frequency) {
    case "monthly":
      return 1;
    case "semimonthly":
      return 2;
    default:
      return null;
  }
}

// ---------- helpers ----------

function nextMonthFirst(iso: string): string {
  const d = parseISO(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based
  const ny = m === 11 ? y + 1 : y;
  const nm = m === 11 ? 0 : m + 1;
  return `${ny}-${String(nm + 1).padStart(2, "0")}-01`;
}

function monthEndOf(iso: string): string {
  const d = parseISO(iso);
  const dim = lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
  return `${iso.slice(0, 7)}-${String(dim).padStart(2, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
