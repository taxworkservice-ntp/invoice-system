/**
 * Admin "view as client" session override.
 *
 * A workspace id kept in sessionStorage (tab-scoped, cleared on logout).
 * While set — and only for admin sessions — useAuth resolves the profile as
 * that workspace with owner-equivalent rights. Reversible, no DB or auth
 * changes, never visible to non-admin sessions.
 */

export const VIEW_AS_STORAGE_KEY = "taxwork:admin-view-as";

export interface ViewAsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): ViewAsStorage | null {
  if (typeof window !== "undefined" && window.sessionStorage) {
    return window.sessionStorage;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validated workspace id, or null when absent/invalid/unavailable. */
export function getViewAsWorkspaceId(
  storage: ViewAsStorage | null = defaultStorage(),
): string | null {
  try {
    const raw = storage?.getItem(VIEW_AS_STORAGE_KEY) ?? null;
    return raw && UUID_RE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setViewAsWorkspaceId(
  id: string,
  storage: ViewAsStorage | null = defaultStorage(),
): void {
  if (!UUID_RE.test(id)) return;
  try {
    storage?.setItem(VIEW_AS_STORAGE_KEY, id);
  } catch {
    // storage unavailable (private mode) — impersonation simply won't persist
  }
}

export function clearViewAsWorkspaceId(storage: ViewAsStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(VIEW_AS_STORAGE_KEY);
  } catch {
    // ignore
  }
}
