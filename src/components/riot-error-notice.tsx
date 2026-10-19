import Link from "next/link";
import { Suspense } from "react";
import type { Region } from "@/lib/regions";
import type { RiotApiError } from "@/lib/riot/client";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import { RiotStatus } from "./riot-status";

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

// Pass the region when there is one: if Riot didn't answer, the notice also
// lists any outage Riot itself is reporting for that server.
export function RiotErrorNotice({ error, region }: { error: RiotApiError; region?: Region }) {
  const { title, body } = MESSAGES[error.kind];
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-5"
    >
      <p className="font-semibold">{title}</p>
      <p className="text-muted">{body(error)}</p>
      {error.kind === "unavailable" && region && (
        <Suspense fallback={null}>
          <RiotStatus region={region} />
        </Suspense>
      )}
      {/* The sample game is served from the database, so it still works
          while Riot can't be reached. "not-found" is about this one player,
          so a sample wouldn't help there. */}
      {error.kind !== "not-found" && (
        <p className="text-muted">
          Meanwhile, you can{" "}
          <Link href={SAMPLE_MATCH_HREF} className="text-ink underline hover:text-ahead">
            see a sample analysis
          </Link>
          .
        </p>
      )}
    </div>
  );
}
