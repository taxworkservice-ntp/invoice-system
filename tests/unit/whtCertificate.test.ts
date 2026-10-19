import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextWhtCertificateNo, whtCertificateYymm } from "../../src/lib/whtCertificate";

/**
 * WHT certificate numbers are printed on a tax document, so their year follows
 * the workspace's year system exactly like `generate_doc_number` does — and the
 * running sequence is scoped to the issue month, which must survive an era
 * switch without restarting over numbers that already exist.
 */

let rows: { id: string; certificate_no: string | null }[] = [];
let workspaceEra: string | null = "be";
const scannedPatterns: string[] = [];

vi.mock("../../src/lib/supabase", () => {
  const builder = (table: string) => {
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      not: () => self,
      or: (pattern: string) => {
        scannedPatterns.push(pattern);
        return self;
      },
      maybeSingle: async () =>
        table === "client_profiles"
          ? { data: workspaceEra ? { year_era: workspaceEra } : null, error: null }
          : { data: null, error: null },
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: table === "wht_records" ? rows : null, error: null }),
    };
    return self;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

describe("whtCertificateYymm", () => {
  it("prints the ค.ศ. year as-is", () => {
    expect(whtCertificateYymm("2026-10-19", "ce")).toBe("2610");
  });

  it("prints the พ.ศ. year (+543) for a be workspace", () => {
    expect(whtCertificateYymm("2026-10-19", "be")).toBe("6910");
    expect(whtCertificateYymm("2027-01-05", "be")).toBe("7001");
  });

  it("matches the owner's format: WT + YY + MM + running number", () => {
    // The owner's example: a July 2026 certificate, sequence 008.
    expect(`WT${whtCertificateYymm("2026-07-11", "be")}008`).toBe("WT6907008");
    expect(`WT${whtCertificateYymm("2026-07-11", "ce")}008`).toBe("WT2607008");
  });

  it("keeps the old shape for an unparseable date", () => {
    expect(whtCertificateYymm("", "be")).toBe("");
    expect(whtCertificateYymm("2026", "be")).toBe("26");
  });
});

describe("nextWhtCertificateNo", () => {
  beforeEach(() => {
    rows = [];
    workspaceEra = "be";
    scannedPatterns.length = 0;
  });

  it("issues the next number in the workspace's era", async () => {
    rows = [{ id: "a", certificate_no: "WT6910004" }];
    await expect(nextWhtCertificateNo("user-1", "2026-10-19")).resolves.toBe("WT6910005");
  });

  it("reads the era itself when the caller does not pass one", async () => {
    workspaceEra = "ce";
    rows = [{ id: "a", certificate_no: "WT2610007" }];
    await expect(nextWhtCertificateNo("user-1", "2026-10-19")).resolves.toBe("WT2610008");
  });

  it("honours an explicitly passed era without reading the profile", async () => {
    workspaceEra = null;
    rows = [{ id: "a", certificate_no: "WT2610002" }];
    await expect(nextWhtCertificateNo("user-1", "2026-10-19", undefined, "ce")).resolves.toBe(
      "WT2610003",
    );
  });

  it("continues across an era switch instead of restarting at 001", async () => {
    // Documents numbered in ค.ศ. earlier this month, the workspace switched to
    // พ.ศ. — the scan must still see them.
    rows = [
      { id: "a", certificate_no: "WT2610009" },
      { id: "b", certificate_no: "WT6910010" },
      { id: "c", certificate_no: "2610003" }, // legacy bare-digits shape
    ];
    await expect(nextWhtCertificateNo("user-1", "2026-10-19")).resolves.toBe("WT6910011");
    const pattern = scannedPatterns.join(",");
    expect(pattern).toContain("WT2610");
    expect(pattern).toContain("WT6910");
    expect(pattern).toContain("certificate_no.like.2610%");
  });

  it("skips the record being re-numbered", async () => {
    rows = [
      { id: "keep", certificate_no: "WT6910005" },
      { id: "self", certificate_no: "WT6910009" },
    ];
    await expect(nextWhtCertificateNo("user-1", "2026-10-19", "self")).resolves.toBe("WT6910006");
  });

  it("ignores rows whose number carries no usable sequence", async () => {
    rows = [
      { id: "a", certificate_no: "WT6910ABC" },
      { id: "b", certificate_no: null },
    ];
    // Neither contributes a sequence, so the month starts from 001.
    await expect(nextWhtCertificateNo("user-1", "2026-10-19")).resolves.toBe("WT6910001");
  });
});
