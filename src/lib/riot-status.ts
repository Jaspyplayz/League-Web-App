// Pure helper that picks what to show from Riot's status page for one server.

import type { PlatformStatus, StatusEntry } from "@/lib/riot/types";

// The English titles of every current incident and every maintenance that's
// happening right now. Scheduled or finished maintenance can't be why a
// lookup just failed, so those are left out.
export function currentIssues(status: PlatformStatus): string[] {
  const live = [
    ...status.incidents,
    ...status.maintenances.filter((m) => m.maintenance_status === "in_progress"),
  ];
  const titles = live.map(englishTitle).filter((t): t is string => t !== null);
  return [...new Set(titles)];
}

// Riot translates each title; prefer US English, then any English, then
// whatever comes first.
function englishTitle(entry: StatusEntry): string | null {
  const pick =
    entry.titles.find((t) => t.locale === "en_US") ??
    entry.titles.find((t) => t.locale.startsWith("en")) ??
    entry.titles[0];
  return pick?.content.trim() || null;
}
