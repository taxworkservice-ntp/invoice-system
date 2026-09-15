import { describe, expect, it } from "vitest";
import { formatBuddhistDateTimeParts } from "../../src/lib/dates";

/**
 * "แก้ไขล่าสุด" contract: the underlying timestamp keeps second (sub-minute)
 * precision so ordering is correct, while the UI only ever renders HH:MM.
 * With the pdf_render_version split, real edits land at distinct seconds
 * instead of sharing one bulk-touch minute.
 */
describe("last-edited timestamp precision", () => {
  it("renders minute precision only (no seconds)", () => {
    const parts = formatBuddhistDateTimeParts("2026-09-15T04:40:07.000Z");
    expect(parts.time).toBe("11:40");
    expect(parts.time.split(":")).toHaveLength(2);
  });

  it("keeps second-level distinction for ordering even when the minute matches", () => {
    const earlier = "2026-09-15T04:40:07.000Z";
    const later = "2026-09-15T04:40:52.000Z";
    // Ordering uses the raw ISO timestamps (second precision).
    expect([later, earlier].sort()).toEqual([earlier, later]);
    // …but both display the same minute, which is intended.
    expect(formatBuddhistDateTimeParts(earlier).time).toBe(
      formatBuddhistDateTimeParts(later).time,
    );
  });
});
