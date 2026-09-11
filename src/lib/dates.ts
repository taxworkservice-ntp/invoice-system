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
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
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

export function formatBuddhistDate(isoDate: string): string {
  const { day, month, year } = bangkokParts(isoDate);
  return `${day} ${THAI_MONTHS_ABBR[month - 1]} ${toBuddhistYear(year)}`;
}

/** Month picker label: "2026-09" → "ก.ย. 2569". Falls back to input. */
export function formatBuddhistMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  const month = parseInt(m, 10);
  const year = parseInt(y, 10);
  if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) return yearMonth;
  return `${THAI_MONTHS_ABBR[month - 1]} ${toBuddhistYear(year)}`;
}

export function formatBuddhistDateTime(isoDate: string): string {
  const { date, time } = formatBuddhistDateTimeParts(isoDate);
  return `${date} เวลา ${time}`;
}

export function formatBuddhistDateTimeParts(isoDate: string): { date: string; time: string } {
  const { day, month, year } = bangkokParts(isoDate);
  return {
    date: `${day} ${THAI_MONTHS_ABBR[month - 1]} ${toBuddhistYear(year)}`,
    time: formatBangkokTime(isoDate),
  };
}

export function formatBuddhistDateFull(isoDate: string): string {
  const { day, month, year } = bangkokParts(isoDate);
  return `${day} ${THAI_MONTHS_FULL[month - 1]} ${toBuddhistYear(year)}`;
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
