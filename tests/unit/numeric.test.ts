import { describe, expect, it } from "vitest";
import {
  caretAfterDigits,
  countDigitsBefore,
  formatNumericValue,
  formatTypedNumeric,
  groupDigits,
  keepsOwnGrouping,
  nextCaret,
  parseNumeric,
  sanitizeNumericInput,
} from "../../src/lib/numeric";

describe("sanitizeNumericInput", () => {
  it("keeps plain digits and a single decimal point", () => {
    expect(sanitizeNumericInput("5000")).toBe("5000");
    expect(sanitizeNumericInput("5000.5")).toBe("5000.5");
    expect(sanitizeNumericInput("5.000.5")).toBe("5.0005");
  });

  it("accepts pasted values with separators and spaces", () => {
    expect(sanitizeNumericInput("1,234.50")).toBe("1234.50");
    expect(sanitizeNumericInput(" 1 234,5 ")).toBe("1234.5");
    expect(sanitizeNumericInput("1,234,567")).toBe("1234567");
  });

  it("treats a non-grouping comma as a decimal comma, never as a 10× error", () => {
    expect(sanitizeNumericInput("1234,5")).toBe("1234.5");
    expect(sanitizeNumericInput("1234,50")).toBe("1234.50");
    expect(sanitizeNumericInput("1234,567")).toBe("1234.567");
    expect(sanitizeNumericInput("1,234")).toBe("1234"); // three digits = grouping
  });

  it("keeps commas as grouping when the caller says they are its own output", () => {
    // Typing one more digit into a grouped value: "6,000" → "6,0000" must
    // still mean 60,000, not 6.00.
    expect(sanitizeNumericInput("6,0000", { commasAreGrouping: true })).toBe("60000");
    expect(sanitizeNumericInput("99,9999", { commasAreGrouping: true })).toBe("999999");
    expect(sanitizeNumericInput("1,000,000", { commasAreGrouping: true })).toBe("1000000");
    // A typed decimal comma on a value we formatted still works (the field
    // normalises "," to "." on its own keystroke).
    expect(sanitizeNumericInput("1,234.", { commasAreGrouping: true })).toBe("1234.");
  });

  it("normalises Thai and Arabic-Indic digits", () => {
    expect(sanitizeNumericInput("๕๐๐๐")).toBe("5000");
    expect(sanitizeNumericInput("١٢٣٤")).toBe("1234");
  });

  it("keeps a leading minus and drops everything else", () => {
    expect(sanitizeNumericInput("-500")).toBe("-500");
    expect(sanitizeNumericInput("-5.5")).toBe("-5.5");
    expect(sanitizeNumericInput("abc5000")).toBe("5000");
    expect(sanitizeNumericInput("5-0")).toBe("50");
  });
});

describe("groupDigits / formatTypedNumeric", () => {
  it("groups integer thousands", () => {
    expect(groupDigits("5000")).toBe("5,000");
    expect(groupDigits("1234567")).toBe("1,234,567");
    expect(groupDigits("500")).toBe("500");
    expect(groupDigits("-5000")).toBe("-5,000");
  });

  it("never pads or drops what is being typed", () => {
    expect(formatTypedNumeric("5")).toBe("5");
    expect(formatTypedNumeric("5.")).toBe("5.");
    expect(formatTypedNumeric("5.0")).toBe("5.0");
    expect(formatTypedNumeric("5000")).toBe("5,000");
    expect(formatTypedNumeric("50000.5")).toBe("50,000.5");
  });

  it("caps the fraction at the field's precision", () => {
    expect(formatTypedNumeric("5.123456", 2)).toBe("5.12");
    expect(formatTypedNumeric("5.123456", 3)).toBe("5.123");
    expect(formatTypedNumeric("", 2)).toBe("");
  });
});

describe("formatNumericValue", () => {
  it("groups and trims trailing zeros of stored values", () => {
    expect(formatNumericValue(5000)).toBe("5,000");
    expect(formatNumericValue(1234.5)).toBe("1,234.5");
    expect(formatNumericValue(0)).toBe("0");
    expect(formatNumericValue(null)).toBe("");
    expect(formatNumericValue(Number.NaN)).toBe("");
  });

  it("pads to the requested fraction for money display", () => {
    expect(formatNumericValue(5000, { minFractionDigits: 2 })).toBe("5,000.00");
    expect(formatNumericValue(1234.5, { minFractionDigits: 2 })).toBe("1,234.50");
    expect(formatNumericValue(2.5, { maxFractionDigits: 3 })).toBe("2.5");
  });
});

describe("parseNumeric", () => {
  it("parses typed text, including grouped and Thai input", () => {
    expect(parseNumeric("5,000")).toBe(5000);
    expect(parseNumeric("50,000.5")).toBe(50000.5);
    expect(parseNumeric("๕๐๐๐")).toBe(5000);
  });

  it("returns null for incomplete input instead of NaN", () => {
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("-")).toBeNull();
    expect(parseNumeric(".")).toBeNull();
    expect(parseNumeric("abc")).toBeNull();
  });
});

