import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import type { TurningPoint } from "@/lib/analyzer/turning-points";
import type { MatchWinChance } from "@/lib/win-chance";
import { TurningPoints } from "./turning-points";
import { BiggestSwings } from "./win-chance";

// "How the game went": the turning points (the numbers on the board's gold
// chart) and the biggest swings (the letters on its win-chance strip). When a
// game has neither, the board says so under the strip, and this isn't drawn.
export function GameTimeline({
  turningPoints,
  swings,
}: {
  turningPoints: TurningPoint[];
  swings: MatchWinChance["swings"];
}) {
  if (turningPoints.length === 0 && swings.length === 0) return null;
  return (
    <section aria-labelledby="game-timeline" className={`${panelClass} flex flex-col gap-4 p-5`}>
      <PanelHeading id="game-timeline">How the game went</PanelHeading>
      {turningPoints.length > 0 && <TurningPoints points={turningPoints} />}
      {swings.length > 0 && <BiggestSwings swings={swings} />}
    </section>
  );
}
