import type { ClientProfile } from "../types";
import type { YearEra } from "./dates";

/**
 * The year system this workspace prints in.
 *
 * Resolved in exactly one place so every screen and every printed document
 * agrees. Falls back to `be` — the behaviour every workspace had before the
 * setting existed — so nothing changes until an administrator picks `ce`.
 *
 * The setting is admin-only (see `sql/20261018_add_year_era.sql`): a workspace
 * owner cannot change it, even via the API.
 */
export function resolveYearEra(profile: ClientProfile | null | undefined): YearEra {
  return profile?.year_era === "ce" ? "ce" : "be";
}

export function isYearEra(value: unknown): value is YearEra {
  return value === "ce" || value === "be";
}
