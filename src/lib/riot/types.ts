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
};

export type Participant = {
  puuid: string;
  teamId: number; // 100 = blue side, 200 = red side
  championName: string;
  teamPosition: string; // "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY" or ""
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number; // trinket
  gameEndedInEarlySurrender?: boolean;
};

export type Match = {
  metadata: { matchId: string };
  info: {
    queueId: number;
    gameStartTimestamp: number; // ms since 1970
    gameEndTimestamp?: number;
    // Seconds for games played since late 2021 (when gameEndTimestamp
    // exists), milliseconds for older ones.
    gameDuration: number;
    participants: Participant[];
  };
};
