import Link from "next/link";
import { ChampionIcon, ItemSlots, SummonerSpellIcon } from "@/components/game-icons";
import { championName, type DataDragon } from "@/lib/ddragon";
import { formatDuration, timeAgo, type MatchSummary } from "@/lib/match-summary";

// One game in the player's match list: result, champion and spells, KDA, CS
// and items. Render it inside a <ul>. Pass `href` to make the whole row a
// link (for example to that match's analysis page); without it the row is
// plain content.
export function MatchRow({
  match: m,
  dd,
  now,
  href,
}: {
  match: MatchSummary;
  dd: DataDragon | null;
  now: number; // the current time, for "2h ago"
  href?: string;
}) {
  const result = m.remake ? "Remake" : m.win ? "Win" : "Loss";
  const resultColor = m.remake ? "text-faint" : m.win ? "text-ahead" : "text-behind";
  const row =
    "flex flex-wrap items-center gap-x-[22px] gap-y-3.5 rounded-[14px] border border-line-strong bg-surface px-[18px] py-3.5";

  const content = (
    <>
      <div className="flex w-[92px] shrink-0 flex-col text-xs whitespace-nowrap text-faint">
        <span className={`font-display text-xl font-bold tracking-wider uppercase ${resultColor}`}>
          {result}
        </span>
        <span>{m.queue}</span>
        <span className="font-mono">
          {timeAgo(m.startedAt, now)} · {formatDuration(m.durationS)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 basis-[150px] items-center gap-3">
        <div className="flex shrink-0 gap-1">
          <ChampionIcon dd={dd} name={m.championName} size={48} />
          <div className="flex flex-col gap-1">
            <SummonerSpellIcon dd={dd} spellId={m.spells[0]} size={22} />
            <SummonerSpellIcon dd={dd} spellId={m.spells[1]} size={22} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{championName(dd, m.championName)}</p>
          {m.position && <p className="text-[13px] text-faint">{m.position}</p>}
        </div>
      </div>

      <div className="w-[104px] shrink-0 font-mono whitespace-nowrap">
        <p>
          {m.kills} / {m.deaths} / {m.assists}
        </p>
        <p className="text-xs text-faint">{m.kda.toFixed(1)} KDA</p>
      </div>

      <div className="w-[84px] shrink-0 font-mono whitespace-nowrap">
        <p>{m.cs} CS</p>
        <p className="text-xs text-faint">{m.csPerMin.toFixed(1)}/min</p>
      </div>

      <ItemSlots dd={dd} items={m.items} />

      {href && <ChevronRight />}
    </>
  );

  return (
    <li>
      {href ? (
        <Link href={href} className={`${row} transition-colors hover:bg-[#171c24]`}>
          {content}
        </Link>
      ) : (
        <div className={row}>{content}</div>
      )}
    </li>
  );
}

function ChevronRight() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="ml-auto shrink-0 text-placeholder"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
