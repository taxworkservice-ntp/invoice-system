import { createContext, createElement, useContext, useEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { supabase } from "../lib/supabase";
import type { ClientFeature, ClientFeatureKey, ClientMemberRole, Profile, ClientProfile, UserRole } from "../types";

interface AuthContextValue {
  profile: Profile | null;
  clientProfile: ClientProfile | null;
  clientFeatures: ClientFeature[];
  loading: boolean;
  workspaceLoading: boolean;
  error: string | null;
  recovery: boolean;
  setClientProfile: Dispatch<SetStateAction<ClientProfile | null>>;
  refetchWorkspace: () => Promise<void>;
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

async function resolveWorkspaceData(profile: Profile | null) {
  if (!profile || profile.role !== "client") {
    return { clientProfile: null, clientFeatures: [] as ClientFeature[] };
  }

  const workspaceUserId = profile.workspace_user_id ?? profile.id;
  const [{ data: clientProfileData, error: clientProfileError }, { data: featureData, error: featureError }] =
    await Promise.all([
      supabase.from("client_profiles").select("*").eq("user_id", workspaceUserId).maybeSingle(),
      supabase.from("client_features").select("*").eq("user_id", workspaceUserId).eq("enabled", true),
    ]);

  if (clientProfileError) throw clientProfileError;
  if (featureError) throw featureError;

  return {
    clientProfile: clientProfileData as ClientProfile | null,
    clientFeatures: (featureData ?? []) as ClientFeature[],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [clientFeatures, setClientFeatures] = useState<ClientFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchWorkspace(resolvedProfile: Profile | null) {
      if (!resolvedProfile || resolvedProfile.role !== "client") {
        setClientProfile(null);
        setClientFeatures([]);
        setWorkspaceLoading(false);
        return;
      }

      setWorkspaceLoading(true);
      try {
        const workspaceData = await resolveWorkspaceData(resolvedProfile);
        if (active) {
          setClientProfile(workspaceData.clientProfile);
          setClientFeatures(workspaceData.clientFeatures);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || "Unable to load workspace");
          setClientProfile(null);
          setClientFeatures([]);
        }
      } finally {
        if (active) setWorkspaceLoading(false);
      }
    }

    async function fetchProfile(userId: string) {
      try {
        setError(null);
        const resolvedProfile = await resolveProfile(userId);
        if (active) {
          setProfile(resolvedProfile);
          await fetchWorkspace(resolvedProfile);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || "Unable to load profile");
          setProfile(null);
          setClientProfile(null);
          setClientFeatures([]);
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
        setProfile(null);
        setClientProfile(null);
        setClientFeatures([]);
        setLoading(false);
        setWorkspaceLoading(false);
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
        setClientProfile(null);
        setClientFeatures([]);
        setLoading(false);
        setWorkspaceLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function refetchWorkspace() {
    setWorkspaceLoading(true);
    try {
      const workspaceData = await resolveWorkspaceData(profile);
      setClientProfile(workspaceData.clientProfile);
      setClientFeatures(workspaceData.clientFeatures);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Unable to load workspace");
    } finally {
      setWorkspaceLoading(false);
    }
  }

  return createElement(AuthContext.Provider, {
    value: {
      profile,
      clientProfile,
      clientFeatures,
      loading,
      workspaceLoading,
      error,
      recovery,
      setClientProfile,
      refetchWorkspace,
    },
  }, children);
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
  const { profile, clientProfile, workspaceLoading, setClientProfile } = useAuth();
  const workspaceUserId = profile?.workspace_user_id ?? profile?.id;
  const matchesActiveWorkspace = Boolean(userId && workspaceUserId && userId === workspaceUserId);

  return {
    clientProfile: matchesActiveWorkspace ? clientProfile : null,
    loading: Boolean(userId) && matchesActiveWorkspace && workspaceLoading,
    setClientProfile,
  };
}

export function useWorkspaceFeatures(userId: string | undefined) {
  const { profile, clientFeatures, workspaceLoading, refetchWorkspace } = useAuth();
  const workspaceUserId = profile?.workspace_user_id ?? profile?.id;
  const matchesActiveWorkspace = Boolean(userId && workspaceUserId && userId === workspaceUserId);
  const features = matchesActiveWorkspace ? clientFeatures : [];
  const enabledKeys = new Set(features.map((feature) => feature.feature_key));

  return {
    features,
    loading: Boolean(userId) && matchesActiveWorkspace && workspaceLoading,
    refetch: refetchWorkspace,
    hasFeature: (key: ClientFeatureKey) => enabledKeys.has(key),
  };
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
