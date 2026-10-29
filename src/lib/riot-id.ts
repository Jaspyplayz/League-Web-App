// Riot IDs look like "GameName#TAG". Game names are 3-16 characters and may
// contain spaces; tag lines are 3-5 letters or digits.
// https://support-leagueoflegends.riotgames.com/hc/en-us/articles/360041788533

export type RiotId = { gameName: string; tagLine: string };

const GAME_NAME = /^.{3,16}$/u;
const TAG_LINE = /^[\p{L}\p{N}]{3,5}$/u;

export function parseRiotId(input: string): RiotId | null {
  const hash = input.lastIndexOf("#");
  if (hash === -1) return null;
  const gameName = input.slice(0, hash).trim();
  const tagLine = input.slice(hash + 1).trim();
  if (!GAME_NAME.test(gameName) || !TAG_LINE.test(tagLine)) return null;
  return { gameName, tagLine };
}

// A player's Riot ID from match data, or null when it's missing or invalid.
// Old games and some bots have no Riot ID, so there's no profile to link to.
export function participantRiotId(p: {
  riotIdGameName?: string;
  riotIdTagline?: string;
}): RiotId | null {
  if (!p.riotIdGameName || !p.riotIdTagline) return null;
  return parseRiotId(`${p.riotIdGameName}#${p.riotIdTagline}`);
}

// URL slugs use "GameName-TAG". Tag lines never contain "-", so the last
// dash always splits the two parts even if the game name has one.
export function toSlug({ gameName, tagLine }: RiotId): string {
  return encodeURIComponent(`${gameName}-${tagLine}`);
}

// Whether `path` is a player's page in `region`, as the profile writes it:
// "/player/na/" and then toSlug's encoded Riot ID. Encoding leaves no "/",
// "?" or "#", so a link built on it can't point anywhere else.
export function isPlayerPath(region: string, path: string): boolean {
  const prefix = `/player/${region}/`;
  return path.startsWith(prefix) && /^[^/?#\s]+$/.test(path.slice(prefix.length));
}

export function fromSlug(slug: string): RiotId | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null;
  }
  const dash = decoded.lastIndexOf("-");
  if (dash === -1) return null;
  return parseRiotId(`${decoded.slice(0, dash)}#${decoded.slice(dash + 1)}`);
}
