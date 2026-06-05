import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile, ClientProfile, UserRole } from "../types";

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      setError(error.message);
    } else {
      setProfile(data as Profile);
    }
    setLoading(false);
  }

  return { profile, loading, error };
}

export function useClientProfile(userId: string | undefined) {
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    supabase
      .from("client_profiles")
      .select("*")
      .eq("user_id", userId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setClientProfile(data as ClientProfile);
        }
        setLoading(false);
      });
  }, [userId]);

  return { clientProfile, loading, setClientProfile };
}

export function useRole(): { role: UserRole | null; isAdmin: boolean; isClient: boolean; loading: boolean } {
  const { profile, loading } = useAuth();
  return {
    role: profile?.role ?? null,
    isAdmin: profile?.role === "admin",
    isClient: profile?.role === "client",
    loading,
  };
}
