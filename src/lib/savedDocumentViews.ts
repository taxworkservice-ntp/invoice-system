import { EMPTY_FILTERS, type DocumentFilters } from "./documentFilters";

export interface SavedDocumentView {
  id: string;
  name: string;
  filters: Partial<DocumentFilters>;
  createdAt: string;
}

const STORAGE_KEY = "invoice-system.document-views";
export const MAX_SAVED_VIEWS = 20;

function storageKey(workspaceId: string | null | undefined): string {
  return `${STORAGE_KEY}:${workspaceId || "anonymous"}`;
}

/** Tolerant parse — bad JSON or foreign shapes degrade to an empty list. */
export function parseSavedViews(raw: string | null): SavedDocumentView[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedDocumentView => {
      if (!item || typeof item !== "object") return false;
      const view = item as Record<string, unknown>;
      return typeof view.id === "string" && typeof view.name === "string";
    });
  } catch {
    return [];
  }
}

export function serializeSavedViews(views: SavedDocumentView[]): string {
  return JSON.stringify(views);
}

export function readSavedViews(workspaceId: string | null | undefined): SavedDocumentView[] {
  if (typeof window === "undefined") return [];
  return parseSavedViews(window.localStorage.getItem(storageKey(workspaceId)));
}

function write(workspaceId: string | null | undefined, views: SavedDocumentView[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(workspaceId), serializeSavedViews(views));
}

export function matchesSavedViewFilters(
  view: Partial<DocumentFilters>,
  current: DocumentFilters,
): boolean {
  return (Object.keys(EMPTY_FILTERS) as (keyof DocumentFilters)[]).every(
    (key) => (view[key] ?? EMPTY_FILTERS[key]) === current[key],
  );
}

export function saveView(
  workspaceId: string | null | undefined,
  name: string,
  filters: DocumentFilters,
): SavedDocumentView[] {
  const trimmed = name.trim();
  if (!trimmed) return readSavedViews(workspaceId);
  const existing = readSavedViews(workspaceId);
  const next: SavedDocumentView[] = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      filters: { ...filters },
      createdAt: new Date().toISOString(),
    },
    ...existing.filter((view) => view.name !== trimmed),
  ].slice(0, MAX_SAVED_VIEWS);
  write(workspaceId, next);
  return next;
}

export function deleteView(
  workspaceId: string | null | undefined,
  id: string,
): SavedDocumentView[] {
  const next = readSavedViews(workspaceId).filter((view) => view.id !== id);
  write(workspaceId, next);
  return next;
}
