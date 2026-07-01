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
  const date = new Date(isoDate);
  const day = date.getDate();
  const month = THAI_MONTHS_ABBR[date.getMonth()];
  const year = toBuddhistYear(date.getFullYear());
  return `${day} ${month} ${year}`;
}

export function formatBuddhistDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate();
  const month = THAI_MONTHS_ABBR[date.getMonth()];
  const year = toBuddhistYear(date.getFullYear());
  const time = date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} ${month} ${year} ${time}`;
}

export function formatBuddhistDateFull(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate();
  const month = THAI_MONTHS_FULL[date.getMonth()];
  const year = toBuddhistYear(date.getFullYear());
  return `${day} ${month} ${year}`;
}
