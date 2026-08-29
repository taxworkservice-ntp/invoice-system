import { supabase } from "./supabase";

export async function nextWhtCertificateNo(
  userId: string,
  issueDate: string,
  skipId?: string,
): Promise<string> {
  const yymm = issueDate.slice(2, 7).replace("-", "");
  const { data, error } = await supabase
    .from("wht_records")
    .select("id, certificate_no")
    .eq("user_id", userId)
    .not("certificate_no", "is", null)
    .or(`certificate_no.like.WT${yymm}%,certificate_no.like.${yymm}%`);

  let maxSeq = 0;
  if (!error && data) {
    for (const row of data) {
      if (skipId && row.id === skipId) continue;
      const seqStr = row.certificate_no?.slice(-3) || "0";
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return `WT${yymm}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function assignWhtCertificateNo(
  recordId: string,
  userId: string,
  issueDate: string,
): Promise<string> {
  const certNo = await nextWhtCertificateNo(userId, issueDate, recordId);
  const generatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("wht_records")
    .update({ certificate_no: certNo, certificate_generated_at: generatedAt })
    .eq("id", recordId);
  if (error) throw error;
  return certNo;
}
