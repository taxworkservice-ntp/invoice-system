import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface ReferenceRow {
  customer_po_number: string | null;
  task_name: string | null;
}

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = (value || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Distinct past PO numbers / job names this customer has used, newest first —
 * feeds <datalist> suggestions so recurring jobs become pick-not-type.
 */
export function useCustomerReferenceHistory(customerId: string | null | undefined) {
  const [poValues, setPoValues] = useState<string[]>([]);
  const [taskValues, setTaskValues] = useState<string[]>([]);

  useEffect(() => {
    if (!customerId) {
      setPoValues([]);
      setTaskValues([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("documents")
      .select("customer_po_number, task_name, created_at")
      .eq("customer_id", customerId)
      .neq("status", "voided")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const rows = data as ReferenceRow[];
        setPoValues(dedupe(rows.map((row) => row.customer_po_number)));
        setTaskValues(dedupe(rows.map((row) => row.task_name)));
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return { poValues, taskValues };
}
