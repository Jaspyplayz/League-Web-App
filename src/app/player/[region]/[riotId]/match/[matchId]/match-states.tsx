import Link from "next/link";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { ProblemPanel, secondButtonClass } from "@/components/ui/state-panel";
import { TryAgainButton } from "@/components/ui/try-again-button";
import type { RiotApiError } from "@/lib/riot/client";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";

// The match page's own problem states, in JAS-93's words.

// Riot won't send the minute-by-minute data, so this takes the board's place
// and the scoreboard still shows under it. Riot not answering gets its own
// words here; a rate limit or a broken key means the same as anywhere else.
export function TimelineProblem({ error }: { error: RiotApiError }) {
  if (error.kind !== "unavailable") return <RiotErrorNotice error={error} />;
  return (
    <ProblemPanel
      title="Riot's servers didn't send this game's timeline"
      actions={
        <>
          <TryAgainButton />
          <Link href={SAMPLE_MATCH_HREF} className={secondButtonClass}>
            See the example game
          </Link>
        </>
      }
    >
      <p>The analysis is built from it, minute by minute. This is usually brief.</p>
    </ProblemPanel>
  );
}

// A link with a game and a player who wasn't in it, usually a mixed-up link.
export function NotInGame({ name, profileHref }: { name: string; profileHref: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-title font-semibold">{name} isn&apos;t in this game</h1>
      <p className="text-quiet">
        The link may point at someone else&apos;s game. Their profile lists the games they played.
      </p>
      <Link href={profileHref} className={`${secondButtonClass} mt-1.5`}>
        Open {name}&apos;s profile
      </Link>
    </div>
  );
}
