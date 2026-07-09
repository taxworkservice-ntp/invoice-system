import type { ClientProfile } from "../types";

export function localTodayString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
