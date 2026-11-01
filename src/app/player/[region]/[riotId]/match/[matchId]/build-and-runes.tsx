"use client";

import { useState, type ReactNode } from "react";
import { BuildView, SkillOrder } from "@/components/build-view";
import { PlayerPicker, type PickerPlayer } from "@/components/player-picker";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading, SubHeading } from "@/components/ui/panel-heading";
import { ProblemPanel } from "@/components/ui/state-panel";
import { TryAgainButton } from "@/components/ui/try-again-button";
import type { BuildView as Build } from "@/lib/match-builds";

// "Build and runes" on the Stats tab: one player's items, skill order and
// runes, picked from the ten champion icons. Everything is worked out on the
// server, since the match page already loads the timeline, so picking
// someone only changes what shows.
//
// The builds come from the same timeline as the rest of the analysis, so
// they can't fail on their own. What can is Data Dragon, Riot's files of
// item and rune names and pictures: without it the items are blank squares
// and the rune trees can't be drawn. Then a problem panel takes their place,
// the skill order still shows, and the rest of the tab is untouched.
export function BuildAndRunes({
  builds,
  runePages,
  players,
  defaultPlayerId,
  dataDragonFailed,
}: {
  builds: Record<number, Build>; // keyed by participantId
  runePages: Record<number, ReactNode>; // keyed by participantId
  players: PickerPlayer[];
  defaultPlayerId: number; // the searched player
  dataDragonFailed: boolean;
}) {
  const [playerId, setPlayerId] = useState(defaultPlayerId);
  const build = builds[playerId];

  return (
    <section aria-labelledby="build-heading" className={`${panelClass} flex flex-col gap-5 p-6`}>
      <PanelHeading id="build-heading">Build and runes</PanelHeading>
      <PlayerPicker players={players} selected={playerId} onSelect={setPlayerId} />
      {dataDragonFailed ? (
        <>
          <ProblemPanel
            title="Items and runes can't load from Riot right now"
            actions={<TryAgainButton />}
          >
            <p>
              Their names and pictures come from Riot&apos;s Data Dragon, which didn&apos;t answer.
              This is usually brief. The skill order below doesn&apos;t need it.
            </p>
          </ProblemPanel>
          {build && <SkillOrder skills={build.skills} />}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <SubHeading>Build</SubHeading>
            {build ? (
              <BuildView build={build} />
            ) : (
              <p className="text-note text-quiet">No build.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <SubHeading>Runes</SubHeading>
            {runePages[playerId]}
          </div>
        </>
      )}
    </section>
  );
}
