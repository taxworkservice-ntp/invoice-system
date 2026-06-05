import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Customer } from "../types";

export function useCustomers(userId: string | undefined) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setCustomers(data as Customer[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  async function addCustomer(customer: Partial<Customer>): Promise<Customer> {
    const { data, error } = await supabase
      .from("customers")
      .insert({ ...customer, user_id: userId })
      .select("*")
      .single();

    if (error) throw error;
    const c = data as Customer;
    setCustomers((prev) => [...prev, c]);
    return c;
  }

  return { customers, loading, refetch: fetch, addCustomer };
}
