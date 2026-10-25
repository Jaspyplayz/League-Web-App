import { Suspense } from "react";
import { SignInLink } from "@/components/sign-in-link";
import { Panel } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { getCurrentUser } from "@/lib/auth";
import { recapsEnabled } from "@/lib/recap";
import { readRecap } from "@/lib/recap-store";
import type { Region } from "@/lib/regions";
import { supabaseConfig } from "@/lib/supabase/config";
import { RecapButton } from "./recap-button";
import { RecapText } from "./recap-text";

type Props = { region: Region; matchId: string; puuid: string };

const RECAP_ILLUSTRATION = {
  label: "Illustration · not a real game",
  headline: "Two ganks and a river fight spent your lead.",
  points: [
    {
      time: "8:10",
      text: "Lee Sin ganked your lane and you died, turning a small gold lead into a deficit.",
    },
    {
      time: "14:40",
      text: "The same gank landed again, and the other team took dragon on it.",
    },
    {
      time: "22:05",
      text: "A fight in the river spent the lead you had just taken back.",
    },
  ],
} as const;

// RecapText always prints "Written by AI (Claude) from the stats on this
// page." That sentence is false for an illustration.
function RecapIllustration() {
  return (
    <>
      <span className="font-mono text-[13px] text-faint">{RECAP_ILLUSTRATION.label}</span>
      <p className="text-body font-semibold text-ink">{RECAP_ILLUSTRATION.headline}</p>
      <ul className="flex flex-col divide-y divide-line">
        {RECAP_ILLUSTRATION.points.map((point) => (
          <li key={point.time} className="flex gap-4 py-2">
            <span className="w-24 shrink-0 font-mono text-sm leading-6 text-ahead-soft tabular-nums">
              {point.time}
            </span>
            <span className="text-ink-soft">{point.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// A few sentences on the game, written by Claude from the analyzer's numbers
// (see src/lib/recap.ts). Shows the saved recap to everyone; anyone signed in
// can ask for one on a game that doesn't have one yet. Streams in after the
// analysis because it reads the database and the sign-in cookie.
export function MatchRecap(props: Props) {
  return (
    <Suspense>
      <RecapPanel {...props} />
    </Suspense>
  );
}

async function RecapPanel({ region, matchId, puuid }: Props) {
  const saved = await readRecap(matchId, puuid);
  // Without the API key or sign-in, nobody can write one, so an empty panel
  // would only be noise.
  if (!saved && (!recapsEnabled() || !supabaseConfig())) return null;
  const user = saved ? null : await getCurrentUser();

  return (
    <Panel className="flex flex-col gap-3 p-6">
      <PanelHeading>Game recap</PanelHeading>
      {saved ? (
        <RecapText headline={saved.headline} detail={saved.detail} />
      ) : user ? (
        <RecapButton region={region} matchId={matchId} puuid={puuid} />
      ) : (
        <>
          <p className="text-muted">
            <SignInLink className="font-medium text-ahead-soft hover:underline" /> to get a short
            written recap of this game.
          </p>
          <RecapIllustration />
        </>
      )}
    </Panel>
  );
}
