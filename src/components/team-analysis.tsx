import { ChampionIcon } from "@/components/game-icons";
import { teamAnalysis, type TeamStat } from "@/lib/analyzer/team-analysis";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatThousands } from "@/lib/match-summary";
import type { Participant } from "@/lib/riot/types";

// The match panel's Team analysis tab: one card per stat (kills, gold,
// damage dealt and taken, wards, CS). Each card splits the two teams'
// totals in one bar, then shows every player's share. The winning team is
// blue and the losing team amber, as everywhere on the site.
export function TeamAnalysis({
  dd,
  participants,
}: {
  dd: DataDragon | null;
  participants: Participant[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {teamAnalysis(participants).map((stat) => (
        <StatCard key={stat.key} dd={dd} stat={stat} />
      ))}
    </div>
  );
}

function StatCard({ dd, stat }: { dd: DataDragon | null; stat: TeamStat }) {
  const [blue, red] = stat.teams;
  const total = blue.total + red.total;
  // Half and half when neither team has any (say, no wards in ARAM).
  const blueShare = total > 0 ? (blue.total / total) * 100 : 50;

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface/60 p-3">
      <h4 className="font-mono text-[10px] tracking-[0.1em] text-faint uppercase">{stat.label}</h4>

      <div className="flex items-center gap-2 font-mono text-[13px]">
        <span className={tone(blue.won).text}>{formatThousands(blue.total)}</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-sm" aria-hidden="true">
          <div className={tone(blue.won).bar} style={{ width: `${blueShare}%` }} />
          <div className={`flex-1 ${tone(red.won).bar}`} />
        </div>
        <span className={tone(red.won).text}>{formatThousands(red.total)}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {stat.teams.map((team) => (
          <ul key={team.teamId} className="flex flex-col gap-1">
            {team.players.map((p) => (
              <li key={p.participantId} className="flex items-center gap-1.5">
                <ChampionIcon dd={dd} name={p.championName} size={18} className="rounded" />
                <span className="sr-only">{championName(dd, p.championName)}</span>
                <div className="h-1.5 flex-1 rounded-sm bg-line" aria-hidden="true">
                  <div
                    className={`h-1.5 rounded-sm ${tone(team.won).bar}`}
                    style={{ width: `${(p.value / stat.max) * 100}%` }}
                  />
                </div>
                <span className="w-9 text-right font-mono text-[11px] text-ink-soft">
                  {formatThousands(p.value)}
                </span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}

function tone(won: boolean) {
  return won ? { text: "text-ahead", bar: "bg-ahead" } : { text: "text-behind", bar: "bg-behind" };
}
