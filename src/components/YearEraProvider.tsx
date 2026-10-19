import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatDocDate, formatDocDateFull, formatDocDateTimeParts, formatDocMonth, formatDocNumericDate } from "../lib/dates";
import { resolveYearEra } from "../lib/yearEra";
import type { ClientProfile } from "../types";

/**
 * The workspace's year system, made available to every screen without prop
 * drilling.
 *
 * One source of truth: the workspace setting (admin-only, `year_era`). Screens
 * read the era from here (the provider sits above the routes in `App.tsx`).
 * Printed documents read the same setting off the `clientProfile` they already
 * carry, because the print page renders outside this tree. Either way a screen
 * must never format a year itself — that is what produced ค.ศ. in one place and
 * พ.ศ. in another.
 */

const YearEraContext = createContext<"ce" | "be">("be");

export function YearEraProvider({
  profile,
  children,
}: {
  profile: ClientProfile | null | undefined;
  children: ReactNode;
}) {
  const era = useMemo(() => resolveYearEra(profile), [profile]);
  return <YearEraContext.Provider value={era}>{children}</YearEraContext.Provider>;
}

/** Current era — for the rare place that needs the value itself. */
export function useYearEra(): "ce" | "be" {
  return useContext(YearEraContext);
}

/**
 * Era-bound date formatters. Prefer this over importing from `lib/dates` so a
 * screen can never accidentally hardcode an era.
 *
 *   const { date, numeric, full, month } = useDocDate();
 *   numeric(row.issue_date)   // → 18/10/2026  or  18/10/2569
 */
export function useDocDate() {
  const era = useYearEra();
  return useMemo(
    () => ({
      era,
      date: (value: string) => formatDocDate(value, era),
      full: (value: string) => formatDocDateFull(value, era),
      numeric: (value: string) => formatDocNumericDate(value, era),
      month: (value: string) => formatDocMonth(value, era),
      dateTimeParts: (value: string) => formatDocDateTimeParts(value, era),
    }),
    [era],
  );
}
