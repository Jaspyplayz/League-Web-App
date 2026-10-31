import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileTabs } from "@/components/profile-tabs";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { SignInLink } from "@/components/sign-in-link";
import { softPanelClass } from "@/components/ui/panel";
import { askEnabled } from "@/lib/ask";
import { checkAllowance, readQuestions } from "@/lib/ask-store";
import { getCurrentUser } from "@/lib/auth";
import { isRegion } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { settle } from "@/lib/riot/client";
import { fromSlug, toSlug } from "@/lib/riot-id";
import { supabaseConfig } from "@/lib/supabase/config";
import { AskBox } from "./ask-box";

// The Ask tab: type a question about this player's games ("why do I lose on
// Viego?") and Claude answers from Turnpoint's analysis of them (see
// src/lib/ask.ts). Anyone signed in can ask, up to 10 questions a day.
// URL: /player/na/Name-TAG/ask.

type Params = Promise<{ region: string; riotId: string }>;

export const metadata = { title: "Ask" };

// The Ask button is a Server Action, which gets this page's time limit.
// Claude reads several games one round at a time, so give it three minutes
// rather than the default.
export const maxDuration = 180;

export default function AskPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-20 pt-7">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Ask params={params} />
      </Suspense>
    </main>
  );
}

async function Ask({ params }: { params: Params }) {
  const { region, riotId } = await params;
  const id = fromSlug(riotId);
  if (!isRegion(region) || !id) notFound();

  // Player data is fetched per request, never at build time.
  await connection();

  const account = await settle(getAccount(region, id));
  if (!account.ok) return <RiotErrorNotice error={account.error} region={region} />;
  if (!account.value) notFound();
  const { puuid, gameName, tagLine } = account.value;
  const playerPath = `/player/${region}/${toSlug(account.value)}`;

  return (
    <>
      <h1 className="font-display text-[52px] font-bold leading-none tracking-[0.01em]">
        {gameName}
        <span className="font-semibold text-placeholder">#{tagLine}</span>
      </h1>
      <ProfileTabs playerPath={playerPath} current="ask" />
      <div className={`${softPanelClass} flex flex-col gap-4 p-6`}>
        <AskContent
          region={region}
          riotId={riotId}
          puuid={puuid}
          playerPath={playerPath}
        />
      </div>
    </>
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
      <span className="font-mono text-[13px] text-faint">{ASK_ILLUSTRATION.label}</span>
      <div className={`${softPanelClass} flex flex-col gap-3 p-6`}>
        <p className="font-semibold text-ink">{ASK_ILLUSTRATION.question}</p>
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
}: {
  region: string;
  riotId: string;
  puuid: string;
  playerPath: string;
}) {
  // Without the API key, sign-in or the database, nobody can ask.
  if (!askEnabled() || !supabaseConfig() || !process.env.DATABASE_URL) {
    return <p className="text-muted">Ask isn&apos;t available right now.</p>;
  }
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted">
          <SignInLink className="font-medium text-ahead-soft hover:underline" /> to ask questions
          about this player&apos;s games, like &ldquo;What do my losses have in common?&rdquo;
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
      {!history.ok && (
        <p className="text-behind">Couldn&apos;t load your past questions. Reload to try again.</p>
      )}
      <AskBox
        region={region}
        riotId={riotId}
        playerPath={playerPath}
        history={history.ok ? history.questions : []}
        left={allowed.ok ? allowed.left : 0}
      />
    </>
  );
}
