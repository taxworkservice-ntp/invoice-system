import { describe, expect, it } from "vitest";
import { estimateClassicV2FullRowHeight } from "../../src/lib/printRowHeight";

/**
 * Classic V2's two full-width table rows — the project heading (first row) and
 * the document note (last row, `บันทึก (NOTE): …`). The constants are measured
 * against the rendered CSS (scripts/_probe-rows.mjs): 3.06mm of cell padding +
 * border, 3.572mm per 7.5pt/1.35 line at scale 1, and a 130-character budget
 * against a measured ~155-character full-width capacity.
 */
const FIXED = 3.06;
const LINE = 3.572;

describe("estimateClassicV2FullRowHeight", () => {
  it("charges one line plus the fixed cell padding", () => {
    expect(estimateClassicV2FullRowHeight("งานติดตั้งไฟโรงงาน A")).toBeCloseTo(FIXED + LINE, 3);
  });

  it("scales the text line but not the padding", () => {
    // Measured on the fixture: 8.06mm at 1.4×.
    expect(estimateClassicV2FullRowHeight("งานติดตั้งไฟโรงงาน A", { fontScale: 1.4 })).toBeCloseTo(
      FIXED + LINE * 1.4,
      3,
    );
  });

  it("wraps long text into more lines", () => {
    const oneLine = "ก".repeat(130);
    const twoLines = "ก".repeat(131);
    expect(estimateClassicV2FullRowHeight(oneLine)).toBeCloseTo(FIXED + LINE, 3);
    expect(estimateClassicV2FullRowHeight(twoLines)).toBeCloseTo(FIXED + LINE * 2, 3);
  });

  it("counts the inline label against the first line", () => {
    // "บันทึก (NOTE): " shares the note's first line, so 130 chars of value
    // plus a 15-character label no longer fit on one line.
    const value = "ก".repeat(115);
    expect(estimateClassicV2FullRowHeight(value, { labelChars: 15 })).toBeCloseTo(FIXED + LINE, 3);
    expect(estimateClassicV2FullRowHeight("ก".repeat(116), { labelChars: 15 })).toBeCloseTo(
      FIXED + LINE * 2,
      3,
    );
  });

  it("counts explicit line breaks", () => {
    expect(estimateClassicV2FullRowHeight("บรรทัดหนึ่ง\nบรรทัดสอง")).toBeCloseTo(FIXED + LINE * 2, 3);
  });

  it("charges nothing for an absent or blank value", () => {
    expect(estimateClassicV2FullRowHeight(null)).toBe(0);
    expect(estimateClassicV2FullRowHeight(undefined)).toBe(0);
    expect(estimateClassicV2FullRowHeight("   ")).toBe(0);
    expect(estimateClassicV2FullRowHeight("")).toBe(0);
  });

  it("a wrapping name reserves at least as much as it renders", () => {
    // The budget only stays safe while the model is an upper bound.
    const long = "งานติดตั้งระบบไฟส่องสว่างและปรับปรุงห้องผลิต อาคาร 2 ชั้น 3 (เฟส 2)".repeat(3);
    const modelled = estimateClassicV2FullRowHeight(long);
    const realCapacityPerLine = 155; // measured lower bound
    const realLines = Math.ceil(long.length / realCapacityPerLine);
    expect(modelled).toBeGreaterThanOrEqual(FIXED + LINE * realLines);
  });
});
