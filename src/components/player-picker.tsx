"use client";

import type { ReactNode } from "react";
import { teamOrder } from "@/lib/analyzer/team-analysis";

export type PickerPlayer = {
  participantId: number;
  teamId: number;
  ally: boolean; // on the searched player's team
  won: boolean; // on the winning team, which decides the ring color
  label: string; // "Ahri, Player", for the button's accessible name
  icon: ReactNode; // the champion icon, drawn on the server
};

// Ten champion icons, your team then the enemy's, to pick whose build or
// runes to show. The picked one gets a ring in its team's color: blue for the
// winners, red for the losers, like the scoreboards. Used by a profile's
// match row (match-tabs.tsx) and the match page's Stats tab.
export function PlayerPicker({
  players,
  selected,
  onSelect,
}: {
  players: PickerPlayer[];
  selected: number;
  onSelect: (participantId: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {teamOrder(players.find((p) => p.ally)?.teamId).map((teamId) => (
        <div key={teamId} className="flex gap-1.5">
          {players
            .filter((p) => p.teamId === teamId)
            .map((p) => (
              <button
                key={p.participantId}
                type="button"
                aria-pressed={p.participantId === selected}
                aria-label={p.label}
                title={p.label}
                onClick={() => onSelect(p.participantId)}
                className={`rounded-md p-0.5 transition-opacity ${p.participantId === selected ? (p.won ? "ring-2 ring-ahead" : "ring-2 ring-behind") : "opacity-50 hover:opacity-100"}`}
              >
                {p.icon}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
