import Link from "next/link";
import { ChampionIcon, ItemIcon } from "@/components/game-icons";
import { findPlayer, isAnalyzable } from "@/lib/analyzer";
import { findOpponent } from "@/lib/analyzer/matchup";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatThousands } from "@/lib/match-summary";
import type { Region } from "@/lib/regions";
import type { Match, Participant } from "@/lib/riot/types";
import { participantRiotId, toSlug } from "@/lib/riot-id";

// The panel that opens under a match row on the profile: both teams'
// scoreboard and a link to the full analysis. It's a smaller version of the
// scoreboard on the match page, sized to fit next to the profile's sidebar.
//
// Everything here comes from the match the profile already loaded, so opening
// a row costs no extra Riot calls.
export function MatchDetails({
  region,
  dd,
  match,
  puuid,
  analysisHref,
}: {
  region: Region;
  dd: DataDragon | null;
  match: Match;
  puuid: string; // whose profile this is
  analysisHref: string;
}) {
  const { participants } = match.info;
  const me = findPlayer(match, puuid);
  const opponent = me ? findOpponent(participants, me) : null;
  // Damage bars are relative to the top damage dealer in the whole game.
  const maxDamage = Math.max(1, ...participants.map((p) => p.totalDamageDealtToChampions));

  return (
    <div className="flex flex-col gap-4">
      {[100, 200].map((teamId) => {
        const team = participants.filter((p) => p.teamId === teamId);
        const won = team[0]?.win ?? false;
        const mine = team.some((p) => p.puuid === puuid);
        const kills = team.reduce((sum, p) => sum + p.kills, 0);
        const gold = team.reduce((sum, p) => sum + p.goldEarned, 0);
        return (
          <div key={teamId} className="overflow-x-auto">
            <table className="w-full min-w-[560px] table-fixed border-collapse text-[13px]">
              <caption className="pb-1.5 text-left text-xs text-muted">
                <span
                  className={`font-display text-base font-bold tracking-[0.04em] uppercase ${mine ? "text-ahead" : "text-behind"}`}
                >
                  {teamId === 100 ? "Blue side" : "Red side"} · {won ? "Victory" : "Defeat"}
                </span>
                <span className="ml-3 font-mono">
                  {kills} kills · {formatThousands(gold)} gold
                </span>
              </caption>
              {/* Fixed column widths, so the two teams' tables line up. */}
              <thead>
                <tr className="text-left font-mono text-[10px] tracking-[0.1em] text-faint uppercase">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Player
                  </th>
                  <th scope="col" className="w-[92px] px-2 py-1 font-medium">
                    KDA
                  </th>
                  <th scope="col" className="w-[52px] px-2 py-1 font-medium">
                    CS
                  </th>
                  <th scope="col" className="w-[120px] px-2 py-1 font-medium">
                    Damage
                  </th>
                  <th scope="col" className="w-[172px] py-1 pl-2 font-medium">
                    Items
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.map((p) => (
                  <PlayerRow
                    key={p.participantId}
                    region={region}
                    dd={dd}
                    p={p}
                    tag={
                      p.puuid === puuid
                        ? "You"
                        : p.participantId === opponent?.participantId
                          ? "Opponent"
                          : null
                    }
                    damagePct={(p.totalDamageDealtToChampions / maxDamage) * 100}
                    barColor={mine ? "bg-ahead" : "bg-behind"}
                  />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {isAnalyzable(match) ? (
        <Link
          href={analysisHref}
          className="self-start rounded-lg border border-ahead/40 px-3.5 py-1.5 text-sm font-semibold text-ahead-soft transition-colors hover:bg-ahead/10"
        >
          Full analysis →
        </Link>
      ) : (
        <p className="text-[13px] text-faint">
          This game ended before 15 minutes, too short for a full analysis.
        </p>
      )}
    </div>
  );
}

function PlayerRow({
  region,
  dd,
  p,
  tag,
  damagePct,
  barColor,
}: {
  region: Region;
  dd: DataDragon | null;
  p: Participant;
  tag: "You" | "Opponent" | null;
  damagePct: number;
  barColor: string;
}) {
  const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6];
  const riotId = participantRiotId(p);
  const name = p.riotIdGameName || championName(dd, p.championName);

  const who = (
    <>
      <ChampionIcon dd={dd} name={p.championName} size={26} className="rounded-md" />
      <span className="min-w-0 truncate underline-offset-2 group-hover:text-ink group-hover:underline">
        {name}
      </span>
      {tag && (
        <span
          className={`shrink-0 rounded-full border px-1.5 font-mono text-[9px] tracking-[0.1em] uppercase ${tag === "You" ? "border-ahead-soft text-ahead-soft" : "border-behind text-behind"}`}
        >
          {tag}
        </span>
      )}
    </>
  );

  return (
    <tr className={`border-t border-line ${tag === "You" ? "bg-ahead/10" : ""}`}>
      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
        {riotId ? (
          // Same as the match page's scoreboard: each player links to their
          // own profile, so you can look up anyone you played with or against.
          <Link
            href={`/player/${region}/${toSlug(riotId)}`}
            title={`${riotId.gameName}#${riotId.tagLine} · ${championName(dd, p.championName)}`}
            className="group flex items-center gap-2 rounded-md text-ink-soft"
          >
            {who}
          </Link>
        ) : (
          <div className="flex items-center gap-2 text-ink-soft">{who}</div>
        )}
      </th>
      <td className="px-2 py-1.5 font-mono whitespace-nowrap">
        {p.kills} / {p.deaths} / {p.assists}
      </td>
      <td className="px-2 py-1.5 font-mono">{p.totalMinionsKilled + p.neutralMinionsKilled}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 rounded-sm bg-line" aria-hidden="true">
            <div className={`h-1 rounded-sm ${barColor}`} style={{ width: `${damagePct}%` }} />
          </div>
          <span className="w-9 flex-none text-right font-mono">
            {formatThousands(p.totalDamageDealtToChampions)}
          </span>
        </div>
      </td>
      <td className="py-1.5 pl-2">
        <div role="group" aria-label="Items" className="flex gap-0.5">
          {items.map((id, slot) => (
            // Two of the same item can share an id, so key by slot. The
            // last slot is the trinket, drawn round like in the game.
            <ItemIcon
              key={slot}
              dd={dd}
              itemId={id}
              size={20}
              className={slot === 6 ? "ml-1 rounded-full" : "rounded"}
            />
          ))}
        </div>
      </td>
    </tr>
  );
}
