// Personal records: your best this season at a few early-game stats, per
// role and per champion in that role, like "most CS at 10 in your 23 Lee Sin
// games". The 60-second review says when a game set one, and the Champions
// tab lists them all (see docs/records.md).
//
// Only stats that go with winning count, so a record is worth chasing:
// farming, a gold lead over your opponent, hitting level 6 early, not dying
// early and getting takedowns early. Kills, damage or a long game's CS would
// pad the list with records that mostly say the game went long.
//
// Like the rest of the analyzer, these are pure functions: a game's match and
// timeline in, numbers out. src/lib/record-store.ts saves each game's
// numbers so a season of games can be compared without reading every
// timeline again.

import type { Match } from "@/lib/riot/types";
import { EARLY_DEATH_MS } from "./deaths";
import { formatClock } from "./format";
import { findPlayer, isAnalyzable } from "./index";
import { findOpponent, playedPosition, playerAt, snapshotAt } from "./matchup";
import type { ChampionKill, TrimmedTimeline } from "./trim";

export type RecordStat = "csAt10" | "goldAt15" | "level6" | "earlyDeaths" | "earlyTakedowns";

// One game's numbers, from one player's side.
export type RecordGame = {
  matchId: string;
  startedAt: number; // ms since 1970, as Riot gives it
  queueId: number;
  championName: string;
  // Riot's position name ("JUNGLE"), or "" in games without roles (ARAM).
  position: string;
  win: boolean;
  // Null when the game can't tell: it ended before that minute, there was no
  // opponent in your role, or you never hit level 6.
  stats: Record<RecordStat, number | null>;
};

type StatInfo = {
  id: RecordStat;
  // "Most CS at 10": the record's name.
  title: string;
  // For the season table's column headings.
  short: string;
  lowerIsBetter: boolean;
  format: (value: number) => string;
  // Roles the record means something for. Supports aren't meant to farm.
  skip?: string[];
};

export const RECORD_STATS: StatInfo[] = [
  {
    id: "csAt10",
    title: "Most CS at 10",
    short: "CS at 10",
    lowerIsBetter: false,
    format: (v) => `${v} CS`,
    skip: ["UTILITY"],
  },
  {
    id: "goldAt15",
    title: "Biggest gold lead at 15",
    short: "Gold lead at 15",
    lowerIsBetter: false,
    format: (v) => `${Math.abs(v).toLocaleString("en-US")} ${v < 0 ? "behind" : "ahead"}`,
  },
  {
    id: "level6",
    title: "Earliest level 6",
    short: "Level 6",
    lowerIsBetter: true,
    format: (v) => formatClock(v * 1000),
  },
  {
    id: "earlyDeaths",
    title: "Fewest deaths before 14:00",
    short: "Deaths before 14:00",
    lowerIsBetter: true,
    format: (v) => String(v),
  },
  {
    id: "earlyTakedowns",
    title: "Most takedowns before 14:00",
    short: "Takedowns before 14:00",
    lowerIsBetter: false,
    format: (v) => String(v),
  },
];

// A record needs at least this many games with the stat, counting the one
// that set it. Otherwise your first few games on a new champion would each
// set a record, which is padding, not progress.
export const MIN_RECORD_GAMES = 5;

// Each level gives one skill point, so the sixth point is when you hit 6
// (the same rule as Habits' "Level 6 first").
const LEVEL_6_POINT = 6;

// The game's numbers for one player. Null when they aren't in the game or it
// was too short to analyze (under 15 minutes).
export function recordGame(
  match: Match,
  timeline: TrimmedTimeline,
  puuid: string,
): RecordGame | null {
  const me = findPlayer(match, puuid);
  if (!me || !isAnalyzable(match)) return null;
  const { frames, events } = timeline;
  const meId = me.participantId;
  const opponent = findOpponent(match.info.participants, me);

  // Frame 10 is the 10 minute mark, unless it's the end of the game.
  const at10 = frames.length - 1 > 10 ? playerAt(frames[10], meId) : null;
  const at15 = opponent ? snapshotAt(frames, meId, opponent.participantId, 15) : null;
  const level6 = events.filter((e) => e.type === "SKILL_LEVEL_UP" && e.participantId === meId)[
    LEVEL_6_POINT - 1
  ];
  const earlyKills = events.filter(
    (e): e is ChampionKill => e.type === "CHAMPION_KILL" && e.timestamp < EARLY_DEATH_MS,
  );

  return {
    matchId: match.metadata.matchId,
    startedAt: match.info.gameStartTimestamp,
    queueId: match.info.queueId,
    championName: me.championName,
    position: playedPosition(me),
    win: me.win,
    stats: {
      csAt10: at10 ? at10.cs : null,
      goldAt15: at15 ? at15.you.gold - at15.opponent.gold : null,
      level6: level6 ? Math.round(level6.timestamp / 1000) : null,
      earlyDeaths: earlyKills.filter((k) => k.victimId === meId).length,
      earlyTakedowns: earlyKills.filter(
        (k) => k.killerId === meId || k.assistingParticipantIds.includes(meId),
      ).length,
    },
  };
}

// The best game at one stat.
export type Best = {
  value: number;
  matchId: string;
  // How many games had the stat, the best one included.
  games: number;
};

// Strictly better: a tie doesn't beat a record, so the first game to reach
// a number keeps it.
function beats(stat: StatInfo, a: number, b: number): boolean {
  return stat.lowerIsBetter ? a < b : a > b;
}

