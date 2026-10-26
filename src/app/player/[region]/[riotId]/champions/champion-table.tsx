import type { ReactNode } from "react";
import { ChampionIcon } from "@/components/game-icons";
import { panelClass } from "@/components/ui/panel";
import { SegmentBar } from "@/components/ui/segment-bar";
import type { ChampionLine, ChampionStats } from "@/lib/champion-stats";
import { championName, type DataDragon } from "@/lib/ddragon";
import { ChampionRowGroup } from "./champion-row-group";

// The Champions tab's table, like op.gg's: a row for all champions together,
// then one per champion, most played first. Each champion's row opens to
// list the enemy champions it faced in the same role (champion-row-group.tsx).
//
// It's wider than a phone, so it scrolls sideways inside its box with the
// champion column pinned on the left.

const HEADINGS: { label: string; title?: string }[] = [
  { label: "Champion" },
  { label: "Played", title: "Wins and losses, and the win rate" },
  {
    label: "KDA",
    title:
      "(Kills + assists) / deaths, then average kills / deaths / assists and kill participation",
  },
  { label: "Score", title: "Average game score, 0 to 100" },
  {
    label: "Laning",
    title: "Average CS lead at 10 minutes over your lane opponent, and how often you were ahead",
  },
  { label: "Damage", title: "Damage to champions per minute, and your share of your team's" },
  { label: "Wards", title: "Wards placed / wards killed per game, then control wards placed" },
  { label: "CS", title: "CS per game, and per minute" },
  { label: "Gold", title: "Gold per game, and per minute" },
];
// Under one "Multikills" heading, so the four columns can stay narrow.
const MULTIKILLS = [
  { label: "2×", title: "Double kills" },
  { label: "3×", title: "Triple kills" },
  { label: "4×", title: "Quadra kills" },
  { label: "5×", title: "Penta kills" },
];
// The headings, the multikills and the chevron.
const COLUMNS = HEADINGS.length + MULTIKILLS.length + 1;

// The pinned first column. Its background has to be solid, or the columns
// scrolling under it would show through; it follows the row's hover and
// open states (data-open is set by ChampionRowGroup).
const PINNED =
  "sticky left-0 z-10 bg-surface group-hover:bg-surface-hover group-data-[open=true]:bg-surface-hover";

