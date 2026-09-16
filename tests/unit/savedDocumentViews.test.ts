import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteView,
  matchesSavedViewFilters,
  parseSavedViews,
  readSavedViews,
  saveView,
  serializeSavedViews,
} from "../../src/lib/savedDocumentViews";
import { EMPTY_FILTERS } from "../../src/lib/documentFilters";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("parseSavedViews", () => {
  it("round-trips a serialized list", () => {
    const views = [{ id: "1", name: "ค้างชำระ", filters: { status: "overdue" }, createdAt: "2026-09-16T00:00:00.000Z" }];
    expect(parseSavedViews(serializeSavedViews(views))).toEqual(views);
  });

  it("degrades bad JSON to an empty list", () => {
    expect(parseSavedViews("{not json")).toEqual([]);
    expect(parseSavedViews(null)).toEqual([]);
    expect(parseSavedViews('{"a":1}')).toEqual([]);
  });

  it("drops malformed entries", () => {
    const raw = JSON.stringify([{ id: "1", name: "ok" }, { id: 2 }, null]);
    expect(parseSavedViews(raw)).toHaveLength(1);
  });
});

describe("saved view storage", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { localStorage: memoryStorage() };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("saves, reads, replaces by name and deletes", () => {
    expect(readSavedViews("ws-1")).toEqual([]);

    saveView("ws-1", "ค้างชำระ", { ...EMPTY_FILTERS, status: "overdue" });
    saveView("ws-1", "ใหญ่", { ...EMPTY_FILTERS, amountMin: 100000 });
    let views = readSavedViews("ws-1");
    expect(views.map((v) => v.name)).toEqual(["ใหญ่", "ค้างชำระ"]);

    // Saving the same name replaces instead of duplicating.
    saveView("ws-1", "ค้างชำระ", { ...EMPTY_FILTERS, aging: "90+" });
    views = readSavedViews("ws-1");
    expect(views.filter((v) => v.name === "ค้างชำระ")).toHaveLength(1);
    expect(views.find((v) => v.name === "ค้างชำระ")?.filters.aging).toBe("90+");

    views = deleteView("ws-1", views[0].id);
    expect(views).toHaveLength(1);
  });

  it("keeps workspaces isolated", () => {
    saveView("ws-1", "one", EMPTY_FILTERS);
    expect(readSavedViews("ws-2")).toEqual([]);
  });

  it("ignores an empty name", () => {
    saveView("ws-1", "   ", EMPTY_FILTERS);
    expect(readSavedViews("ws-1")).toEqual([]);
  });
});

describe("matchesSavedViewFilters", () => {
  it("compares against defaults for missing keys", () => {
    expect(matchesSavedViewFilters({ status: "overdue" }, { ...EMPTY_FILTERS, status: "overdue" })).toBe(true);
    expect(matchesSavedViewFilters({ status: "overdue" }, { ...EMPTY_FILTERS, status: "paid" })).toBe(false);
  });
});
