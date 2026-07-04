import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ClientMemberRole, Profile, ClientProfile, UserRole } from "../types";

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
      const baseProfile = data as Profile;

      if (baseProfile.role === "client") {
        const { data: membership } = await supabase
          .from("client_members")
          .select("workspace_user_id, role, status, permissions")
          .eq("member_user_id", userId)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (membership?.workspace_user_id) {
          setProfile({
            ...baseProfile,
            auth_user_id: userId,
            id: membership.workspace_user_id,
            workspace_user_id: membership.workspace_user_id,
            workspace_role: membership.role as ClientMemberRole,
            workspace_permissions: membership.permissions as Profile["workspace_permissions"],
          });
        } else {
          setProfile({
            ...baseProfile,
            auth_user_id: userId,
            workspace_user_id: userId,
            workspace_role: "owner",
            workspace_permissions: null,
          });
        }
      } else {
        setProfile({
          ...baseProfile,
          auth_user_id: userId,
          workspace_user_id: userId,
          workspace_role: null,
          workspace_permissions: null,
        });
      }
    }
    setLoading(false);
  }

  return { profile, loading, error };
}

export function useWorkspaceRole() {
  const { profile, loading } = useAuth();
  const workspaceRole = profile?.workspace_role ?? null;

  return {
    profile,
    loading,
    workspaceUserId: profile?.workspace_user_id ?? profile?.id,
    workspaceRole,
    workspacePermissions: profile?.workspace_permissions ?? null,
    isWorkspaceOwner: workspaceRole === "owner",
    isWorkspaceManager: workspaceRole === "manager",
    isWorkspaceOfficer: workspaceRole === "officer",
  };
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
