import { describe, expect, it } from "vitest";
import {
  CLASSIC_V2_SECTION_FONT_KEYS,
  getClassicV2EffectiveSectionScaleMult,
} from "../../src/constants";

describe('ป้ายภาษาอังกฤษ font slot (Classic V2)', () => {
  it("is a first-class section key (so settings + per-type overrides accept it)", () => {
    expect(CLASSIC_V2_SECTION_FONT_KEYS).toContain("en");
  });

  it("follows the document global scale until set", () => {
    expect(getClassicV2EffectiveSectionScaleMult("en", null, null, 1.4)).toBe(1.4);
  });

  it("accepts a workspace override and a per-type override that wins", () => {
    expect(getClassicV2EffectiveSectionScaleMult("en", null, { en: "large" }, 1)).toBeCloseTo(1.2, 5);
    expect(
      getClassicV2EffectiveSectionScaleMult("en", { en: "small" }, { en: "large" }, 1),
    ).toBeCloseTo(0.8, 5);
  });
});
