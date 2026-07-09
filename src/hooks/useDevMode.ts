import { useAuth, useClientProfile } from "./useAuth";

export function useDevMode() {
  const { profile } = useAuth();
  const { clientProfile } = useClientProfile(profile?.id);
  const isDevMode = clientProfile?.dev_mode_enabled === true;
  const devEffectiveDate = isDevMode ? clientProfile?.dev_effective_date || null : null;

  return {
    isDevMode,
    devEffectiveDate,
  };
}
