import "server-only";

import { playerBuilds } from "@/lib/analyzer/build";
import { getDataDragon, itemIconUrl, itemName, type DataDragon } from "@/lib/ddragon";
import { loadMatch, loadTimeline } from "@/lib/match-store";
import type { Region } from "@/lib/regions";
import { settle, type RiotErrorKind } from "@/lib/riot/client";

// What the match panel's Build tab shows, ready to draw in the browser. Item
// names and image URLs are filled in here on the server, so the browser
// doesn't need all of Data Dragon to show a few icons.

export type BuildItem = { id: number; name: string; iconUrl: string | null };

export type BuildView = {
  items: { minute: number; items: BuildItem[] }[];
  skills: number[]; // 1 = Q, 2 = W, 3 = E, 4 = R, one per level-up
};

export type BuildsResult =
  | { status: "ok"; builds: Record<number, BuildView> } // keyed by participantId
  | { status: "failed"; kind: RiotErrorKind };

// Builds come from the match timeline. Like the analysis page, that costs one
// Riot call the first time anyone opens a match's Build tab, and none after,
// because the timeline is saved. The match itself is usually saved already,
// since the profile loaded it to list it.
export async function loadBuilds(region: Region, matchId: string): Promise<BuildsResult> {
  const match = await settle(loadMatch(region, matchId));
  if (!match.ok) return { status: "failed", kind: match.error.kind };
  const [timeline, dd] = await Promise.all([
    settle(loadTimeline(region, match.value)),
    getDataDragon().catch(() => null),
  ]);
  if (!timeline.ok) return { status: "failed", kind: timeline.error.kind };

  const builds: Record<number, BuildView> = {};
  for (const [id, build] of Object.entries(playerBuilds(timeline.value.events))) {
    builds[Number(id)] = {
      items: build.items.map(({ minute, itemIds }) => ({
        minute,
        items: itemIds.map((itemId) => buildItem(dd, itemId)),
      })),
      skills: build.skills,
    };
  }
  return { status: "ok", builds };
}

function buildItem(dd: DataDragon | null, id: number): BuildItem {
  const name = dd ? itemName(dd, id) : null;
  return {
    id,
    name: name ?? `Item ${id}`,
    iconUrl: dd && name ? itemIconUrl(dd, id) : null,
  };
}
