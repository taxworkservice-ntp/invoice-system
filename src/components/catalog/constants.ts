export const UNIT_OPTIONS = [
  "ชิ้น",
  "อัน",
  "กล่อง",
  "ลัง",
  "รีม",
  "แผ่น",
  "ชุด",
  "กิโลกรัม",
  "ลิตร",
  "ชั่วโมง",
  "วัน",
  "งาน",
  "โครงการ",
];

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  manual_in: "รับสินค้าเข้า",
  auto_out: "ตัดสต็อก (เอกสาร)",
  manual_out: "ตัดสต็อกด้วยตนเอง",
  auto_in: "คืนสต็อก (ยกเลิกเอกสาร)",
  return_in: "คืนสต็อกจากการยกเลิก",
};

export const MOVEMENT_TYPE_ICONS: Record<string, string> = {
  manual_in: "↑",
  auto_out: "↓",
  manual_out: "↓",
  auto_in: "↑",
  return_in: "↑",
};
