import "server-only";

import * as Sentry from "@sentry/nextjs";
import { SignInLink } from "@/components/sign-in-link";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { askEnabled } from "@/lib/ask";
import { checkAllowance, readQuestions } from "@/lib/ask-store";
import { getCurrentUser } from "@/lib/auth";
import { supabaseConfig } from "@/lib/supabase/config";
import { AskBox } from "./ask-box";

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
    <section aria-labelledby="ask-heading" className={`${panelClass} flex flex-col gap-4 p-6`}>
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
      <div className="flex flex-col gap-3 rounded-md bg-raised p-5">
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
    return <p className="text-quiet">Ask isn&apos;t available right now.</p>;
  }
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-quiet">
          <SignInLink className="font-medium text-ahead-soft hover:underline" /> to ask questions
          about this player&apos;s games, like &ldquo;What decided my {game}?&rdquo;
        </p>
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
    return <p className="text-behind">Couldn&apos;t load Ask. Reload to try again.</p>;
  }
  const [history, allowed] = loaded;
  return (
    <>
      <p className="text-note text-quiet">
        To ask about this game, keep its match ID in your question, as the first two examples do.
      </p>
      {!allowed.ok && <p className="text-behind">{allowed.message}</p>}
      <AskBox
        region={region}
        riotId={riotId}
        playerPath={playerPath}
        history={history.ok ? history.questions : []}
        historyFailed={!history.ok}
        left={allowed.ok ? allowed.left : 0}
        examples={[
          `What decided my ${game}?`,
          `How did my early game go in my ${game}?`,
          "What do my losses have in common?",
        ]}
      />
    </>
  );
}
