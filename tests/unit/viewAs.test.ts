import { describe, expect, it } from "vitest";
import {
  clearViewAsWorkspaceId,
  getViewAsWorkspaceId,
  setViewAsWorkspaceId,
  VIEW_AS_STORAGE_KEY,
  type ViewAsStorage,
} from "../../src/lib/viewAs";

function memStorage(): ViewAsStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

const WS_ID = "11111111-2222-3333-4444-555555555555";

describe("view-as session override", () => {
  it("round-trips a valid workspace id", () => {
    const storage = memStorage();
    expect(getViewAsWorkspaceId(storage)).toBeNull();
    setViewAsWorkspaceId(WS_ID, storage);
    expect(getViewAsWorkspaceId(storage)).toBe(WS_ID);
    expect(storage.dump()[VIEW_AS_STORAGE_KEY]).toBe(WS_ID);
    clearViewAsWorkspaceId(storage);
    expect(getViewAsWorkspaceId(storage)).toBeNull();
  });

  it("rejects non-UUID values on read and write", () => {
    const storage = memStorage();
    setViewAsWorkspaceId("not-a-uuid", storage);
    expect(getViewAsWorkspaceId(storage)).toBeNull();
    expect(storage.dump()).toEqual({});
    storage.setItem(VIEW_AS_STORAGE_KEY, "client-123");
    expect(getViewAsWorkspaceId(storage)).toBeNull();
  });

  it("tolerates unavailable storage", () => {
    expect(getViewAsWorkspaceId(null)).toBeNull();
    expect(() => setViewAsWorkspaceId(WS_ID, null)).not.toThrow();
    expect(() => clearViewAsWorkspaceId(null)).not.toThrow();
    const throwing: ViewAsStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(getViewAsWorkspaceId(throwing)).toBeNull();
    expect(() => setViewAsWorkspaceId(WS_ID, throwing)).not.toThrow();
    expect(() => clearViewAsWorkspaceId(throwing)).not.toThrow();
  });
});
