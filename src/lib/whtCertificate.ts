import { supabase } from "./supabase";
import { resolveYearEra } from "./yearEra";
import { toEraYear, type YearEra } from "./dates";
import type { ClientProfile } from "../types";

/**
 * The `YYMM` stem of a WHT certificate number — two-digit year then month, e.g.
 * `6910` for พ.ศ. 2569 October (พ.ศ.) or `2610` (ค.ศ.).
 *
 * The certificate number is printed on a tax document, so its year follows the
 * workspace's year system exactly like the document and deal numbers do
 * (`generate_doc_number`); the month is the issue month either way, which is
 * what the running sequence is scoped to.
 */
export function whtCertificateYymm(issueDate: string, era: YearEra): string {
  const [yearPart, monthPart] = String(issueDate || "").split("-");
  const ceYear = Number(yearPart);
  if (!Number.isFinite(ceYear) || !monthPart) {
    // Same shape as before for anything unparseable.
    return String(issueDate || "").slice(2, 7).replace("-", "");
  }
  const displayYear = toEraYear(ceYear, era);
  return `${String(displayYear % 100).padStart(2, "0")}${monthPart}`;
}

/** The workspace's year system; admin-only setting, resolved like the UI does. */
async function workspaceYearEra(userId: string): Promise<YearEra> {
  const { data } = await supabase
    .from("client_profiles")
    .select("year_era")
    .eq("user_id", userId)
    .maybeSingle();
  return resolveYearEra(data as ClientProfile | null);
}

export async function nextWhtCertificateNo(
  userId: string,
  issueDate: string,
  skipId?: string,
  /**
   * The workspace's year system. Callers that already hold the client profile
   * pass it; the rest fall back to one small read, so no call site can quietly
   * keep issuing ค.ศ. numbers in a พ.ศ. workspace.
   */
  era?: YearEra,
): Promise<string> {
  const resolvedEra = era ?? (await workspaceYearEra(userId));
  const ceYymm = whtCertificateYymm(issueDate, "ce");
  const displayYymm = whtCertificateYymm(issueDate, resolvedEra);
  // Scan both stems and both legacy shapes (`WT…` and the bare digits some old
  // rows carry) so the sequence continues across an era switch instead of
  // restarting at 001 over numbers that already exist.
  const patterns = [...new Set([ceYymm, displayYymm])].flatMap((yymm) => [
    `certificate_no.like.WT${yymm}%`,
    `certificate_no.like.${yymm}%`,
  ]);
  const { data, error } = await supabase
    .from("wht_records")
    .select("id, certificate_no")
    .eq("user_id", userId)
    .not("certificate_no", "is", null)
    .or(patterns.join(","));

  let maxSeq = 0;
  if (!error && data) {
    for (const row of data) {
      if (skipId && row.id === skipId) continue;
      const seqStr = row.certificate_no?.slice(-3) || "0";
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `WT${displayYymm}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function assignWhtCertificateNo(
  recordId: string,
  userId: string,
  issueDate: string,
  era?: YearEra,
): Promise<string> {
  const certNo = await nextWhtCertificateNo(userId, issueDate, recordId, era);
  const generatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("wht_records")
    .update({ certificate_no: certNo, certificate_generated_at: generatedAt })
    .eq("id", recordId);
  if (error) throw error;
  return certNo;
}
