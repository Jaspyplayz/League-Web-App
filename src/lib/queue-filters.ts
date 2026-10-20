// The game-mode tabs above the profile's match list, like op.gg's: All,
// Ranked Solo/Duo, Ranked Flex and so on. The choice lives in the URL
// (?queue=solo), so a filtered list can be shared or reloaded.

// How each tab asks Riot's match list for its games: `queue` is one queue ID
// (https://static.developer.riotgames.com/docs/lol/queues.json) and `type`
// is Riot's wider grouping, which covers both ranked queues at once.
export type MatchIdFilter = { queue?: number; type?: "ranked" | "normal" };

export const QUEUE_FILTERS = [
  { id: "all", label: "All", filter: {} },
  { id: "ranked", label: "All ranked", filter: { type: "ranked" } },
  { id: "solo", label: "Ranked Solo/Duo", filter: { queue: 420 } },
  { id: "flex", label: "Ranked Flex", filter: { queue: 440 } },
  { id: "normal", label: "Normal Draft", filter: { queue: 400 } },
  { id: "swiftplay", label: "Swiftplay", filter: { queue: 480 } },
  { id: "aram", label: "ARAM", filter: { queue: 450 } },
] as const satisfies readonly { id: string; label: string; filter: MatchIdFilter }[];

export type QueueFilter = (typeof QUEUE_FILTERS)[number];

// Anything unexpected in the URL falls back to the page's default tab: All,
// unless the page picks another.
export function readQueueFilter(
  value: string | string[] | undefined,
  fallback: QueueFilter["id"] = "all",
): QueueFilter {
  return (
    QUEUE_FILTERS.find((f) => f.id === value) ?? QUEUE_FILTERS.find((f) => f.id === fallback)!
  );
}

// The queue IDs a filter covers, for looking games up in the database.
// Null means every queue.
export function queueIds(filter: MatchIdFilter): number[] | null {
  if (filter.queue !== undefined) return [filter.queue];
  if (filter.type === "ranked") return [420, 440];
  if (filter.type === "normal") return [400, 430, 480, 490];
  return null;
}
