// The parts of Riot's API responses this app reads. Riot sends many more
// fields; TypeScript only needs to know about the ones we use.
// Reference: https://developer.riotgames.com/apis

export type Account = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

export type Summoner = {
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
};

export type LeagueEntry = {
  queueType: string; // "RANKED_SOLO_5x5" or "RANKED_FLEX_SR"
  tier: string; // "GOLD"
  rank: string; // "II"
  leaguePoints: number;
  wins: number;
  losses: number;
  inactive?: boolean; // hasn't played in a while
};

// league-v4's Master, Grandmaster or Challenger ladder for one queue. Entries carry the PUUID, so no
// account lookup is needed to fetch their games.
export type LeagueList = {
  entries: {
    puuid: string;
    leaguePoints: number;
    wins: number;
    losses: number;
    inactive?: boolean;
  }[];
};

export type Participant = {
  puuid: string;
  // 1 to 10. The match timeline uses this number instead of the PUUID.
  participantId: number;
  // The player's Riot ID when the game was played. Can be missing in old games.
  riotIdGameName?: string;
  riotIdTagline?: string;
  teamId: number; // 100 = blue side, 200 = red side
  championId: number;
  championName: string;
  teamPosition: string; // "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY" or ""
  // Riot's guess at the position from where the player spent the game. Used
  // when teamPosition is empty.
  individualPosition: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  // Damage to turrets, dragons, Baron and so on. Optional so older test data still fits.
  damageDealtToObjectives?: number;
  visionScore: number;
  wardsPlaced: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number; // trinket
  summoner1Id: number; // summoner spells, e.g. 4 = Flash (names come from Data Dragon)
  summoner2Id: number;
  champLevel: number; // level at the end of the game
  // Runes. Missing in some game modes, like Arena.
  perks?: Perks;
  gameEndedInEarlySurrender?: boolean;
  // Multikills and first blood, for the badges on match rows. Optional so
  // older test data still fits; Riot always sends them.
  doubleKills?: number;
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  firstBloodKill?: boolean;
  // A few of Riot's per-game "challenges" numbers, for the jungle stats on
  // Insights. Optional because Riot leaves them out of some games.
  challenges?: {
    enemyJungleMonsterKills?: number; // monsters killed in the enemy jungle
    scuttleCrabKills?: number;
  };
};

// A player's rune page. Every number is a rune id from Data Dragon's
// runesReforged.json, except statPerks, which are the three small stat shards.
export type Perks = {
  statPerks: { offense: number; flex: number; defense: number };
  // Two entries: description "primaryStyle" (keystone first) and "subStyle".
  styles: { description: string; style: number; selections: { perk: number }[] }[];
};

export type Match = {
  metadata: { matchId: string };
  info: {
    platformId: string; // "NA1"
    gameVersion: string; // "16.20.712.3456"
    queueId: number;
    // When the game was made, a little before it started. Both in ms since 1970.
    gameCreation?: number;
    gameStartTimestamp: number;
    gameEndTimestamp?: number;
    // Seconds for games played since late 2021 (when gameEndTimestamp
    // exists), milliseconds for older ones.
    gameDuration: number;
    participants: Participant[];
  };
};

// match-v5 timeline: a snapshot of every player once a minute, plus every
// event in between. Only the fields the analyzer reads are listed.
// See docs/match-analyzer.md, "What's inside a timeline".

export type MapPosition = { x: number; y: number };

export type TimelineParticipantFrame = {
  participantId: number;
  totalGold: number;
  xp: number;
  level: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  position?: MapPosition;
  damageStats?: { totalDamageDoneToChampions: number };
};

// Riot sends dozens of event types with different fields. The trimming step
// (src/lib/analyzer/trim.ts) checks `type` and picks the fields it needs.
export type TimelineEvent = { type: string; timestamp: number } & Record<string, unknown>;

export type TimelineFrame = {
  timestamp: number; // ms since the game started
  // Keyed "1" to "10" by participantId.
  participantFrames: Record<string, TimelineParticipantFrame>;
  events: TimelineEvent[];
};

export type Timeline = {
  metadata: { matchId: string };
  info: {
    frameInterval: number; // 60000: one frame per minute
    frames: TimelineFrame[];
  };
};
