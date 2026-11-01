"use client";

import { useState, type ReactNode } from "react";
import { BuildView } from "@/components/build-view";
import { PlayerPicker, type PickerPlayer } from "@/components/player-picker";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading, SubHeading } from "@/components/ui/panel-heading";
import type { BuildView as Build } from "@/lib/match-builds";

// "Build and runes" on the Stats tab: one player's items, skill order and
// runes, picked from the ten champion icons, the same views as a profile's
// match row. Everything is worked out on the server, since the match page
// already loads the timeline, so picking someone only changes what shows.
export function BuildAndRunes({
  builds,
  runePages,
  players,
  defaultPlayerId,
}: {
  builds: Record<number, Build>; // keyed by participantId
  runePages: Record<number, ReactNode>; // keyed by participantId
  players: PickerPlayer[];
  defaultPlayerId: number; // the searched player
}) {
  const [playerId, setPlayerId] = useState(defaultPlayerId);
  const build = builds[playerId];

  return (
    <section aria-labelledby="build-heading" className={`${panelClass} flex flex-col gap-5 p-6`}>
      <PanelHeading id="build-heading">Build and runes</PanelHeading>
      <PlayerPicker players={players} selected={playerId} onSelect={setPlayerId} />
      <div className="flex flex-col gap-2">
        <SubHeading>Build</SubHeading>
        {build ? <BuildView build={build} /> : <p className="text-note text-quiet">No build.</p>}
      </div>
      <div className="flex flex-col gap-2">
        <SubHeading>Runes</SubHeading>
        {runePages[playerId]}
      </div>
    </section>
  );
}
