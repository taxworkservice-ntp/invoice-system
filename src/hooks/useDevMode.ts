import { useAuth, useClientProfile } from "./useAuth";

export function useDevMode() {
  const { profile } = useAuth();
  const { clientProfile } = useClientProfile(profile?.id);
  return {
    isDevMode: clientProfile?.dev_mode_enabled === true,
  };
}
