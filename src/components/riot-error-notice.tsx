import type { RiotApiError } from "@/lib/riot/client";

// Turns a failed Riot call into a message a visitor can act on.
const MESSAGES: Record<RiotApiError["kind"], { title: string; body: (e: RiotApiError) => string }> =
  {
    "rate-limited": {
      title: "Too many lookups right now",
      body: (e) =>
        `Riot limits how often this site can ask for data. Try again in ${e.retryAfter ?? 10} seconds.`,
    },
    "bad-key": {
      title: "The site's Riot API key isn't working",
      body: () =>
        "It's missing or has expired (development keys only last 24 hours). Nothing is wrong with your search.",
    },
    "not-found": {
      title: "Riot has no data for this player here",
      body: () => "The account exists but has no League of Legends profile in this region.",
    },
    unavailable: {
      title: "Riot's servers didn't answer",
      body: () => "This is usually brief. Try again in a moment.",
    },
  };

export function RiotErrorNotice({ error }: { error: RiotApiError }) {
  const { title, body } = MESSAGES[error.kind];
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-5"
    >
      <p className="font-semibold">{title}</p>
      <p className="text-zinc-600 dark:text-zinc-400">{body(error)}</p>
    </div>
  );
}
