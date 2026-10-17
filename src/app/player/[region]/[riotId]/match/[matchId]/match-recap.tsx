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
        <p className="text-muted">
          <SignInLink className="font-medium text-ahead-soft hover:underline" /> to get a short
          written recap of this game.
        </p>
      )}
    </Panel>
  );
}
