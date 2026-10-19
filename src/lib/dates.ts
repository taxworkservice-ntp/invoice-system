/** The app renders and interprets every date/time in Thai (Bangkok) time. */
export const APP_TIMEZONE = "Asia/Bangkok";

// Module-singleton Intl formatters — constructing Intl.DateTimeFormat per
// table row is a measurable cost on the home dashboard (100-300 rows), so
// these are created once and reused.
const bangkokPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const bangkokTodayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
});
const bangkokTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Today's date (YYYY-MM-DD) in Bangkok time — uses a cached formatter. */
export function bangkokTodayString(now: Date = new Date()): string {
  return bangkokTodayFormatter.format(now);
}

/** Calendar parts of an instant, in Bangkok time. */
function bangkokParts(iso: string | Date): { day: number; month: number; year: number } {
  const parts = bangkokPartsFormatter.format(new Date(iso));
  const [day, month, year] = parts.split("/").map(Number);
  return { day, month, year };
}

/** HH:MM of an instant, in Bangkok time. */
export function formatBangkokTime(iso: string): string {
  return bangkokTimeFormatter.format(new Date(iso));
}

const THAI_MONTHS_ABBR = [
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

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const BUDDHIST_OFFSET = 543;

export function toBuddhistYear(ceYear: number): number {
  return ceYear + BUDDHIST_OFFSET;
}

export function toBuddhistYearNow(): number {
  return toBuddhistYear(new Date().getFullYear());
}

export function beYear(): number {
  return toBuddhistYearNow();
}

/**
 * Year system a workspace prints in.
 *  - `ce` = ค.ศ. ("2026")
 *  - `be` = พ.ศ. ("2569")
 * One setting per client, applied to every date the client sees — screens and
 * paper alike. It never changes a document number.
 */
export type YearEra = "ce" | "be";

/** Calendar year → the year as written in that era. */
export function toEraYear(year: number, era: YearEra): number {
  return era === "be" ? toBuddhistYear(year) : year;
}

/** A year as written in an era → the Gregorian calendar year (inverse of `toEraYear`). */
export function fromEraYear(year: number, era: YearEra): number {
  return era === "be" ? year - BUDDHIST_OFFSET : year;
}

/** Era-aware abbreviated date: `18 ต.ค. 2569` / `18 ต.ค. 2026`. */
export function formatDocDate(isoDate: string, era: YearEra = "be"): string {
  const { day, month, year } = bangkokParts(isoDate);
  return `${day} ${THAI_MONTHS_ABBR[month - 1]} ${toEraYear(year, era)}`;
}

/** Era-aware full-month date: `18 ตุลาคม 2569` / `18 ตุลาคม 2026`. */
export function formatDocDateFull(isoDate: string, era: YearEra = "be"): string {
  const { day, month, year } = bangkokParts(isoDate);
  return `${day} ${THAI_MONTHS_FULL[month - 1]} ${toEraYear(year, era)}`;
}

/** Era-aware `dd/mm/yyyy` — the paper's numeric style. */
export function formatDocNumericDate(isoDate: string, era: YearEra = "be"): string {
  const { day, month, year } = bangkokParts(isoDate);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(day)}/${pad(month)}/${toEraYear(year, era)}`;
}

/**
 * `dd/mm/yyyy` for printed documents, in the workspace era.
 *
 * The one date formatter the print components use. Empty input prints "-" and
 * unparseable input is echoed verbatim, matching every private print formatter
 * this replaced. Passing the era is required on purpose: paper must never pick
 * a year system itself (see `lib/yearEra.ts`).
 */
export function formatPrintDate(
  date: string | null | undefined,
  era: YearEra,
): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return formatDocNumericDate(date, era);
}

export function formatDocDateTimeParts(
  isoDate: string,
  era: YearEra = "be",
): { date: string; time: string } {
  return { date: formatDocDate(isoDate, era), time: formatBangkokTime(isoDate) };
}

/** @deprecated Use `formatDocDate(value, era)` — kept for older call sites. */
export function formatBuddhistDate(isoDate: string): string {
  return formatDocDate(isoDate, "be");
}

/** Numeric date with Common Era year: "2026-09-15" → "15/09/2026". */
export function formatNumericThaiDate(isoDate: string): string {
  return formatDocNumericDate(isoDate, "ce");
}

/**
 * Whole days from a YYYY-MM-DD date until today (Bangkok), null when empty
 * or invalid. Future dates clamp to 0.
 */
export function daysSinceDate(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return null;
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(start)) return null;
  const todayStr = bangkokTodayString();
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  return Math.max(0, Math.floor((today - start) / 86400000));
}

/** Month picker label: "2026-09" → "ก.ย. 2569". Falls back to input. */
export function formatBuddhistMonth(yearMonth: string): string {
  return formatDocMonth(yearMonth, "be");
}

/** Era-aware month label: "2026-09" → "ก.ย. 2026" / "ก.ย. 2569". */
export function formatDocMonth(yearMonth: string, era: YearEra = "be"): string {
  const [y, m] = yearMonth.split("-");
  const month = parseInt(m, 10);
  const year = parseInt(y, 10);
  if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12)
    return yearMonth;
  return `${THAI_MONTHS_ABBR[month - 1]} ${toEraYear(year, era)}`;
}

export function formatBuddhistDateTime(isoDate: string): string {
  const { date, time } = formatBuddhistDateTimeParts(isoDate);
  return `${date} เวลา ${time}`;
}

/** @deprecated Use `formatDocDateTimeParts(value, era)`. */
export function formatBuddhistDateTimeParts(isoDate: string): { date: string; time: string } {
  return formatDocDateTimeParts(isoDate, "be");
}

/** @deprecated Use `formatDocDateFull(value, era)`. */
export function formatBuddhistDateFull(isoDate: string): string {
  return formatDocDateFull(isoDate, "be");
}

export function relativeTimeThai(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "เมื่อสักครู่";
  if (diff < 3600) return `เมื่อ ${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `เมื่อ ${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  if (diff < 172800) return "เมื่อวานนี้";
  return `เมื่อ ${Math.floor(diff / 86400)} วันที่แล้ว`;
}
