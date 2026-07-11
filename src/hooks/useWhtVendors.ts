import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { WhtVendor } from "../types";

export function useWhtVendors(userId: string | undefined) {
  const [vendors, setVendors] = useState<WhtVendor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("wht_vendors")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setVendors(data as WhtVendor[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  async function addVendor(vendor: Partial<WhtVendor>): Promise<WhtVendor> {
    const { data, error } = await supabase
      .from("wht_vendors")
      .insert({ ...vendor, user_id: userId })
      .select("*")
      .single();

    if (error) throw error;
    const v = data as WhtVendor;
    setVendors((prev) => [...prev, v]);
    return v;
  }

  async function updateVendor(id: string, patch: Partial<WhtVendor>) {
    const { error } = await supabase
      .from("wht_vendors")
      .update(patch)
      .eq("id", id);

    if (error) throw error;
    setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  async function deleteVendor(id: string) {
    const { error } = await supabase
      .from("wht_vendors")
      .update({ is_active: false })
      .eq("id", id);

    if (error) throw error;
    setVendors((prev) => prev.filter((v) => v.id !== id));
  }

  return { vendors, loading, refetch: fetch, addVendor, updateVendor, deleteVendor };
}
