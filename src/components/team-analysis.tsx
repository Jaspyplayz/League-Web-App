import { ChampionIcon } from "@/components/game-icons";
import { StatBar } from "@/components/ui/stat-bar";
import { teamAnalysis, type TeamStat } from "@/lib/analyzer/team-analysis";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatThousands } from "@/lib/match-summary";
import type { Participant } from "@/lib/riot/types";

// The match panel's Team analysis tab, laid out like op.gg's: one card per
// stat (kills, gold, damage dealt and taken, wards, CS). Your team is on the
// left and the enemy on the right, each in role order, so every row lines a
// champion up with the one they played against. The ring in the middle
// splits the two teams' totals.
//
// The winning team is blue and the losing team red. Your row has a solid
// outline and your opponent's a dashed one, so you can find both either way.
export function TeamAnalysis({
  dd,
  participants,
  youId,
  opponentId,
}: {
  dd: DataDragon | null;
  participants: Participant[];
  youId?: number; // participantId of the profile's player
  opponentId?: number; // the enemy in the same role, when there is one
}) {
  const myTeamId = participants.find((p) => p.participantId === youId)?.teamId;
  return (
    <div className="@container flex flex-col gap-3">
      <Legend />
      {/* One card per row in the match panel, so the bars have room for their
          numbers; two side by side only when there's space for both. */}
      <div className="grid gap-3 @3xl:grid-cols-2">
        {teamAnalysis(participants, myTeamId).map((stat) => (
          <StatCard key={stat.key} dd={dd} stat={stat} youId={youId} opponentId={opponentId} />
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-ahead" aria-hidden="true" />
        Winning team
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-behind" aria-hidden="true" />
        Losing team
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm border border-ink" aria-hidden="true" />
        You
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm border border-dashed border-faint" aria-hidden="true" />
        Your opponent
      </li>
    </ul>
  );
}

function StatCard({
  dd,
  stat,
  youId,
  opponentId,
}: {
  dd: DataDragon | null;
  stat: TeamStat;
  youId?: number;
  opponentId?: number;
}) {
  const [left, right] = stat.teams;

  const column = (team: TeamStat["teams"][number]) => (
    <ul className="flex min-w-0 flex-col gap-1">
      {team.players.map((p) => {
        const mark =
          p.participantId === youId
            ? "border-ink"
            : p.participantId === opponentId
              ? "border-dashed border-faint"
              : "border-transparent";
        return (
          <li
            key={p.participantId}
            className={`soft-round-sm flex items-center gap-1.5 border p-px ${mark}`}
          >
            <ChampionIcon dd={dd} name={p.championName} size={20} className="rounded" />
            <span className="sr-only">
              {championName(dd, p.championName)}
              {p.participantId === youId ? " (you)" : ""}
              {p.participantId === opponentId ? " (your opponent)" : ""}:
            </span>
            {/* Every bar in the card shares one scale (the biggest player). */}
            <StatBar
              value={p.value}
              max={stat.max}
              label={formatThousands(p.value)}
              tone={team.won ? "ahead" : "behind"}
            />
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="soft-round flex flex-col gap-3 border border-line bg-surface/60 p-4">
      <h4 className="text-center text-[13px] font-semibold text-ink-soft">{stat.label}</h4>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {column(left)}
        <TotalsRing left={left} right={right} label={stat.label} />
        {column(right)}
      </div>
    </section>
  );
}

// A ring split between the two teams' totals, with both numbers inside:
// your team's on top, the enemy's below.
function TotalsRing({
  left,
  right,
  label,
}: {
  left: TeamStat["teams"][number];
  right: TeamStat["teams"][number];
  label: string;
}) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const total = left.total + right.total;
  // Half and half when neither team has any (say, no wards in ARAM).
  const leftShare = total > 0 ? left.total / total : 0.5;
  const color = (won: boolean) => (won ? "var(--color-ahead)" : "var(--color-behind)");

  return (
    <svg
      viewBox="0 0 72 72"
      className="size-[72px]"
      role="img"
      aria-label={`${label}: your team ${left.total}, enemy team ${right.total}`}
    >
      <circle cx="36" cy="36" r={r} fill="none" stroke={color(right.won)} strokeWidth="6" />
      {/* Your team's share, drawn clockwise from 12 o'clock. */}
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={color(left.won)}
        strokeWidth="6"
        strokeDasharray={`${leftShare * circumference} ${circumference}`}
        transform="rotate(-90 36 36)"
      />
      <g className="font-mono" fontSize="10" textAnchor="middle">
        <text x="36" y="32" fill={color(left.won)}>
          {formatThousands(left.total)}
        </text>
        <line x1="24" y1="37" x2="48" y2="37" stroke="var(--color-line-strong)" />
        <text x="36" y="49" fill={color(right.won)}>
          {formatThousands(right.total)}
        </text>
      </g>
    </svg>
  );
}
