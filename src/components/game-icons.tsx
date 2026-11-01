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
  className = "rounded-sm",
}: {
  dd: DataDragon | null;
  name: string; // championName from match data
  size: number;
  className?: string;
}) {
  if (!dd) {
    return (
      <Placeholder size={size} className={className}>
        <span className="font-semibold text-quiet" style={{ fontSize: size * 0.32 }}>
          {name.slice(0, 2)}
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
  className = "rounded-sm",
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

export function SummonerSpellIcon({
  dd,
  spellId,
  size,
  className = "rounded-sm",
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

// The player's profile picture with their level on a small tag over the
// bottom edge. Without Data Dragon it shows the first letter of their name
// instead. 6px corners, like every portrait in the Review board look.
export function ProfileIcon({
  dd,
  iconId,
  level,
  name,
  size = 88,
}: {
  dd: DataDragon | null;
  iconId: number | null; // null when the summoner lookup failed
  level: number | null;
  name: string;
  size?: number;
}) {
  return (
    // Spans rather than divs, so the icon could sit inside a button.
    <span className="relative block w-fit shrink-0">
      {dd && iconId !== null ? (
        <GameImage src={profileIconUrl(dd, iconId)} alt="" size={size} className="rounded-md" />
      ) : (
        <Placeholder size={size} className="rounded-md">
          <span className="font-semibold text-quiet" style={{ fontSize: size * 0.4 }}>
            {name.charAt(0).toUpperCase()}
          </span>
        </Placeholder>
      )}
      {level !== null && (
        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-sm bg-page px-1.5 text-xs leading-[18px] font-medium tabular-nums text-main">
          {level}
        </span>
      )}
    </span>
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
      className={`shrink-0 bg-raised ${className}`}
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
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center bg-raised ${className}`}
    >
      {children}
    </span>
  );
}

// Riot's ranked emblem for a tier, from Community Dragon, which mirrors the
// game client's images (Data Dragon doesn't include them). alt="" because the
// tier is always written next to it.
export function RankEmblem({ tier, size }: { tier: string; size: number }) {
  return (
    <Image
      src={`https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`}
      alt=""
      width={size}
      height={size}
      unoptimized
      className="shrink-0 object-contain"
    />
  );
}
