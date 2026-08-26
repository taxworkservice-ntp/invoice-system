import type { ClientProfile } from "../types";

export function localTodayString(date = new Date()): string {
  // "Today" is always Thai (Bangkok) time, regardless of device timezone.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);
}

export function businessTodayString(clientProfile?: ClientProfile | null): string {
  if (clientProfile?.dev_mode_enabled && clientProfile.dev_effective_date) {
    return clientProfile.dev_effective_date;
  }
  return localTodayString();
}

export function addDaysString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localTodayString(date);
}

export function monthStartString(dateString = localTodayString()): string {
  return `${dateString.slice(0, 7)}-01`;
}