describe("caret helpers", () => {
  it("counts digits before the caret, ignoring separators", () => {
    const text = "1,234.50";
    expect(countDigitsBefore(text, 0)).toBe(0);
    expect(countDigitsBefore(text, 2)).toBe(1); // "1,"
    expect(countDigitsBefore(text, 3)).toBe(2); // "1,2"
    expect(countDigitsBefore(text, text.length)).toBe(6); // 1 2 3 4 5 0
  });

  it("maps a digit count back to a caret position after re-formatting", () => {
    // Typing "5000" into an empty field: caret after 4 digits → end of "5,000".
    expect(caretAfterDigits("5,000", 4)).toBe(5);
    // Deleting a middle digit keeps the caret in a sensible place.
    expect(caretAfterDigits("1,234", 2)).toBe(3);
    expect(caretAfterDigits("5,000", 0)).toBe(0);
  });
});

describe("keepsOwnGrouping", () => {
  it("recognises a single typed digit or backspace on our own formatting", () => {
    // "6,000" + "0" → "6,0000"
    expect(keepsOwnGrouping("6,000", "6,0000", 6)).toBe(true);
    // backspace at the end of "60,000"
    expect(keepsOwnGrouping("60,000", "60,00", 5)).toBe(true);
  });

  it("does not claim pastes, multi-char edits, or a typed comma/dot", () => {
    expect(keepsOwnGrouping("", "1,234", 5)).toBe(false); // paste
    expect(keepsOwnGrouping("1234", "1234,", 5)).toBe(false); // typed comma = decimal
    expect(keepsOwnGrouping("1234", "1234.5", 6)).toBe(false);
    expect(keepsOwnGrouping("12", "21", 2)).toBe(false); // replacement
  });
});

describe("NumericInput typing pipeline", () => {
  /**
   * Mirrors the component keystroke by keystroke: insert at the caret, sanitize
   * with the grouping flag, format, then move the caret. Typing at the end is
   * what the caret rule has to get right (a decimal point must keep the caret
   * after it).
   */
  function typeKeys(keys: string, maxFractionDigits = 2) {
    let text = "";
    let caret = 0;
    for (const key of keys) {
      const raw = text.slice(0, caret) + key + text.slice(caret);
      const at = caret + key.length;
      const digitsBefore = countDigitsBefore(raw, at);
      const formatted = formatTypedNumeric(
        sanitizeNumericInput(raw, { commasAreGrouping: keepsOwnGrouping(text, raw, at) }),
        maxFractionDigits,
      );
      caret = nextCaret(raw, at, formatted, digitsBefore);
      text = formatted;
    }
    return { text, caret };
  }

  it("groups as you type past every thousand boundary", () => {
    expect(typeKeys("60000").text).toBe("60,000");
    expect(typeKeys("10000").text).toBe("10,000");
    expect(typeKeys("9999999").text).toBe("9,999,999");
    expect(typeKeys("1234.56").text).toBe("1,234.56");
  });

  it("keeps the number intact when crossing a group while typing", () => {
    expect(parseNumeric(typeKeys("60000").text)).toBe(60000);
    expect(parseNumeric(typeKeys("15000000", 3).text)).toBe(15000000);
  });

  it("keeps the decimal point where it was typed", () => {
    // Regression: the caret used to land before the just-typed dot, so the next
    // digit was inserted ahead of it ("0.35" → "035.").
    expect(typeKeys("0.35").text).toBe("0.35");
    expect(typeKeys("5.5").text).toBe("5.5");
    expect(typeKeys("12.75").text).toBe("12.75");
    expect(typeKeys("1000.25").text).toBe("1,000.25");
    expect(typeKeys("1234.56").text).toBe("1,234.56");
    expect(typeKeys("50.5", 3).text).toBe("50.5");
  });

  it("leaves the caret at the end while typing forward", () => {
    const { text, caret } = typeKeys("1234.5");
    expect(caret).toBe(text.length);
  });

  it("re-groups after a backspace instead of collapsing the value", () => {
    let text = "60,000";
    const raw = text.slice(0, -1); // backspace
    const caret = raw.length;
    text = formatTypedNumeric(
      sanitizeNumericInput(raw, { commasAreGrouping: keepsOwnGrouping("60,000", raw, caret) }),
      2,
    );
    expect(text).toBe("6,000");
    expect(parseNumeric(text)).toBe(6000);
  });

  it("still lets a typed dot start a fraction", () => {
    let text = "1,234";
    const raw = `${text}.`;
    text = formatTypedNumeric(
      sanitizeNumericInput(raw, { commasAreGrouping: keepsOwnGrouping("1,234", raw, raw.length) }),
      2,
    );
    expect(text).toBe("1,234.");
  });
});

describe("nextCaret", () => {
  it("keeps the caret at the end for forward typing, even after a dot", () => {
    expect(nextCaret("0.", 2, "0.", 1)).toBe(2);
    expect(nextCaret("0.3", 3, "0.3", 2)).toBe(3);
    expect(nextCaret("12345", 5, "12,345", 5)).toBe(6);
  });

  it("falls back to the digit anchor for mid-string edits", () => {
    // Inserting a digit before the dot of "0.35" (caret is not at the end).
    expect(nextCaret("09.35", 2, "09.35", 2)).toBe(2);
  });
});
