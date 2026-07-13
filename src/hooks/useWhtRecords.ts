import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import type { WhtRecord, WhtVendor } from "../types";

export interface WhtRecordWithVendor extends WhtRecord {
  vendor?: WhtVendor;
}

export function useWhtRecords(userId: string | undefined) {
  const [records, setRecords] = useState<WhtRecordWithVendor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("wht_records")
      .select("*, vendor:wht_vendors(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setRecords(data as WhtRecordWithVendor[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  async function generateCertNo(issueDate: string, skipId?: string): Promise<string> {
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

  async function addRecord(record: Partial<WhtRecord>): Promise<WhtRecordWithVendor> {
    const payload = {
      ...record,
      user_id: userId,
      wht_amount: record.wht_amount ?? Math.round((record.amount ?? 0) * (record.wht_rate ?? 0)) / 100,
    };

    const { data, error } = await supabase
      .from("wht_records")
      .insert(payload)
      .select("*, vendor:wht_vendors(*)")
      .single();

    if (error) throw error;
    const r = data as WhtRecordWithVendor;

    if (!r.certificate_no && userId) {
      const certNo = await generateCertNo(r.issue_date, r.id);
      await supabase
        .from("wht_records")
        .update({
          certificate_no: certNo,
          certificate_generated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      r.certificate_no = certNo;
      r.certificate_generated_at = new Date().toISOString();
    }

    setRecords((prev) => [r, ...prev]);
    return r;
  }

  async function updateRecord(id: string, patch: Partial<WhtRecord>) {
    if (patch.amount !== undefined || patch.wht_rate !== undefined) {
      const existing = records.find((r) => r.id === id);
      const amount = patch.amount ?? existing?.amount ?? 0;
      const whtRate = patch.wht_rate ?? existing?.wht_rate ?? 0;
      patch.wht_amount = Math.round(amount * whtRate) / 100;
    }

    const { error } = await supabase
      .from("wht_records")
      .update(patch)
      .eq("id", id);

    if (error) throw error;
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  async function deleteRecord(id: string) {
    const { error } = await supabase
      .from("wht_records")
      .delete()
      .eq("id", id);

    if (error) throw error;
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  async function assignCertificateNo(recordsToAssign: WhtRecordWithVendor[]) {
    const results: WhtRecordWithVendor[] = [];
    for (const r of recordsToAssign) {
      if (r.certificate_no) {
        results.push(r);
        continue;
      }
      const certNo = await generateCertNo(r.issue_date, r.id);
      await supabase
        .from("wht_records")
        .update({
          certificate_no: certNo,
          certificate_generated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      results.push({ ...r, certificate_no: certNo });
    }

    setRecords((prev) =>
      prev.map((r) => {
        const updated = results.find((res) => res.id === r.id);
        return updated || r;
      }),
    );

    return results;
  }

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.issue_date) {
        set.add(r.issue_date.slice(0, 7));
      }
    }
    return Array.from(set).sort().reverse();
  }, [records]);

  const vendors = useMemo(() => {
    const map = new Map<string, WhtVendor>();
    for (const r of records) {
      if (r.vendor && !map.has(r.vendor.id)) {
        map.set(r.vendor.id, r.vendor);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  return {
    records,
    loading,
    refetch: fetch,
    addRecord,
    updateRecord,
    deleteRecord,
    assignCertificateNo,
    months,
    vendors,
  };
}
