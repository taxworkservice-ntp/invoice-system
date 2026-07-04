import { useWorkspaceFeatures } from "./useAuth";

export function useClientFeatures(userId: string | undefined) {
  return useWorkspaceFeatures(userId);
}
