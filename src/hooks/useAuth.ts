import { createContext, createElement, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import type { ClientMemberRole, Profile, ClientProfile, UserRole } from "../types";

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  recovery: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;

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
      return {
        ...baseProfile,
        auth_user_id: userId,
        id: membership.workspace_user_id,
        workspace_user_id: membership.workspace_user_id,
        workspace_role: membership.role as ClientMemberRole,
        workspace_permissions: membership.permissions as Profile["workspace_permissions"],
      };
    }

    return {
      ...baseProfile,
      auth_user_id: userId,
      workspace_user_id: userId,
      workspace_role: "owner",
      workspace_permissions: null,
    };
  }

  return {
    ...baseProfile,
    auth_user_id: userId,
    workspace_user_id: userId,
    workspace_role: null,
    workspace_permissions: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchProfile(userId: string) {
      try {
        setError(null);
        const resolvedProfile = await resolveProfile(userId);
        if (active) setProfile(resolvedProfile);
      } catch (err: any) {
        if (active) {
          setError(err.message || "Unable to load profile");
          setProfile(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }
      if (session && window.location.hash.includes("type=recovery")) {
        setRecovery(true);
      }
      if (session?.user) {
        void fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setLoading(false);
        return;
      }
      if (session?.user) {
        setLoading(true);
        void fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return createElement(AuthContext.Provider, { value: { profile, loading, error, recovery } }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useWorkspaceRole() {
  const { profile, loading, recovery } = useAuth();
  const workspaceRole = profile?.workspace_role ?? null;

  return {
    profile,
    loading,
    recovery,
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
