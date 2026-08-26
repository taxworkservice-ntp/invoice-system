export const RECEIPT_BACKDATE_REASON_OPTIONS = [
  "รับชำระเงินจริงก่อนวันบันทึก",
  "ได้รับหลักฐานการโอนย้อนหลัง",
  "ลูกค้าส่งสลิปช้า",
  "บันทึกตกหล่นและกลับมาลงย้อนหลัง",
  "รออนุมัติภายในก่อนออกใบเสร็จ",
] as const;

export function todayString() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function isPastDate(value: string, today = todayString()) {
  return Boolean(value) && value < today;
}

export function toLocalMiddayIso(date: string) {
  // Anchor at midday Bangkok time (UTC+7) so the stored instant is the same
  // no matter what timezone the device is in.
  return new Date(`${date}T12:00:00+07:00`).toISOString();
}

export function buildReceiptBackdateFields({
  selectedDate,
  userId,
  reason,
  today,
}: {
  selectedDate: string;
  userId: string;
  reason: string;
  today?: string;
}) {
  if (!isPastDate(selectedDate, today || todayString())) {
    return {
      backdated_at: null,
      backdated_by_user_id: null,
      backdated_reason: null,
    };
  }

  return {
    backdated_at: new Date().toISOString(),
    backdated_by_user_id: userId,
    backdated_reason: reason.trim(),
  };
}

export function composeReceiptBackdateReason(reasonChoice: string, note?: string) {
  const trimmedChoice = reasonChoice.trim();
  const trimmedNote = note?.trim();

  if (!trimmedNote) return trimmedChoice;
  return `${trimmedChoice}\nหมายเหตุเพิ่มเติม: ${trimmedNote}`;
}
