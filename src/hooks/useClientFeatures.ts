import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ClientFeature, ClientFeatureKey } from "../types";

export function useClientFeatures(userId: string | undefined) {
  const [features, setFeatures] = useState<ClientFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) {
      setFeatures([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("client_features")
      .select("*")
      .eq("user_id", userId)
      .eq("enabled", true);

    if (!error && data) {
      setFeatures(data as ClientFeature[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const enabledKeys = useMemo(
    () => new Set(features.map((feature) => feature.feature_key)),
    [features],
  );

  return {
    features,
    loading,
    refetch: fetch,
    hasFeature: (key: ClientFeatureKey) => enabledKeys.has(key),
  };
}
