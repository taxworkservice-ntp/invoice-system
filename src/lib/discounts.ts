import type { ClientProfile } from "../types";

/**
 * Whether this workspace offers discounts at all.
 *
 * A client-side setting (Settings › Documents, owner-controlled). It is
 * display-only: turning it off hides the discount inputs, never zeroes a stored
 * discount, and never changes a printed document.
 *
 * Reads as enabled unless explicitly disabled, so a workspace that has not had
 * the migration applied yet keeps working unchanged.
 */
export function isDiscountEnabled(profile: ClientProfile | null | undefined): boolean {
  return profile?.discounts_enabled !== false;
}
