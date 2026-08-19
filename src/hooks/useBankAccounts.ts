import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { BankAccount } from "../types";

export function useBankAccounts(userId: string | undefined) {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setBankAccounts(data as BankAccount[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const primary = bankAccounts.find((b) => b.is_primary) || bankAccounts[0] || null;
  const active = bankAccounts.filter((b) => b.is_active);

  function updateBankAccountLocal(id: string, patch: Partial<BankAccount>) {
    setBankAccounts((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  }

  function removeBankAccountLocal(id: string) {
    setBankAccounts((prev) => prev.filter((b) => b.id !== id));
  }

  return {
    bankAccounts,
    active,
    primary,
    loading,
    refetch: fetch,
    updateBankAccountLocal,
    removeBankAccountLocal,
  };
}