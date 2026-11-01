// The one way forward the "No games this season yet" panel offers: load more
// of the season while some games are still missing, then try every mode once
// they're all in. Nothing when every mode is already showing.
export function emptyAction(queueId: string, allLoaded: boolean): "load-more" | "every-mode" | null {
  if (!allLoaded) return "load-more";
  return queueId === "all" ? null : "every-mode";
}
