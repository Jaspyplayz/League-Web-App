import type { ReactNode } from "react";
import { ChampionIcon } from "@/components/game-icons";
import type { ChampionLine, ChampionStats } from "@/lib/champion-stats";
import { championName, type DataDragon } from "@/lib/ddragon";
import { ChampionRowGroup } from "./champion-row-group";
import { ChampionSearch } from "./champion-search";

// The Champions tab's table, like op.gg's: a row for all champions together,
// then one per champion, most played first. Each champion's row opens to
// list the enemy champions it faced in the same role (champion-row-group.tsx).
//
// It's wider than a phone, so it scrolls sideways inside its panel with the
// champion column pinned on the left. The panel itself, with the search box
// above the table, is champion-search.tsx.

// Each column's name, and what it means, shown when the pointer rests on it.
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
  { label: "2×", title: "Double kills" },
  { label: "3×", title: "Triple kills" },
  { label: "4×", title: "Quadra kills" },
  { label: "5×", title: "Penta kills" },
];
// The headings and the chevron.
const COLUMNS = HEADINGS.length + 1;

// The pinned first column. Its background has to be solid, or the columns
// scrolling under it would show through, so an open or hovered row is
// `raised` rather than the see-through `select`. It follows the row's hover
// and open states (data-open is set by ChampionRowGroup) at the same speed.
const PINNED =
  "sticky left-0 z-10 bg-panel transition-colors duration-320 ease-out group-hover:bg-raised group-hover:duration-120 group-data-[open=true]:bg-raised motion-reduce:transition-none";

export function ChampionTable({
  stats,
  dd,
  heading,
}: {
  stats: ChampionStats;
  dd: DataDragon | null;
  heading: ReactNode; // "Season 2026", the game count and Load more, above the table
}) {
  const head = (
    <>
      <thead>
        <tr className="border-b border-divider">
          {HEADINGS.map((h, i) => (
            <th
              key={h.label}
              scope="col"
              title={h.title}
              className={`px-2 py-2.5 text-left text-note font-medium whitespace-nowrap text-quiet ${
                h.title ? "cursor-help" : ""
              } ${i === 0 ? `${PINNED} pl-4` : ""}`}
            >
              {h.label}
            </th>
          ))}
          {/* Relative, so the hidden label stays inside the table's scroll box
              instead of widening the whole page on a phone. */}
          <th className="relative w-10">
            <span className="sr-only">Enemy champions</span>
          </th>
        </tr>
      </thead>
      {/* The thicker line sets the total apart from the champions under it. */}
      <tbody className="border-b-2 border-divider">
        <tr>
          <th scope="row" className={`${PINNED} py-2.5 pr-2 pl-4 text-left font-semibold`}>
            <span className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-raised text-note text-quiet">
                All
              </span>
              <span className="whitespace-nowrap">All champions</span>
            </span>
          </th>
          <StatCells line={stats.all} />
          <td />
        </tr>
      </tbody>
    </>
  );

  const champions = stats.champions.map((champion) => {
    const name = championName(dd, champion.championName);
    return {
      name,
      group: (
        <ChampionRowGroup
          key={champion.championName}
          columns={COLUMNS}
          label={`${name}'s games by enemy champion`}
          cells={
            <>
              <th scope="row" className={`${PINNED} py-2.5 pr-2 pl-4 text-left font-medium`}>
                <span className="flex items-center gap-3">
                  <ChampionIcon
                    dd={dd}
                    name={champion.championName}
                    size={32}
                    className="rounded-md"
                  />
                  <span className="max-w-32 truncate max-sm:max-w-24">{name}</span>
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
                  <span className="text-note text-quiet">vs</span>
                  <ChampionIcon
                    dd={dd}
                    name={opponent.championName}
                    size={28}
                    className="rounded-md"
                  />
                  <span className="max-w-28 truncate max-sm:max-w-20">
                    {championName(dd, opponent.championName)}
                  </span>
                </span>
              </th>
              <StatCells line={opponent} />
              <td />
            </tr>
          ))}
        />
      ),
    };
  });

  return <ChampionSearch heading={heading} head={head} champions={champions} />;
}

// Every column after the champion's name. Two lines per cell, like op.gg:
// the headline number, then the detail in quiet text.
function StatCells({ line }: { line: ChampionLine }) {
  const losses = line.games - line.wins;
  const winRate = line.games ? line.wins / line.games : 0;
  return (
    <>
      <Cell
        top={`${line.wins}W ${losses}L`}
        bottom={
          <span className={winRate >= 0.5 ? "text-ahead" : "text-behind"}>
            {Math.round(winRate * 100)}%
          </span>
        }
      />
      <Cell
        top={`${line.kda.toFixed(2)}:1`}
        bottom={`${line.kills.toFixed(1)} / ${line.deaths.toFixed(1)} / ${line.assists.toFixed(1)} (${percent(line.killParticipation)})`}
      />
      <td className="px-2 py-2.5">
        {line.score === null ? (
          <Dash />
        ) : (
          <span className="inline-flex h-7 min-w-9 items-center justify-center rounded-md bg-raised px-1.5 font-semibold">
            {Math.round(line.score)}
          </span>
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

function Cell({ top, bottom }: { top: ReactNode; bottom: ReactNode }) {
  return (
    <td className="px-2 py-2.5 leading-snug whitespace-nowrap">
      <div className="font-medium">{top}</div>
      <div className="text-note text-quiet">{bottom}</div>
    </td>
  );
}

function Multikill({ count }: { count: number }) {
  return <td className="px-2 py-2.5">{count > 0 ? count : <Dash />}</td>;
}

// "+4.2 CS" in blue or "−1.5 CS" in red. A signed number rather than
// "4.2 ahead" (ui/gap.tsx), to keep the column narrow; the heading says what
// it's a lead over.
function CsLead({ lead }: { lead: number }) {
  const rounded = Math.round(lead * 10) / 10;
  if (rounded === 0) return <span className="text-quiet">Even</span>;
  return (
    <span className={rounded > 0 ? "text-ahead" : "text-behind"}>
      {rounded > 0 ? "+" : "−"}
      {Math.abs(rounded).toFixed(1)} CS
    </span>
  );
}

function Dash() {
  return <span className="text-quiet">–</span>;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}
