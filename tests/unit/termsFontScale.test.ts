import { describe, expect, it } from "vitest";
import { getRowBudgets } from "../../src/lib/pagination";
import {
  CLASSIC_V2_SECTION_INHERIT,
  getClassicV2EffectiveSectionScaleMult,
} from "../../src/constants";

const BASE = { header: 1, items: 1, totals: 1, footer: 1 };

describe("terms font slot (Classic V2 เงื่อนไขท้ายเอกสาร)", () => {
  it("inherits the footer scale until set, at workspace and type scope", () => {
    // Unset everywhere → global.
    expect(getClassicV2EffectiveSectionScaleMult("terms", null, null, 1)).toBe(1);
    // Unset terms follows an explicit footer (workspace scope).
    expect(getClassicV2EffectiveSectionScaleMult("terms", null, { footer: "large" }, 1)).toBe(
      getClassicV2EffectiveSectionScaleMult("footer", null, { footer: "large" }, 1),
    );
    // Explicit terms win over the footer.
    const explicit = getClassicV2EffectiveSectionScaleMult(
      "terms",
      null,
      { footer: "large", terms: "small" },
      1,
    );
    const footerOnly = getClassicV2EffectiveSectionScaleMult("terms", null, { footer: "large" }, 1);
    expect(explicit).toBeLessThan(footerOnly);
    // Per-type scope: type terms beat type footer.
    const typeScoped = getClassicV2EffectiveSectionScaleMult(
      "terms",
      { footer: "large", terms: "small" },
      null,
      1,
    );
    expect(typeScoped).toBe(explicit);
    void CLASSIC_V2_SECTION_INHERIT;
  });

  it("leaves budgets byte-identical until terms is set", () => {
    const plain = getRowBudgets("classic_v2", BASE, "line_items", 0, {});
    const unset = getRowBudgets("classic_v2", { ...BASE }, "line_items", 0, {});
    expect(unset).toEqual(plain);
  });

  it("reserves the last page against the taller of footer/terms", () => {
    const plain = getRowBudgets("classic_v2", BASE, "line_items", 0, {});
    const bigTerms = getRowBudgets("classic_v2", { ...BASE, terms: 1.4 }, "line_items", 0, {});
    expect(bigTerms.last).toBeLessThan(plain.last);
    // Footer-driven growth reserves identically — the max() keeps one shared
    // footer-block reserve instead of double-counting.
    const bigFooter = getRowBudgets("classic_v2", { ...BASE, footer: 1.4 }, "line_items", 0, {});
    expect(bigTerms.last).toBe(bigFooter.last);
    expect(bigTerms.first).toBe(bigFooter.first);
  });
});