export function ChampionTable({ stats, dd }: { stats: ChampionStats; dd: DataDragon | null }) {
  return (
    <div className={`${panelClass} overflow-x-auto`}>
      <table className="w-full min-w-[940px] border-collapse text-note">
        <thead className="font-mono text-label tracking-[0.08em] text-faint uppercase">
          <tr>
            {HEADINGS.map((h, i) => (
              <th
                key={h.label}
                scope="col"
                rowSpan={2}
                title={h.title}
                className={`px-1.5 py-3 text-center font-medium ${i === 0 ? `${PINNED} pl-4 text-left` : ""}`}
              >
                {h.label}
              </th>
            ))}
            <th scope="colgroup" colSpan={MULTIKILLS.length} className="px-1.5 pt-3 font-medium">
              Multikills
            </th>
            <th rowSpan={2} />
          </tr>
          <tr>
            {MULTIKILLS.map((h) => (
              <th key={h.label} scope="col" title={h.title} className="px-1.5 pb-3 font-medium">
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="border-t border-line">
          <tr className="group">
            <th scope="row" className={`${PINNED} py-2.5 pr-2 pl-4 text-left`}>
              <span className="flex items-center gap-3">
                <span className="soft-round-sm flex size-9 shrink-0 items-center justify-center bg-line-strong font-display text-label font-bold text-ink-soft">
                  ALL
                </span>
                <span className="font-display text-body font-semibold tracking-[0.04em] uppercase">
                  All champions
                </span>
              </span>
            </th>
            <StatCells line={stats.all} />
            <td />
          </tr>
        </tbody>
        {stats.champions.map((champion, i) => {
          const name = championName(dd, champion.championName);
          return (
            <ChampionRowGroup
              key={champion.championName}
              columns={COLUMNS}
              label={`${name}'s games by enemy champion`}
              cells={
                <>
                  <th scope="row" className={`${PINNED} py-2.5 pr-2 pl-4 text-left`}>
                    <span className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-right font-mono text-label text-placeholder max-sm:hidden">
                        {i + 1}
                      </span>
                      <ChampionIcon
                        dd={dd}
                        name={champion.championName}
                        size={36}
                        className="soft-round-sm"
                      />
                      <span className="max-w-32 truncate font-display text-body font-semibold tracking-[0.04em] uppercase max-sm:max-w-20">
                        {name}
                      </span>
                    </span>
                  </th>
                  <StatCells line={champion} />
                </>
              }
              opponents={champion.opponents.map((opponent) => (
                <tr key={opponent.championName} className="bg-page">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-page py-2 pr-2 pl-12 text-left font-normal max-sm:pl-4"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="font-mono text-label text-placeholder">vs</span>
                      <ChampionIcon
                        dd={dd}
                        name={opponent.championName}
                        size={28}
                        className="soft-round-sm"
                      />
                      <span className="max-w-28 truncate font-medium text-ink-soft max-sm:max-w-20">
                        {championName(dd, opponent.championName)}
                      </span>
                    </span>
                  </th>
                  <StatCells line={opponent} />
                  <td />
                </tr>
              ))}
            />
          );
        })}
      </table>
    </div>
  );
}

// Every column after the champion's name. Two lines per cell, like op.gg:
// the headline number, then the detail in a fainter colour.
function StatCells({ line }: { line: ChampionLine }) {
  const losses = line.games - line.wins;
  const winRate = line.games ? line.wins / line.games : 0;
  return (
    <>
      <td className="px-1.5 py-2">
        <div className="flex items-center gap-2">
          <WinLossBar wins={line.wins} losses={losses} />
          <span className={`w-9 font-mono ${winRate >= 0.5 ? "text-ahead" : "text-behind"}`}>
            {Math.round(winRate * 100)}%
          </span>
        </div>
      </td>
      <Cell
        top={<span className="font-semibold text-ink">{line.kda.toFixed(2)}:1</span>}
        bottom={`${line.kills.toFixed(1)} / ${line.deaths.toFixed(1)} / ${line.assists.toFixed(1)} (${percent(line.killParticipation)})`}
      />
      <td className="px-1.5 py-2">
        {line.score === null ? (
          <Dash />
        ) : (
          <div className="mx-auto flex w-12 flex-col items-center gap-1">
            <span className="font-mono font-semibold text-ink">{Math.round(line.score)}</span>
            <SegmentBar
              filled={line.score / 100}
              segments={10}
              className="h-1 w-full gap-[2px]"
              label={`Average game score ${Math.round(line.score)} out of 100`}
            />
          </div>
        )}
      </td>
      <Cell
        top={line.csLeadAt10 === null ? <Dash /> : <CsLead lead={line.csLeadAt10} />}
        bottom={line.aheadAt10 === null ? "" : `${percent(line.aheadAt10)} ahead`}
      />
      <Cell
        top={`${Math.round(line.damagePerMin).toLocaleString("en-US")}/min`}
        bottom={percent(line.damageShare)}
      />
      <Cell
        top={
          line.wardsPlaced === null || line.wardsKilled === null ? (
            <Dash />
          ) : (
            `${line.wardsPlaced.toFixed(1)} / ${line.wardsKilled.toFixed(1)}`
          )
        }
        bottom={line.controlWards === null ? "" : `${line.controlWards.toFixed(1)} control`}
      />
      <Cell top={Math.round(line.cs).toString()} bottom={`${line.csPerMin.toFixed(1)}/min`} />
      <Cell
        top={Math.round(line.gold).toLocaleString("en-US")}
        bottom={`${Math.round(line.goldPerMin)}/min`}
      />
      <Multikill count={line.doubleKills} />
      <Multikill count={line.tripleKills} />
      <Multikill count={line.quadraKills} />
      <Multikill count={line.pentaKills} />
    </>
  );
}

function Cell({ top, bottom }: { top: ReactNode; bottom: string }) {
  return (
    <td className="px-1.5 py-2 text-center whitespace-nowrap">
      <div className="font-mono text-ink-soft">{top}</div>
      <div className="text-label text-faint">{bottom}</div>
    </td>
  );
}

function Multikill({ count }: { count: number }) {
  return (
    <td className="px-1.5 py-2 text-center font-mono">
      {count > 0 ? <span className="text-ink-soft">{count}</span> : <Dash />}
    </td>
  );
}

// Wins in blue and losses in red, side by side, each as wide as its share.
// Never so thin that its count can't fit.
function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  return (
    <div
      role="img"
      aria-label={`${wins} wins, ${losses} losses`}
      className="flex h-5 w-20 overflow-hidden rounded-md font-mono text-label font-semibold text-page"
    >
      {wins > 0 && (
        <span
          className="flex min-w-8 basis-0 items-center bg-ahead px-1.5"
          style={{ flexGrow: wins }}
        >
          {wins}W
        </span>
      )}
      {losses > 0 && (
        <span
          className="flex min-w-8 basis-0 items-center justify-end bg-behind px-1.5"
          style={{ flexGrow: losses }}
        >
          {losses}L
        </span>
      )}
    </div>
  );
}

// "+4.2 CS" in blue or "−1.5 CS" in red. A signed number rather than
// "4.2 ahead" (ui/gap.tsx), to keep the column narrow; the heading says what
// it's a lead over.
function CsLead({ lead }: { lead: number }) {
  const rounded = Math.round(lead * 10) / 10;
  if (rounded === 0) return <span className="text-muted">Even</span>;
  return (
    <span className={rounded > 0 ? "text-ahead" : "text-behind"}>
      {rounded > 0 ? "+" : "−"}
      {Math.abs(rounded).toFixed(1)} CS
    </span>
  );
}

function Dash() {
  return <span className="text-placeholder">–</span>;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}
