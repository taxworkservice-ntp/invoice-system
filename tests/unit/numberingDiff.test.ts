import { describe, expect, it } from "vitest";
import {
  buildAdminNumberingDiff,
  buildNumberingDiff,
  hasNumberingChanges,
  type AdminNumberingDraft,
  type NumberingDraft,
} from "../../src/lib/numberingDiff";

const draft = (overrides: Partial<NumberingDraft> = {}): NumberingDraft => ({
  doc_type: "invoice",
  prefix: "INV",
  start_sequence: 1,
  ...overrides,
});

const adminDraft = (overrides: Partial<AdminNumberingDraft> = {}): AdminNumberingDraft => ({
  doc_type: "invoice",
  format_preset: "year_month",
  seq_padding: 4,
  reset_period: "monthly",
  ...overrides,
});

describe("buildNumberingDiff", () => {
  it("returns nothing when the owner settings are unchanged", () => {
    const before = { invoice: draft() };
    expect(buildNumberingDiff(before, { invoice: draft() })).toEqual([]);
    expect(hasNumberingChanges([])).toBe(false);
  });

  it("reports a prefix change with old and new values", () => {
    const diff = buildNumberingDiff(
      { invoice: draft() },
      { invoice: draft({ prefix: "INV2" }) },
    );
    expect(diff).toHaveLength(1);
    expect(diff[0].label).toBe("ใบแจ้งหนี้");
    expect(diff[0].changes).toEqual([
      { field: "prefix", label: "Prefix", before: "INV", after: "INV2" },
    ]);
  });

  it("reports a start change", () => {
    const diff = buildNumberingDiff(
      { invoice: draft() },
      { invoice: draft({ start_sequence: 25 }) },
    );
    expect(diff[0].changes).toEqual([
      { field: "start_sequence", label: "Start at", before: "1", after: "25" },
    ]);
  });

  it("trims whitespace before comparing prefixes", () => {
    const diff = buildNumberingDiff(
      { invoice: draft({ prefix: "INV" }) },
      { invoice: draft({ prefix: "  INV  " }) },
    );
    expect(diff).toEqual([]);
  });
});

describe("buildAdminNumberingDiff", () => {
  it("reports format, padding and reset changes", () => {
    const diff = buildAdminNumberingDiff(
      { invoice: adminDraft() },
      {
        invoice: adminDraft({
          format_preset: "running",
          seq_padding: 3,
          reset_period: "never",
        }),
      },
    );
    expect(diff).toHaveLength(1);
    expect(diff[0].changes.map((change) => change.field)).toEqual([
      "format_preset",
      "seq_padding",
      "reset_period",
    ]);
    expect(diff[0].changes[0].after).toBe("ลำดับอย่างเดียว");
    expect(diff[0].changes[1].after).toBe("3");
    expect(diff[0].changes[2].after).toBe("ไม่รีเซ็ต");
  });

  it("returns nothing when the admin format is unchanged", () => {
    expect(
      buildAdminNumberingDiff({ invoice: adminDraft() }, { invoice: adminDraft() }),
    ).toEqual([]);
  });
});
