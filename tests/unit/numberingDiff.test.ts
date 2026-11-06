import { describe, expect, it } from "vitest";
import {
  buildNumberingDiff,
  hasNumberingChanges,
  type NumberingDraft,
} from "../../src/lib/numberingDiff";

const draft = (overrides: Partial<NumberingDraft> = {}): NumberingDraft => ({
  doc_type: "invoice",
  prefix: "INV",
  reset_yearly: true,
  start_sequence: 1,
  ...overrides,
});

describe("buildNumberingDiff", () => {
  it("returns nothing when the settings are unchanged", () => {
    const before = { invoice: draft() };
    expect(buildNumberingDiff(before, { invoice: draft() })).toEqual([]);
    expect(hasNumberingChanges([])).toBe(false);
  });

  it("reports a prefix change with old and new values", () => {
    const diff = buildNumberingDiff({ invoice: draft() }, { invoice: draft({ prefix: "INV2" }) });
    expect(diff).toHaveLength(1);
    expect(diff[0].label).toBe("ใบแจ้งหนี้");
    expect(diff[0].changes).toEqual([
      { field: "prefix", label: "Prefix", before: "INV", after: "INV2" },
    ]);
  });

  it("reports reset and start changes separately", () => {
    const diff = buildNumberingDiff(
      { invoice: draft() },
      { invoice: draft({ reset_yearly: false, start_sequence: 25 }) },
    );
    expect(diff[0].changes.map((change) => change.field)).toEqual([
      "reset_yearly",
      "start_sequence",
    ]);
    expect(diff[0].changes[0].before).toBe("ทุกเดือน");
    expect(diff[0].changes[0].after).toBe("ไม่รีเซ็ต");
    expect(diff[0].changes[1].before).toBe("1");
    expect(diff[0].changes[1].after).toBe("25");
  });

  it("trims whitespace before comparing prefixes", () => {
    const diff = buildNumberingDiff(
      { invoice: draft({ prefix: "INV" }) },
      { invoice: draft({ prefix: "  INV  " }) },
    );
    expect(diff).toEqual([]);
  });
});
