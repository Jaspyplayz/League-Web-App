import Link from "next/link";
import { ChampionIcon } from "@/components/game-icons";
import { Gap } from "@/components/ui/gap";
import { Panel } from "@/components/ui/panel";
import { byRole, teamOrder } from "@/lib/analyzer/team-analysis";
import { championName, type DataDragon } from "@/lib/ddragon";
import type { Region } from "@/lib/regions";
import type { Participant } from "@/lib/riot/types";
import { participantRiotId, toSlug } from "@/lib/riot-id";
import { POSITION_NAMES } from "./match-header";

// The scoreboard under the board: both teams paired by lane, so you read each
// matchup straight across, with the lane's gold gap in words from your team's
// side. Your own row is tinted, like a selected row. Each player links to their
// own profile. It only draws analyzed games, which are always 5v5.

// 5012 -> "5.0k", 340 -> "340".
function goldSize(size: number): string {
  return size >= 1000 ? `${(size / 1000).toFixed(1)}k` : String(size);
}

export function LaneBoard({
  region,
  dd,
  participants,
  meId,
  opponentId,
}: {
  region: Region;
  dd: DataDragon | null;
  participants: Participant[];
  meId: number;
  opponentId: number | null;
}) {
  const myTeamId = participants.find((p) => p.participantId === meId)?.teamId;
  const [allies, enemies] = teamOrder(myTeamId).map((teamId) =>
    byRole(participants.filter((p) => p.teamId === teamId)),
  );
  const kills = (team: Participant[]) => team.reduce((sum, p) => sum + p.kills, 0);
  const won = allies[0]?.win ?? false;

  return (
    <section aria-label="Scoreboard by lane">
      <Panel className="p-2">
        {/* Both teams' views colour the winner blue and the loser red. */}
        <div className="flex items-center justify-between px-2.5 pb-2 pt-1 text-note text-quiet">
          <span>
            Your team{" "}
            <span className={`font-semibold tabular-nums ${won ? "text-ahead" : "text-behind"}`}>
              {kills(allies)}
            </span>
          </span>
          <span>
            <span className={`font-semibold tabular-nums ${won ? "text-behind" : "text-ahead"}`}>
              {kills(enemies)}
            </span>{" "}
            Enemy team
          </span>
        </div>
        <ul>
          {allies.map((ally, i) => {
            const enemy = enemies[i];
            return (
              <li
                key={ally.participantId}
                className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-2 sm:gap-3 sm:px-2.5 ${
                  ally.participantId === meId ? "bg-select" : ""
                }`}
              >
                <Side
                  region={region}
                  dd={dd}
                  p={ally}
                  tag={ally.participantId === meId ? "You" : null}
                />
                <div className="flex w-[72px] flex-col items-center text-center sm:w-24">
                  <span className="text-xs text-quiet">{POSITION_NAMES[ally.teamPosition]}</span>
                  <Gap
                    you={ally.goldEarned}
                    them={enemy.goldEarned}
                    format={goldSize}
                    className="text-note font-semibold"
                  />
                </div>
                <Side
                  region={region}
                  dd={dd}
                  p={enemy}
                  tag={enemy.participantId === opponentId ? "Opponent" : null}
                  flip
                />
              </li>
            );
          })}
        </ul>
      </Panel>
    </section>
  );
}

// One player: portrait on the outside, champion and tag over their KDA and
// name. The enemy's side is mirrored (`flip`). A phone has room for about 70px
// of text on each side, so the tag takes its own line and the name is left out.
function Side({
  region,
  dd,
  p,
  tag,
  flip = false,
}: {
  region: Region;
  dd: DataDragon | null;
  p: Participant;
  tag: "You" | "Opponent" | null;
  flip?: boolean;
}) {
  const riotId = participantRiotId(p);
  const layout = `flex min-w-0 items-center gap-2 sm:gap-2.5 ${flip ? "flex-row-reverse text-right" : ""}`;
  const who = (
    <>
      <ChampionIcon dd={dd} name={p.championName} size={32} className="rounded-md" />
      <div className="min-w-0">
        <p className="truncate text-note font-medium sm:text-body">
          {tag === "Opponent" && (
            <span className="block text-xs font-medium text-behind sm:mr-1.5 sm:inline">{tag}</span>
          )}
          {championName(dd, p.championName)}
          {tag === "You" && (
            <span className="block text-xs font-medium text-ahead sm:ml-1.5 sm:inline">{tag}</span>
          )}
        </p>
        <p className="truncate text-xs text-quiet underline-offset-2 tabular-nums group-hover:underline">
          {p.kills}/{p.deaths}/{p.assists}
          {p.riotIdGameName && <span className="hidden sm:inline"> · {p.riotIdGameName}</span>}
        </p>
      </div>
    </>
  );
  // The whole side is the link, so it's an easy target.
  return riotId ? (
    <Link href={`/player/${region}/${toSlug(riotId)}`} className={`group rounded-md ${layout}`}>
      {who}
    </Link>
  ) : (
    <div className={layout}>{who}</div>
  );
}
