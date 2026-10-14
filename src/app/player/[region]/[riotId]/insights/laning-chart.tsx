import Link from "next/link";
import { PanelHeading } from "@/components/ui/panel-heading";
import { formatSigned } from "@/lib/analyzer/format";
import type { GameTrend, Trends } from "@/lib/analyzer/trends";
import { panelClass } from "@/components/ui/panel";

// Bars never get taller than this many gold, so one stomp doesn't flatten
// the rest, and never shorter, so +40 doesn't look like a lead of thousands.
const MIN_SCALE = 500;
const MAX_SCALE = 3000;
// With more games than this, bars get thin, so the gaps shrink and the W/L
// letters under each bar are left out (each bar's tooltip still says it).
const DENSE_GAMES = 30;

// Gold difference at 10 minutes in each game, oldest on the left. Bars above
// the line are games you were ahead in (blue), below are games you were
// behind in (amber). Each bar links to that game's analysis.
export function LaningChart({
  games,
  laning,
  label,
  matchPath,
}: {
  games: GameTrend[];
  laning: Trends["laning"];
  label: (championName: string) => string;
  matchPath: (matchId: string) => string;
}) {
  const withGold = games.filter((g) => g.goldAt10 !== null);
  const biggest = Math.max(...withGold.map((g) => Math.abs(g.goldAt10!)), 0);
  const scale = Math.min(Math.max(biggest, MIN_SCALE), MAX_SCALE);
  const dense = withGold.length > DENSE_GAMES;

  return (
    <section aria-labelledby="laning-heading" className="flex flex-col gap-3.5">
      <PanelHeading id="laning-heading">Early game: gold at 10 minutes</PanelHeading>
      <div className={`${panelClass} flex flex-col gap-5 p-[22px]`}>
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <Stat
            label="Ahead at 10"
            value={`${laning.aheadInGold} of ${laning.games} games`}
            tone={laning.aheadInGold > laning.behindInGold ? "ahead" : "behind"}
          />
          <Stat
            label="Average gold vs opponent"
            value={formatSigned(laning.averageGold)}
            tone={laning.averageGold >= 0 ? "ahead" : "behind"}
          />
          {laning.csGames > 0 && (
            <Stat
              label="Average CS vs opponent"
              value={formatSigned(laning.averageCs)}
              tone={laning.averageCs >= 0 ? "ahead" : "behind"}
            />
          )}
        </dl>

        <ol
          className={`flex h-56 items-stretch ${dense ? "gap-px" : "gap-1.5"}`}
          aria-label="Gold difference at 10 minutes, per game"
        >
          {withGold.map((g) => {
            const diff = g.goldAt10!;
            const pct = (Math.min(Math.abs(diff), scale) / scale) * 100;
            const result = g.win ? "Win" : "Loss";
            return (
              <li key={g.matchId} className="flex min-w-0 flex-1">
                <Link
                  href={matchPath(g.matchId)}
                  title={`${label(g.championName)}, ${result}: ${formatSigned(diff)} gold at 10`}
                  className="group flex flex-1 flex-col rounded-md hover:bg-line"
                >
                  <span className="sr-only">
                    {label(g.championName)}, {result}, {formatSigned(diff)} gold at 10 minutes
                  </span>
                  {/* Top half: leads grow up from the middle line. */}
                  <span className="flex flex-1 items-end justify-center" aria-hidden="true">
                    {diff > 0 && (
                      <span
                        className="w-full max-w-7 rounded-t-sm bg-ahead"
                        style={{ height: `${pct}%` }}
                      />
                    )}
                  </span>
                  <span className="h-px bg-faint" aria-hidden="true" />
                  {/* Bottom half: deficits grow down from it. */}
                  <span className="flex flex-1 items-start justify-center" aria-hidden="true">
                    {diff < 0 && (
                      <span
                        className="w-full max-w-7 rounded-b-sm bg-behind"
                        style={{ height: `${pct}%` }}
                      />
                    )}
                  </span>
                  {!dense && (
                    <span
                      aria-hidden="true"
                      className={`pt-1.5 text-center font-mono text-[11px] ${g.win ? "text-ahead-soft" : "text-behind"}`}
                    >
                      {g.win ? "W" : "L"}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="flex justify-between font-mono text-xs text-faint" aria-hidden="true">
          <span>← Older</span>
          <span>Newer →</span>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ahead" | "behind" }) {
  const color = tone === "ahead" ? "text-ahead" : tone === "behind" ? "text-behind" : "";
  return (
    <div>
      <dt className="text-[13px] text-faint">{label}</dt>
      <dd className={`font-mono text-xl ${color}`}>{value}</dd>
    </div>
  );
}
