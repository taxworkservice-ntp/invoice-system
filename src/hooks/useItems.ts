import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { Item, StockMovement } from "../types";

export function useItems(userId: string | undefined) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setItems(data as Item[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { items, loading, refetch: fetch };
}

export function useStockMovements(itemId: string | undefined) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("stock_movements")
      .select("*")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setMovements(data as StockMovement[]);
    }
    setLoading(false);
  }, [itemId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { movements, loading, refetch: fetch };
}
