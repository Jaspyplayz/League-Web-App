import Link from "next/link";
import { ChampionIcon, ItemIcon } from "@/components/game-icons";
import { PanelHeading } from "@/components/ui/panel-heading";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatThousands } from "@/lib/match-summary";
import type { Region } from "@/lib/regions";
import type { Participant } from "@/lib/riot/types";
import { participantRiotId, toSlug } from "@/lib/riot-id";

// Both teams' end-of-game numbers, blue side first. Each player's name links
// to their own profile, so you can look up anyone you played with or against.
export function Scoreboard({
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
  // Damage bars are relative to the top damage dealer in the whole game.
  const maxDamage = Math.max(1, ...participants.map((p) => p.totalDamageDealtToChampions));

  return (
    <section aria-labelledby="scoreboard-heading" className="flex flex-col gap-3.5">
      <PanelHeading id="scoreboard-heading">Scoreboard</PanelHeading>
      {[100, 200].map((teamId) => {
        const team = participants.filter((p) => p.teamId === teamId);
        const won = team[0]?.win ?? false;
        const tone = team.some((p) => p.participantId === meId) ? "ahead" : "behind";
        const kills = team.reduce((sum, p) => sum + p.kills, 0);
        const gold = team.reduce((sum, p) => sum + p.goldEarned, 0);
        return (
          <div
            key={teamId}
            className="overflow-x-auto rounded-2xl border border-line-strong bg-surface"
          >
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <caption className="px-5 pb-2.5 pt-4 text-left text-sm text-muted">
                <span
                  className={`font-display text-xl font-bold uppercase tracking-[0.04em] ${tone === "ahead" ? "text-ahead" : "text-behind"}`}
                >
                  {teamId === 100 ? "Blue side" : "Red side"} · {won ? "Victory" : "Defeat"}
                </span>
                <span className="ml-3.5 font-mono text-[13px]">
                  {kills} kills · {formatThousands(gold)} gold
                </span>
              </caption>
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
                  <th scope="col" className="px-5 py-2 font-medium">
                    Player
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    KDA
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    CS
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Gold
                  </th>
                  <th scope="col" className="w-[200px] px-3 py-2 font-medium">
                    Damage to champions
                  </th>
                  <th scope="col" className="py-2 pl-3 pr-5 font-medium">
                    Items
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.map((p) => (
                  <Row
                    key={p.participantId}
                    region={region}
                    dd={dd}
                    p={p}
                    tag={
                      p.participantId === meId
                        ? "You"
                        : p.participantId === opponentId
                          ? "Opponent"
                          : null
                    }
                    damagePct={(p.totalDamageDealtToChampions / maxDamage) * 100}
                    barColor={tone === "ahead" ? "bg-ahead" : "bg-behind"}
                  />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}

function Row({
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
  const name = [p.riotIdGameName, p.riotIdTagline].filter(Boolean).join("#");
  const riotId = participantRiotId(p);

  const who = (
    <>
      <ChampionIcon dd={dd} name={p.championName} size={36} className="rounded-[9px]" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{championName(dd, p.championName)}</span>
          {tag && (
            <span
              className={`rounded-full border px-2 font-mono text-[10px] uppercase tracking-[0.1em] ${tag === "You" ? "border-ahead-soft text-ahead-soft" : "border-behind text-behind"}`}
            >
              {tag}
            </span>
          )}
        </div>
        <div className="text-[13px] text-faint underline-offset-2 group-hover:text-ink group-hover:underline">
          {name}
        </div>
      </div>
    </>
  );

  return (
    <tr className={`border-t border-line ${tag === "You" ? "bg-ahead/10" : ""}`}>
      <th scope="row" className="px-5 py-2.5 text-left font-normal">
        {riotId ? (
          // The whole cell (icon, champion and name) is the link, so it's an
          // easy target; the name underlines on hover to show it's clickable.
          <Link
            href={`/player/${region}/${toSlug(riotId)}`}
            className="group flex items-center gap-3 rounded-lg"
          >
            {who}
          </Link>
        ) : (
          <div className="flex items-center gap-3">{who}</div>
        )}
      </th>
      <td className="px-3 py-2.5 font-mono">
        {p.kills} / {p.deaths} / {p.assists}
      </td>
      <td className="px-3 py-2.5 font-mono">{p.totalMinionsKilled + p.neutralMinionsKilled}</td>
      <td className="px-3 py-2.5 font-mono">{formatThousands(p.goldEarned)}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 flex-1 rounded-sm bg-line" aria-hidden="true">
            <div className={`h-1.5 rounded-sm ${barColor}`} style={{ width: `${damagePct}%` }} />
          </div>
          <span className="w-11 flex-none text-right font-mono">
            {formatThousands(p.totalDamageDealtToChampions)}
          </span>
        </div>
      </td>
      <td className="py-2.5 pl-3 pr-5">
        <div role="group" aria-label="Items" className="flex gap-[3px]">
          {items.map((id, slot) => (
            // Two of the same item can share an id, so key by slot. The
            // last slot is the trinket, drawn round like in the game.
            <ItemIcon
              key={slot}
              dd={dd}
              itemId={id}
              size={24}
              className={slot === 6 ? "ml-1 rounded-full" : "rounded-[5px]"}
            />
          ))}
        </div>
      </td>
    </tr>
  );
}
