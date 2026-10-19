import { afterEach, describe, expect, it, vi } from "vitest";
import { focusLineInput, moveLine, removeLine } from "../../src/lib/lineDraft";

interface Row {
  id: string;
}

const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));

describe("moveLine", () => {
  it("swaps a line with its neighbour", () => {
    expect(moveLine(rows("a", "b", "c"), "b", "up").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(moveLine(rows("a", "b", "c"), "b", "down").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("returns the SAME array at the edges, so React state setters bail out", () => {
    const list = rows("a", "b", "c");
    expect(moveLine(list, "a", "up")).toBe(list);
    expect(moveLine(list, "c", "down")).toBe(list);
    expect(moveLine(list, "missing", "up")).toBe(list);
  });

  it("does not mutate the input order", () => {
    const list = rows("a", "b");
    moveLine(list, "a", "down");
    expect(list.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("moves section markers like any other line", () => {
    const list = [...rows("a"), { id: "m" }, ...rows("b")];
    expect(moveLine(list, "m", "up").map((r) => r.id)).toEqual(["m", "a", "b"]);
  });
});

describe("removeLine", () => {
  it("drops the line by id", () => {
    expect(removeLine(rows("a", "b", "c"), "b").map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("is a no-op for an unknown id", () => {
    expect(removeLine(rows("a"), "zzz").map((r) => r.id)).toEqual(["a"]);
  });
});

describe("focusLineInput", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("scrolls the row into view and focuses its first input", () => {
    class FakeElement {}
    vi.stubGlobal("HTMLElement", FakeElement);
    const input = Object.assign(new FakeElement(), {
      scrollIntoView: vi.fn(),
      focus: vi.fn(),
    });
    const querySelector = vi.fn(() => input);
    vi.stubGlobal("document", { querySelector });
    vi.stubGlobal("window", { setTimeout: (fn: () => void) => fn() });

    focusLineInput("line-1");

    expect(querySelector).toHaveBeenCalledWith("#dn-line-line-1 input");
    expect(input.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("stays silent when the row is not painted yet", () => {
    class FakeElement {}
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("document", { querySelector: vi.fn(() => null) });
    vi.stubGlobal("window", { setTimeout: (fn: () => void) => fn() });

    expect(() => focusLineInput("line-2")).not.toThrow();
  });
});
