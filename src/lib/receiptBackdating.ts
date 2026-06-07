export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function isPastDate(value: string, today = todayString()) {
  return Boolean(value) && value < today;
}

export function toLocalMiddayIso(date: string) {
  return new Date(`${date}T12:00:00`).toISOString();
}

export function buildReceiptBackdateFields({
  selectedDate,
  userId,
  reason,
}: {
  selectedDate: string;
  userId: string;
  reason: string;
}) {
  if (!isPastDate(selectedDate)) {
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
