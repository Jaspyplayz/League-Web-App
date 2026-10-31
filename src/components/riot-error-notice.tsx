import Link from "next/link";
import { Suspense } from "react";
import type { Region } from "@/lib/regions";
import type { RiotApiError } from "@/lib/riot/client";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import { ProblemPanel, secondButtonClass } from "./ui/state-panel";
import { TryAgainButton } from "./ui/try-again-button";
import { RiotStatus } from "./riot-status";

// Turns a failed Riot call into a message a visitor can act on.
const MESSAGES: Record<RiotApiError["kind"], { title: string; body: string }> = {
  "rate-limited": {
    title: "Too many lookups right now",
    body: "Riot limits how often this site can ask for data. Wait for the countdown, then try again.",
  },
  "bad-key": {
    title: "The site's Riot API key isn't working",
    body: "It's missing or has expired (development keys only last 24 hours). Nothing is wrong with your search.",
  },
  "not-found": {
    title: "Riot has no data for this player here",
    body: "The account exists but has no League of Legends profile in this region.",
  },
  unavailable: {
    title: "Riot's servers didn't answer",
    body: "This is usually brief. Try again in a moment.",
  },
};

// The sample game is served from the database, so it still works while Riot
// can't be reached.
const exampleGame = (
  <Link href={SAMPLE_MATCH_HREF} className={secondButtonClass}>
    See the example game
  </Link>
);

// Pass the region when there is one: if Riot didn't answer, the panel also
// shows any outage Riot itself is reporting for that server.
export function RiotErrorNotice({ error, region }: { error: RiotApiError; region?: Region }) {
  const { title, body } = MESSAGES[error.kind];
  return (
    <ProblemPanel title={title} actions={actionsFor(error)}>
      <p>{body}</p>
      {error.kind === "unavailable" && region && (
        <Suspense fallback={null}>
          <RiotStatus region={region} />
        </Suspense>
      )}
    </ProblemPanel>
  );
}

// Each problem's way out. Trying again only helps when Riot was busy or
// didn't answer; a broken key needs Jasper, so it offers the example game.
// "not-found" is about this one player, so the example game wouldn't help
// there and home is the way out.
function actionsFor(error: RiotApiError) {
  switch (error.kind) {
    case "rate-limited":
      return (
        <>
          <TryAgainButton waitSeconds={error.retryAfter ?? 10} />
          {exampleGame}
        </>
      );
    case "unavailable":
      return (
        <>
          <TryAgainButton />
          {exampleGame}
        </>
      );
    case "bad-key":
      return exampleGame;
    case "not-found":
      return (
        <Link href="/" className={secondButtonClass}>
          Back to the home page
        </Link>
      );
  }
}
