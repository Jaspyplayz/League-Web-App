// The numbers behind the profile's Champions tab: one line per champion over
// the season's games, like op.gg's champion stats, and under each champion
// one line per enemy champion faced in the same role. Pure (games in, lines
// out), so it's easy to test; src/lib/champion-store.ts loads the games.

import { gameScores, roleOf, type ScoreGame, type ScoreModel } from "@/lib/analyzer/score";
import { kdaRatio } from "@/lib/match-summary";
import { REMAKE_SECONDS } from "@/lib/season";

// One player's line of a game's scoreboard, as stored in match_participants.
// The stats added in migration 0014 can be null in older games that lacked
// them; a line then averages over the games that have them.
export type StatsPlayer = {
  participantId: number;
  puuid: string;
  teamId: number;
  championName: string;
  teamPosition: string;
  individualPosition: string | null;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  damageToChampions: number;
  damageTaken: number | null;
  objectiveDamage: number | null;
  visionScore: number;
  earlySurrender: boolean | null;
  wardsPlaced: number | null;
  wardsKilled: number | null;
  controlWards: number | null;
  doubleKills: number | null;
  tripleKills: number | null;
  quadraKills: number | null;
  pentaKills: number | null;
  csAt10: number | null;
};

export type StatsGame = {
  matchId: string;
  queueId: number;
  durationS: number;
  players: StatsPlayer[];
};

// What one row of the table shows. Averages are per game.
export type ChampionLine = {
  championName: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number; // (kills + assists) / deaths over all the games, like the profile
  killParticipation: number; // 0 to 1
  score: number | null; // game score, 0 to 100; null if no game could be scored
  // Laning: CS at 10 minutes minus the lane opponent's, and the share of
  // games you were ahead. Null without an opponent or Riot's 10 minute stats.
  csLeadAt10: number | null;
  aheadAt10: number | null; // 0 to 1
  damagePerMin: number;
  damageShare: number; // of your team's damage to champions, 0 to 1
  wardsPlaced: number | null;
  wardsKilled: number | null;
  controlWards: number | null;
  cs: number;
  csPerMin: number;
  gold: number;
  goldPerMin: number;
  // Totals, not averages, like op.gg.
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
};

export type ChampionStats = {
  all: ChampionLine; // every champion together, the table's first row
  champions: (ChampionLine & { opponents: ChampionLine[] })[];
};

// One of the player's games, with what the lines are built from.
type PlayedGame = {
  me: StatsPlayer;
  opponent: StatsPlayer | null;
  minutes: number;
  teamKills: number;
  teamDamage: number;
  score: number | null;
};

// The player's stats in `games`, most played champion first. `queueIds`
// keeps one game mode, as the profile's tabs do; null is every mode.
export function championStats(
  games: StatsGame[],
  puuid: string,
  queueIds: number[] | null,
  model: ScoreModel,
): ChampionStats {
  const played = games.flatMap((game) => {
    if (queueIds !== null && !queueIds.includes(game.queueId)) return [];
    const me = game.players.find((p) => p.puuid === puuid);
    // Remakes didn't really happen, so they don't count, as elsewhere.
    if (!me || isRemake(game, me)) return [];
    return [playedGame(game, me, model)];
  });

  const champions = [...Map.groupBy(played, (g) => g.me.championName)].map(
    ([championName, ofChampion]) => ({
      ...line(championName, ofChampion),
      opponents: [
        ...Map.groupBy(
          ofChampion.filter((g) => g.opponent !== null),
          (g) => g.opponent!.championName,
        ),
      ]
        .map(([opponentName, against]) => line(opponentName, against))
        .sort(mostPlayed),
    }),
  );

  return { all: line("", played), champions: champions.sort(mostPlayed) };
}

// Riot's remake flag, or a game too short to be anything else.
function isRemake(game: StatsGame, me: StatsPlayer): boolean {
  return me.earlySurrender === true || game.durationS < REMAKE_SECONDS;
}

