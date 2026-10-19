// Pure helper for the "In game" badge on the profile. Only the looked-up
// player's own game mode and how long it has run; nothing about the other
// players in it.

import { queueName } from "@/lib/match-summary";
import type { ActiveGame } from "@/lib/riot/types";

// "In game · Ranked Solo · 12 min". Riot reports a start time of 0 while
// players are still loading in, so that shows as "loading in".
export function liveGameLabel(game: ActiveGame, now: number): string {
  const parts = ["In game"];
  const queue = queueName(game.gameQueueConfigId);
  if (queue !== "Other") parts.push(queue);
  if (game.gameStartTime > 0) {
    const minutes = Math.max(0, Math.floor((now - game.gameStartTime) / 60_000));
    parts.push(`${minutes} min`);
  } else {
    parts.push("loading in");
  }
  return parts.join(" · ");
}
