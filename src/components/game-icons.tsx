import Image from "next/image";
import type { ReactNode } from "react";
import {
  championIconUrl,
  itemIconUrl,
  itemName,
  profileIconUrl,
  runeIconUrl,
  summonerSpell,
  summonerSpellIconUrl,
  type DataDragon,
} from "@/lib/ddragon";

// Square game images from Data Dragon: champions, items, summoner spells,
// runes and profile icons. Every one takes `dd`, the result of getDataDragon(), which is
// null when Data Dragon couldn't be reached. Then they draw a plain box of the
// same size instead, so the layout doesn't jump and the page still works.
//
// Images use `unoptimized` because Data Dragon already serves small PNGs from
// a fast CDN. Passing them through Next.js's image optimizer would only add a
// hop and use up Vercel's image quota.

export function ChampionIcon({
  dd,
  name,
  size,
  className = "rounded-xl",
}: {
  dd: DataDragon | null;
  name: string; // championName from match data
  size: number;
  className?: string;
}) {
  if (!dd) {
    return (
      <Placeholder size={size} className={className}>
        <span className="font-display font-bold text-ink-soft" style={{ fontSize: size * 0.4 }}>
          {name.slice(0, 2).toUpperCase()}
        </span>
      </Placeholder>
    );
  }
  // alt="" because the champion's name is always written next to the icon,
  // so a screen reader would otherwise read it twice.
  return <GameImage src={championIconUrl(dd, name)} alt="" size={size} className={className} />;
}

export function ItemIcon({
  dd,
  itemId,
  size,
  className = "rounded-md",
}: {
  dd: DataDragon | null;
  itemId: number; // 0 = empty slot
  size: number;
  className?: string;
}) {
  const name = dd && itemId > 0 ? itemName(dd, itemId) : null;
  if (!dd || !name) return <Placeholder size={size} className={className} />;
  // Items have no text beside them, so the name is the alt text, and `title`
  // shows it as a tooltip on hover.
  return (
    <GameImage
      src={itemIconUrl(dd, itemId)}
      alt={name}
      title={name}
      size={size}
      className={className}
    />
  );
}

// A player's seven item slots as two rows, like the in-game scoreboard:
// slots 1–3 and the trinket (round) on top, slots 4–6 below.
export function ItemSlots({
  dd,
  items,
  size = 26,
}: {
  dd: DataDragon | null;
  items: number[]; // 7 ids, the last one is the trinket
  size?: number;
}) {
  const [a, b, c, d, e, f, trinket] = items;
  return (
    <div aria-label="Items" role="group" className="grid shrink-0 grid-cols-4 gap-[3px]">
      <ItemIcon dd={dd} itemId={a} size={size} />
      <ItemIcon dd={dd} itemId={b} size={size} />
      <ItemIcon dd={dd} itemId={c} size={size} />
      <ItemIcon dd={dd} itemId={trinket} size={size} className="rounded-full" />
      <ItemIcon dd={dd} itemId={d} size={size} />
      <ItemIcon dd={dd} itemId={e} size={size} />
      <ItemIcon dd={dd} itemId={f} size={size} />
    </div>
  );
}

export function SummonerSpellIcon({
  dd,
  spellId,
  size,
  className = "rounded-md",
}: {
  dd: DataDragon | null;
  spellId: number; // summoner1Id or summoner2Id from match data
  size: number;
  className?: string;
}) {
  const spell = dd ? summonerSpell(dd, spellId) : null;
  if (!dd || !spell) return <Placeholder size={size} className={className} />;
  return (
    <GameImage
      src={summonerSpellIconUrl(dd, spell)}
      alt={spell.name}
      title={spell.name}
      size={size}
      className={className}
    />
  );
}

// A rune (like Electrocute) or a rune tree (like Domination), by the id in
// match data's `perks`. Runes are round in the game, so they're drawn round.
export function RuneIcon({
  dd,
  runeId,
  size,
  className = "",
}: {
  dd: DataDragon | null;
  runeId: number;
  size: number;
  className?: string;
}) {
  const rune = dd ? (dd.runes[runeId] ?? dd.runeStyles[runeId]) : null;
  if (!rune) return <Placeholder size={size} className={`rounded-full ${className}`} />;
  return (
    <GameImage
      src={runeIconUrl(rune)}
      alt={rune.name}
      title={rune.name}
      size={size}
      className={`rounded-full ${className}`}
    />
  );
}

// The player's profile picture with their level in a pill along the bottom
// edge. Without Data Dragon it shows the first letter of their name instead.
export function ProfileIcon({
  dd,
  iconId,
  level,
  name,
  size = 96,
}: {
  dd: DataDragon | null;
  iconId: number | null; // null when the summoner lookup failed
  level: number | null;
  name: string;
  size?: number;
}) {
  const frame = "rounded-[20px] border-2 border-ahead";
  return (
    <div className="relative w-fit shrink-0">
      {dd && iconId !== null ? (
        <GameImage src={profileIconUrl(dd, iconId)} alt="" size={size} className={frame} />
      ) : (
        <Placeholder size={size} className={frame}>
          <span
            className="font-display font-bold text-ahead-soft"
            style={{ fontSize: size * 0.45 }}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        </Placeholder>
      )}
      {level !== null && (
        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full border border-line-strong bg-page px-2.5 font-mono text-xs text-ink-soft">
          {level}
        </span>
      )}
    </div>
  );
}

function GameImage({
  src,
  alt,
  title,
  size,
  className,
}: {
  src: string;
  alt: string;
  title?: string;
  size: number;
  className: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      title={title}
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 bg-line ${className}`}
    />
  );
}

function Placeholder({
  size,
  className,
  children,
}: {
  size: number;
  className: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center bg-line ${className}`}
    >
      {children}
    </div>
  );
}
