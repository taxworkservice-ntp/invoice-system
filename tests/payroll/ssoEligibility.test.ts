import { describe, expect, it } from "vitest";
import {
  currentAgeYears,
  fullYearsBetween,
  isSsoCovered,
  wasSixtyAtHire,
} from "../../src/lib/payroll/ssoEligibility";

function person(
  overrides: {
    sso_registered?: boolean;
    start_date?: string;
    date_of_birth?: string | null;
  } = {},
) {
  return {
    sso_registered: true,
    start_date: "2020-01-15",
    date_of_birth: "1990-06-01",
    ...overrides,
  };
}

describe("fullYearsBetween", () => {
  it("counts birthdays, not calendar years", () => {
    expect(fullYearsBetween("1960-09-15", "2020-09-14")).toBe(59);
    expect(fullYearsBetween("1960-09-15", "2020-09-15")).toBe(60);
    expect(fullYearsBetween("1960-09-15", "2020-09-16")).toBe(60);
  });

  it("returns null for missing or malformed input", () => {
    expect(fullYearsBetween(null, "2020-01-01")).toBe(null);
    expect(fullYearsBetween("1990-06-01", "")).toBe(null);
    expect(fullYearsBetween("not-a-date", "2020-01-01")).toBe(null);
  });
});

describe("wasSixtyAtHire", () => {
  it("flags hires already 60+ on their start date", () => {
    expect(wasSixtyAtHire({ start_date: "2020-01-15", date_of_birth: "1960-01-15" })).toBe(true);
    expect(wasSixtyAtHire({ start_date: "2020-01-15", date_of_birth: "1950-03-20" })).toBe(true);
  });

  it("passes hires under 60, even by a single day", () => {
    expect(wasSixtyAtHire({ start_date: "2020-01-14", date_of_birth: "1960-01-15" })).toBe(false);
    expect(wasSixtyAtHire({ start_date: "2020-01-15", date_of_birth: "1990-06-01" })).toBe(false);
  });

  it("defaults to false when birthdate is unknown", () => {
    expect(wasSixtyAtHire({ start_date: "2020-01-15", date_of_birth: null })).toBe(false);
  });
});

describe("isSsoCovered", () => {
  it("covers normal registered staff, including past-60 veterans", () => {
    // Hired at 30, still employed at 66 → keeps filing.
    expect(isSsoCovered(person({ date_of_birth: "1960-01-15", start_date: "1990-06-01" }))).toBe(
      true,
    );
    expect(isSsoCovered(person())).toBe(true);
  });

  it("excludes hires already 60+ and unregistered staff", () => {
    // Hired exactly on the 60th birthday → already 60 → excluded.
    expect(isSsoCovered(person({ date_of_birth: "1960-01-15", start_date: "2020-01-15" }))).toBe(
      false,
    );
    expect(isSsoCovered(person({ date_of_birth: "1959-01-15", start_date: "2020-01-15" }))).toBe(
      false,
    );
    expect(isSsoCovered(person({ sso_registered: false }))).toBe(false);
  });

  it("defaults to covered when birthdate is missing (legacy rows)", () => {
    expect(isSsoCovered(person({ date_of_birth: null }))).toBe(true);
  });
});

describe("currentAgeYears", () => {
  it("computes age against a fixed today", () => {
    expect(currentAgeYears("1960-09-15", "2026-09-25")).toBe(66);
    expect(currentAgeYears("1960-09-26", "2026-09-25")).toBe(65);
    expect(currentAgeYears(null, "2026-09-25")).toBe(null);
  });
});