// The best game in `games` at a stat. Null with fewer than `min` games that
// have it, or when the stat doesn't apply to the role.
export function bestAt(
  stat: StatInfo,
  games: RecordGame[],
  min = MIN_RECORD_GAMES,
): Best | null {
  const known = games
    .filter((g) => g.stats[stat.id] !== null && !stat.skip?.includes(g.position))
    .sort((a, b) => a.startedAt - b.startedAt);
  if (known.length < min) return null;
  let best = known[0];
  for (const g of known) if (beats(stat, g.stats[stat.id]!, best.stats[stat.id]!)) best = g;
  return { value: best.stats[stat.id]!, matchId: best.matchId, games: known.length };
}

// A record a game set: it beat every earlier game this season in its role,
// or on its champion in that role.
export type RecordLine = {
  stat: RecordStat;
  // The champion's name for a champion record, null for a role record.
  championName: string | null;
  position: string;
  value: number;
  previous: number;
  // Games with the stat when the record was set, this one included.
  games: number;
  // The best since, if a later game beat it. Null if it still stands.
  since: number | null;
};

// The records `game` set, at most one per stat. `others` is the player's
// other games to compare with (the season's, in the same queue); the game
// itself is skipped if it's among them. A role record is shown over a
// champion one, since it's the harder one to beat.
export function recordsSetBy(game: RecordGame, others: RecordGame[]): RecordLine[] {
  if (!game.position) return [];
  const sameRole = others.filter(
    (g) => g.matchId !== game.matchId && g.position === game.position,
  );
  const sameChampion = sameRole.filter((g) => g.championName === game.championName);

  const lines: RecordLine[] = [];
  for (const stat of RECORD_STATS) {
    const value = game.stats[stat.id];
    if (value === null || stat.skip?.includes(game.position)) continue;
    const line =
      setRecord(stat, game, value, sameRole, null) ??
      setRecord(stat, game, value, sameChampion, game.championName);
    if (line) lines.push(line);
  }
  return lines;
}

function setRecord(
  stat: StatInfo,
  game: RecordGame,
  value: number,
  pool: RecordGame[],
  championName: string | null,
): RecordLine | null {
  const known = pool.filter((g) => g.stats[stat.id] !== null);
  const earlier = known.filter((g) => g.startedAt < game.startedAt);
  // `min` of 1: the count of games is checked here, with this game in it.
  const before = bestAt(stat, earlier, 1);
  if (!before || earlier.length + 1 < MIN_RECORD_GAMES) return null;
  if (!beats(stat, value, before.value)) return null;

  const after = bestAt(stat, known.filter((g) => g.startedAt > game.startedAt), 1);
  const since = after && beats(stat, after.value, value) ? after.value : null;
  return {
    stat: stat.id,
    championName,
    position: game.position,
    value,
    previous: before.value,
    // While it stands it's the best of every game; once beaten, of the games
    // up to it.
    games: since === null ? known.length + 1 : earlier.length + 1,
    since,
  };
}

// "jungle" in "your 23 jungle games".
export const ROLE_WORDS: Record<string, string> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "mid",
  BOTTOM: "bot",
  UTILITY: "support",
};

export function statInfo(id: RecordStat): StatInfo {
  return RECORD_STATS.find((s) => s.id === id)!;
}

// "Most CS at 10 in your 23 Lee Sin games this season: 82 CS, beating 76 CS."
// Once beaten: "... in your first 12 Lee Sin games ... You've since reached
// 85 CS." `label` turns Riot's champion name into the display name.
export function recordSentence(line: RecordLine, label: (name: string) => string): string {
  const stat = statInfo(line.stat);
  const what = line.championName ? label(line.championName) : ROLE_WORDS[line.position];
  const first = line.since === null ? "" : "first ";
  const sentence =
    `${stat.title} in your ${first}${line.games} ${what} games this season: ` +
    `${stat.format(line.value)}, beating ${stat.format(line.previous)}.`;
  return line.since === null ? sentence : `${sentence} You've since reached ${stat.format(line.since)}.`;
}

// The season's records for the Champions tab: one group per role you played
// at least MIN_RECORD_GAMES games in, most played first, each with its own
// records and those of every champion you played that often in it.
export type RoleRecords = {
  position: string;
  games: number;
  best: Partial<Record<RecordStat, Best>>;
  champions: { championName: string; games: number; best: Partial<Record<RecordStat, Best>> }[];
};

export function seasonRecords(games: RecordGame[]): RoleRecords[] {
  const bests = (played: RecordGame[]) =>
    Object.fromEntries(
      RECORD_STATS.flatMap((stat) => {
        const best = bestAt(stat, played);
        return best ? [[stat.id, best]] : [];
      }),
    ) as Partial<Record<RecordStat, Best>>;

  const byRole = Map.groupBy(
    games.filter((g) => g.position),
    (g) => g.position,
  );
  return [...byRole]
    .filter(([, played]) => played.length >= MIN_RECORD_GAMES)
    .map(([position, played]) => ({
      position,
      games: played.length,
      best: bests(played),
      champions: [...Map.groupBy(played, (g) => g.championName)]
        .filter(([, onChampion]) => onChampion.length >= MIN_RECORD_GAMES)
        .map(([championName, onChampion]) => ({
          championName,
          games: onChampion.length,
          best: bests(onChampion),
        }))
        .sort((a, b) => b.games - a.games),
    }))
    .sort((a, b) => b.games - a.games);
}
