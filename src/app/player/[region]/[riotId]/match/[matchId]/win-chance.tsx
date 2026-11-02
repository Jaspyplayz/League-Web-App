import { SubHeading } from "@/components/ui/panel-heading";
import { formatClock } from "@/lib/analyzer/format";
import { ALL_RANKS, type WinChanceModel } from "@/lib/analyzer/win-chance";
import { formatPercent } from "@/lib/percent";
import { describeSwing, type MatchWinChance } from "@/lib/win-chance";
import { MomentRow } from "./turning-points";

// Your team's chance of winning at every minute, from Turnpoint's trained win
// chance model (docs/win-chance.md), shows on the board's strip. These are the
// words that go with it. It shows what the game looked like at each moment; it
// doesn't judge any decision. The Biggest swings are lettered A, B, C so they
// can't be mixed up with the numbered turning points.

export const SWING_LETTERS = "ABCDEFGHIJ";

// Where the win chance comes from, under the board.
export function WinChanceNote({ model }: { model: WinChanceModel }) {
  return (
    <p className="text-note text-quiet">
      Win chance comes from a model trained on {model.games.toLocaleString("en-US")} ranked{" "}
      {model.rank === ALL_RANKS ? "games" : `${model.rank} games, this player's rank`}: how often
      teams in the same spot (gold, XP, kills, towers, dragons, buffs) went on to win.
    </p>
  );
}

// The minutes that moved the win chance most, lettered to match the strip.
export function BiggestSwings({ swings }: Pick<MatchWinChance, "swings">) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SubHeading id="win-chance-swings">Biggest swings</SubHeading>
      <ol aria-labelledby="win-chance-swings" className="flex flex-col">
        {swings.map((s, i) => {
          const { title, detail } = describeSwing(s);
          return (
            <MomentRow
              key={s.timestamp}
              symbol={SWING_LETTERS[i]}
              good={s.to > s.from}
              clock={formatClock(s.timestamp)}
              title={title}
              change={`${formatPercent(s.from)} → ${formatPercent(s.to)}`}
              detail={detail}
            />
          );
        })}
      </ol>
    </div>
  );
}