function playedGame(game: StatsGame, me: StatsPlayer, model: ScoreModel): PlayedGame {
  const team = game.players.filter((p) => p.teamId === me.teamId);
  const role = roleOf({
    teamPosition: me.teamPosition,
    individualPosition: me.individualPosition ?? "",
  });
  const opponent =
    role === null
      ? null
      : (game.players.find(
          (p) =>
            p.teamId !== me.teamId &&
            roleOf({
              teamPosition: p.teamPosition,
              individualPosition: p.individualPosition ?? "",
            }) === role,
        ) ?? null);
  return {
    me,
    opponent,
    minutes: game.durationS / 60,
    teamKills: sum(team.map((p) => p.kills)),
    teamDamage: sum(team.map((p) => p.damageToChampions)),
    score: myScore(game, me, model),
  };
}

// The game score needs a few numbers the older rows may lack; such a game
// just has no score.
function myScore(game: StatsGame, me: StatsPlayer, model: ScoreModel): number | null {
  if (game.players.some((p) => p.damageTaken === null || p.individualPosition === null))
    return null;
  const scoreGame: ScoreGame = {
    matchId: game.matchId,
    durationS: game.durationS,
    players: game.players.map((p) => ({
      participantId: p.participantId,
      teamId: p.teamId,
      teamPosition: p.teamPosition,
      individualPosition: p.individualPosition ?? "",
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      // The score only ever adds these two together.
      totalMinionsKilled: p.cs,
      neutralMinionsKilled: 0,
      goldEarned: p.goldEarned,
      totalDamageDealtToChampions: p.damageToChampions,
      totalDamageTaken: p.damageTaken ?? 0,
      damageDealtToObjectives: p.objectiveDamage ?? 0,
      visionScore: p.visionScore,
      gameEndedInEarlySurrender: p.earlySurrender ?? false,
    })),
  };
  const scores = gameScores(scoreGame, model);
  return scores?.find((s) => s.participantId === me.participantId)?.score ?? null;
}

function line(championName: string, games: PlayedGame[]): ChampionLine {
  const total = (pick: (g: PlayedGame) => number) => sum(games.map(pick));
  const perGame = (pick: (g: PlayedGame) => number) =>
    games.length ? total(pick) / games.length : 0;
  const minutes = total((g) => g.minutes);
  const perMin = (pick: (g: PlayedGame) => number) => (minutes > 0 ? total(pick) / minutes : 0);
  // An average over only the games that have the number.
  const known = (pick: (g: PlayedGame) => number | null) => average(games.map(pick));

  const kills = total((g) => g.me.kills);
  const deaths = total((g) => g.me.deaths);
  const assists = total((g) => g.me.assists);
  const leads = games.flatMap((g) =>
    g.me.csAt10 !== null && g.opponent?.csAt10 != null ? [g.me.csAt10 - g.opponent.csAt10] : [],
  );

  return {
    championName,
    games: games.length,
    wins: games.filter((g) => g.me.win).length,
    kills: perGame((g) => g.me.kills),
    deaths: perGame((g) => g.me.deaths),
    assists: perGame((g) => g.me.assists),
    kda: kdaRatio(kills, deaths, assists),
    killParticipation: perGame((g) => (g.me.kills + g.me.assists) / Math.max(1, g.teamKills)),
    score: known((g) => g.score),
    csLeadAt10: average(leads),
    aheadAt10: leads.length ? leads.filter((lead) => lead > 0).length / leads.length : null,
    damagePerMin: perMin((g) => g.me.damageToChampions),
    damageShare: perGame((g) => g.me.damageToChampions / Math.max(1, g.teamDamage)),
    wardsPlaced: known((g) => g.me.wardsPlaced),
    wardsKilled: known((g) => g.me.wardsKilled),
    controlWards: known((g) => g.me.controlWards),
    cs: perGame((g) => g.me.cs),
    csPerMin: perMin((g) => g.me.cs),
    gold: perGame((g) => g.me.goldEarned),
    goldPerMin: perMin((g) => g.me.goldEarned),
    doubleKills: total((g) => g.me.doubleKills ?? 0),
    tripleKills: total((g) => g.me.tripleKills ?? 0),
    quadraKills: total((g) => g.me.quadraKills ?? 0),
    pentaKills: total((g) => g.me.pentaKills ?? 0),
  };
}

// Most games first; between champions played equally, more wins first.
function mostPlayed(a: ChampionLine, b: ChampionLine): number {
  return b.games - a.games || b.wins - a.wins;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Null when there's nothing to average, so the table can show a dash.
function average(xs: (number | null)[]): number | null {
  const present = xs.filter((x): x is number => x !== null);
  return present.length ? sum(present) / present.length : null;
}
