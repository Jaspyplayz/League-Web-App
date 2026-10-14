import { Suspense } from "react";
import { SignInLink } from "@/components/sign-in-link";
import { Panel } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { getCurrentUser } from "@/lib/auth";
import { readMatchNote } from "@/lib/match-note-store";
import type { Region } from "@/lib/regions";
import { supabaseConfig } from "@/lib/supabase/config";
import { NotesForm } from "./notes-form";

type Props = { region: Region; matchId: string };

// A private notes box at the bottom of the match page, for writing down what
// to do differently next time. It depends on who's signed in (cookies), so it
// streams in after the analysis.
export function MatchNotes(props: Props) {
  return (
    <Suspense>
      <Notes {...props} />
    </Suspense>
  );
}

async function Notes({ region, matchId }: Props) {
  if (!supabaseConfig()) return null;
  const user = await getCurrentUser();

  return (
    <Panel className="flex flex-col gap-3 p-6">
      <PanelHeading>Your notes</PanelHeading>
      {user ? (
        <NotesForm
          region={region}
          matchId={matchId}
          savedText={(await readMatchNote(user.id, matchId)) ?? ""}
        />
      ) : (
        <p className="text-muted">
          <SignInLink className="font-medium text-ahead-soft hover:underline" /> to keep private
          notes on this game, like what you&apos;d do differently.
        </p>
      )}
    </Panel>
  );
}
