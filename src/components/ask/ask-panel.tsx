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
// The panel puts this game first: its heading and example questions name
// it by champion and date, the way Claude's answers refer to games. Claude
// still reads the player's games with the same tools as before, so it finds
// this one when it's among their latest games.
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
  game: string; // this game in words, "Ahri game on Oct 18"
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

async function AskContent({
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

  const [history, allowed] = await Promise.all([
    readQuestions(user.id, puuid),
    checkAllowance(user.id),
  ]);
  return (
    <>
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
