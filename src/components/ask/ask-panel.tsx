import "server-only";

import * as Sentry from "@sentry/nextjs";
import { SignInLink } from "@/components/sign-in-link";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { mainButtonClass } from "@/components/ui/state-panel";
import { askEnabled } from "@/lib/ask";
import { checkAllowance, readQuestions } from "@/lib/ask-store";
import { getCurrentUser } from "@/lib/auth";
import { supabaseConfig } from "@/lib/supabase/config";
import { AskBox } from "./ask-box";
import { AskNote } from "./ask-note";

// The Ask panel beside the replay on a match page's Replay tab: type a
// question about this player's games ("why do I lose on Viego?") and Claude
// answers from Turnpoint's analysis of them (see src/lib/ask.ts). Anyone
// signed in can ask, up to 10 questions a day (src/lib/ask-rules.ts).
//
// The panel puts this game first: its example questions name it by
// champion, date and match ID. Claude's analyze_game tool reads any game the
// player played from its match ID, so a question that keeps the ID reaches
// this game even when it's older than the 20 recent_games lists, without
// changing what Ask sends, its limits or what it spends.
//
// The Ask button is a Server Action, which gets the page's time limit, so
// the match page sets maxDuration for it.
//
// Each of its states is drawn on JAS-93's states canvas: signed out, not set
// up, Ask failing to load, the three limits (here) and waiting, a question
// that couldn't be answered and past questions failing (in AskBox).
export function AskPanel({
  region,
  riotId,
  puuid,
  playerPath,
  game,
}: {
  region: string;
  riotId: string; // the slug from the address, "Name-TAG"
  puuid: string;
  playerPath: string;
  game: string; // this game in words with its ID, "Ahri game on Oct 18 (NA1_123)"
}) {
  return (
    <section aria-labelledby="ask-heading" className={`${panelClass} flex flex-col gap-4 p-5 sm:p-6`}>
      <PanelHeading id="ask-heading">Ask about this game</PanelHeading>
      <AskContent
        region={region}
        riotId={riotId}
        puuid={puuid}
        playerPath={playerPath}
        game={game}
      />
    </section>
  );
}

const ASK_ILLUSTRATION = {
  label: "Illustration · not a real game",
  question: "What do my losses have in common?",
  answer:
    "The losses in this example start the same way. An early gank turns a small gold lead into a deficit, and the other team takes dragon off the fight. The games that stay close are the ones where that first death does not happen.",
} as const;

function AskIllustration() {
  return (
    <>
      <span className="text-note text-quiet">{ASK_ILLUSTRATION.label}</span>
      <div className="flex flex-col gap-3 self-stretch rounded-md bg-raised p-5">
        <p className="font-semibold text-main">{ASK_ILLUSTRATION.question}</p>
        <p className="whitespace-pre-line text-body">{ASK_ILLUSTRATION.answer}</p>
      </div>
    </>
  );
}

// Exported for its test.
export async function AskContent({
  region,
  riotId,
  puuid,
  playerPath,
  game,
}: {
  region: string;
  riotId: string;
  puuid: string;
  playerPath: string;
  game: string;
}) {
  // Without the API key, sign-in or the database, nobody can ask.
  if (!askEnabled() || !supabaseConfig() || !process.env.DATABASE_URL) {
    return (
      <AskNote title="Ask isn't available right now.">
        This copy of Turnpoint doesn&apos;t have Claude, sign-in or its database set up.
      </AskNote>
    );
  }
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-body text-quiet">
          Sign in to ask questions about this player&apos;s games, like &ldquo;What decided my{" "}
          {game}?&rdquo;
        </p>
        <SignInLink className={mainButtonClass} />
        <AskIllustration />
      </div>
    );
  }

  // checkAllowance throws when its queries fail. On the old Ask page that
  // showed the error page; here it would take the whole match page with it,
  // so the panel says so instead and the analysis stays. Sentry still hears
  // about it, so a broken Ask doesn't go unnoticed.
  let loaded;
  try {
    loaded = await Promise.all([readQuestions(user.id, puuid), checkAllowance(user.id)]);
  } catch (error) {
    Sentry.captureException(error);
    return (
      <AskNote title="Couldn't load Ask." problem>
        Reload the page to try again. The rest of this game is still here.
      </AskNote>
    );
  }
  const [history, allowed] = loaded;
  return (
    <>
      {allowed.ok && (
        <p className="text-note text-quiet">
          To ask about this game, keep its match ID in your question, as the first two examples do.
        </p>
      )}
      <AskBox
        region={region}
        riotId={riotId}
        playerPath={playerPath}
        history={history.ok ? history.questions : []}
        historyFailed={!history.ok}
        left={allowed.ok ? allowed.left : 0}
        limit={allowed.ok ? undefined : allowed.message}
        examples={[
          `What decided my ${game}?`,
          `How did my early game go in my ${game}?`,
          "What do my losses have in common?",
        ]}
      />
    </>
  );
}
