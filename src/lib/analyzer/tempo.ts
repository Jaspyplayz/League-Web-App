// The tempo timeline (beta): for a jungler, an estimate of which jungler had
// the tempo at each minute of the game, next to what each of them did with it.
//
// Tempo, the way junglers use the word, is the time advantage: the jungler who
// has just spent their gold on items, is alive and has the levels can make the
// next play, while the one who is dead, or still carrying the gold from their
// last few camps, has to farm, recall or give way. Riot doesn't record tempo,
// so this estimates it from what it does record, once a minute:
//
// - Items: gold each jungler has already spent on items. Riot gives each
//   player's total gold and unspent gold every minute; total minus unspent is
//   what they've spent. Timelines saved before unspent gold was kept get an
//   estimate from their shop visits instead (see itemGoldAt).
// - Levels: each level counts as LEVEL_GOLD gold.
// - Alive: a dead jungler has no tempo until they respawn. Riot records the
//   moment of each death; the respawn time comes from the game's death timer
//   formula.
//
// The jungler whose items plus levels are worth at least TEMPO_LEAD more is
// "up tempo". docs/tempo.md explains how these numbers were checked against
// real games.
//
// Like the jungle map and the gank log, it lays out the situation and never
// grades a decision. Whether to fight, farm or back depends on things Riot
// doesn't record (waves, vision, cooldowns, health), and Riot's policies rule
// out tools that tell players what to do.

import type { MapPosition } from "@/lib/riot/types";
import { formatClock, formatGap } from "./format";
import type { ObjectiveKind } from "./objectives";
import type { ChampionKill, EliteMonsterKill, TrimmedFrame, TrimmedTimeline } from "./trim";

// How much one level is worth, in gold, and how big the combined lead has to
// be to count as up tempo. Set from the study in docs/tempo.md.
export const LEVEL_GOLD = 300;
export const TEMPO_LEAD = 500;

// Purchases this close together are one shop visit.
const SAME_VISIT_MS = 30_000;
// A purchase this soon after respawning still counts as shopping after a
// death rather than after a recall.
const AFTER_RESPAWN_MS = 15_000;
// Holding at least this much unspent gold is worth pointing out: it's about
// a component item that hasn't been bought yet.
export const HOLDING_GOLD = 700;

export type TempoTone = "ahead" | "behind" | "even"; // from your point of view

// One jungler at one minute mark.
export type JunglerState = {
  participantId: number;
  alive: boolean;
  // When a dead jungler is back, by the death timer formula. Null when alive.
  respawnAt: number | null;
  level: number;
  gold: number; // total earned so far
  itemGold: number; // spent on items so far
  unspentGold: number; // earned but not spent yet
  // Their last shop visit at or before this minute. Null before the first.
  lastShop: number | null;
  cs: number;
  position: MapPosition | null;
};

// Something a jungler did between one minute mark and the next.
export type Activity =
  | { type: "shop"; timestamp: number; afterDeath: boolean }
  // A kill they got (killed) or helped with (assist).
  | {
      type: "takedown";
      timestamp: number;
      victimId: number;
      killed: boolean;
      position: MapPosition | null;
    }
  | { type: "died"; timestamp: number; killerId: number; position: MapPosition | null }
  // An epic monster they landed the last hit on (killed) or helped with.
  | { type: "objective"; timestamp: number; kind: ObjectiveKind; killed: boolean }
  // CS gained over the minute: jungle camps, plus any minions.
  | { type: "farm"; cs: number };

export type TempoMinute = {
  timestamp: number;
  tone: TempoTone;
  // Your item gold lead plus LEVEL_GOLD per level of lead. Negative when the
  // enemy jungler is ahead.
  lead: number;
  you: JunglerState;
  them: JunglerState;
  // Players alive on each team at the minute mark.
  alive: { ours: number; theirs: number };
  // What each jungler did from this minute mark until the next one.
  next: { until: number; you: Activity[]; them: Activity[] };
};

// When an epic monster was up. Dragons, Elder and Baron come back after
// they're taken, so they appear once per spawn.
export type ObjectiveWindow = {
  kind: "dragon" | "elder" | "grubs" | "herald" | "baron";
  spawnsAt: number;
  // When it was taken, or null if it despawned or was still up at the end.
  takenAt: number | null;
  // True when your team took it (for grubs, most of them). Null if nobody did.
  ours: boolean | null;
  // When it stopped being up: taken, despawned or the game ended.
  endsAt: number;
};

export type TempoTimeline = {
  meId: number;
  enemyId: number;
  minutes: TempoMinute[];
  objectives: ObjectiveWindow[];
  // False when this game's timeline was saved before Riot's unspent gold was
  // kept, so item gold is estimated from shop visits.
  exactItemGold: boolean;
};

type Player = { participantId: number; teamId: number };

// The tempo timeline for `meId` against the enemy jungler `enemyId`.
// `players` maps every participantId to their team.
export function tempoTimeline(
  timeline: TrimmedTimeline,
  players: Player[],
  meId: number,
  enemyId: number,
): TempoTimeline {
  const { frames, events } = timeline;
  const teamOf = new Map(players.map((p) => [p.participantId, p.teamId]));
  const myTeam = teamOf.get(meId)!;
  const deaths = deathSpans(timeline);
  const visits = new Map(
    [meId, enemyId].map((id) => [id, shopVisits(timeline, id, deaths)]),
  );
  const kills = events.filter((e): e is ChampionKill => e.type === "CHAMPION_KILL");
  const monsters = events.filter((e): e is EliteMonsterKill => e.type === "ELITE_MONSTER_KILL");

  const state = (i: number, id: number): JunglerState => {
    const frame = frames[i];
    const p = frame.players[id - 1];
    const t = frame.timestamp;
    const theirVisits = visits.get(id)!;
    const itemGold = itemGoldAt(frames, i, id, theirVisits);
    const death = deathAt(deaths, id, t);
    return {
      participantId: id,
      alive: !death,
      respawnAt: death?.respawnAt ?? null,
      level: p.level,
      gold: p.gold,
      itemGold,
      unspentGold: Math.max(0, p.gold - itemGold),
      lastShop: theirVisits.findLast((v) => v.timestamp <= t)?.timestamp ?? null,
      cs: p.cs,
      position: p.position,
    };
  };

  // Frame 0 is the loading screen and the last frame is the end of the game,
  // so the minute marks are everything in between.
  const minutes: TempoMinute[] = [];
  for (let i = 1; i < frames.length - 1; i++) {
    const t = frames[i].timestamp;
    const until = frames[i + 1].timestamp;
    const you = state(i, meId);
    const them = state(i, enemyId);
    const { tone, lead } = tempoTone(you, them);
    const aliveOn = (team: number) =>
      players.filter((p) => p.teamId === team && !deathAt(deaths, p.participantId, t)).length;
    const activities = (id: number) =>
      activitiesBetween(id, t, until, {
        visits: visits.get(id)!,
        kills,
        monsters,
        csGained: frames[i + 1].players[id - 1].cs - frames[i].players[id - 1].cs,
      });
    minutes.push({
      timestamp: t,
      tone,
      lead,
      you,
      them,
      alive: { ours: aliveOn(myTeam), theirs: aliveOn(teamOf.get(enemyId)!) },
      next: { until, you: activities(meId), them: activities(enemyId) },
    });
  }

  return {
    meId,
    enemyId,
    minutes,
    objectives: objectiveWindows(monsters, myTeam, frames.at(-1)?.timestamp ?? 0),
    exactItemGold: frames
      .slice(1)
      .every((f) => [meId, enemyId].every((id) => f.players[id - 1].unspentGold !== undefined)),
  };
}

// Who was up tempo, and by how much: item gold lead plus LEVEL_GOLD per level.
// Being alive beats any lead, since a dead jungler can't make a play.
export function tempoTone(
  you: Pick<JunglerState, "alive" | "itemGold" | "level">,
  them: Pick<JunglerState, "alive" | "itemGold" | "level">,
): { tone: TempoTone; lead: number } {
  const lead = you.itemGold - them.itemGold + LEVEL_GOLD * (you.level - them.level);
  if (you.alive !== them.alive) return { tone: you.alive ? "ahead" : "behind", lead };
  if (lead >= TEMPO_LEAD) return { tone: "ahead", lead };
  if (lead <= -TEMPO_LEAD) return { tone: "behind", lead };
  return { tone: "even", lead };
}

// --- Deaths and respawns ---

// Seconds a champion stays dead, from Summoner's Rift's death timer: a base
// time for their level, which grows by a few percent every half minute after
// 15 minutes, up to 50% more. From the League of Legends wiki's "Death" page.
const BASE_RESPAWN_S = [
  10, 10, 12, 12, 14, 16, 20, 25, 28, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5,
];

export function respawnSeconds(level: number, atMs: number): number {
  const base = BASE_RESPAWN_S[Math.min(18, Math.max(1, level)) - 1];
  return base * (1 + timeIncrease(atMs / 60_000));
}

function timeIncrease(minutes: number): number {
  if (minutes < 15) return 0;
  // Half minutes since a point in the game, rounded up.
  const halves = (from: number) => Math.ceil(2 * (minutes - from));
  if (minutes < 30) return halves(15) * 0.00425;
  if (minutes < 45) return 0.1275 + halves(30) * 0.003;
  return Math.min(0.5, 0.2175 + halves(45) * 0.0145);
}

export type DeathSpan = { participantId: number; diedAt: number; respawnAt: number };

// Every death in the game, with when that player came back.
export function deathSpans({ frames, events }: TrimmedTimeline): DeathSpan[] {
  return events
    .filter((e): e is ChampionKill => e.type === "CHAMPION_KILL")
    .map((kill) => {
      // Their level at the last snapshot before they died.
      const frame = frames.findLast((f) => f.timestamp <= kill.timestamp) ?? frames[0];
      const level = frame?.players[kill.victimId - 1]?.level ?? 1;
      return {
        participantId: kill.victimId,
        diedAt: kill.timestamp,
        respawnAt: kill.timestamp + Math.round(respawnSeconds(level, kill.timestamp) * 1000),
      };
    });
}

function deathAt(deaths: DeathSpan[], participantId: number, t: number): DeathSpan | undefined {
  return deaths.find((d) => d.participantId === participantId && d.diedAt <= t && t < d.respawnAt);
}

// --- Shop visits and item gold ---

export type ShopVisit = { timestamp: number; afterDeath: boolean };

// When a player was at the shop. Riot logs every item bought with its exact
// time, and items can only be bought at the shop (or while dead), so a run of
// purchases is one visit. Recalling and dying both send you to the shop; a
// visit while dead, or just after respawning, counts as after a death.
export function shopVisits(
  { events }: TrimmedTimeline,
  participantId: number,
  deaths: DeathSpan[],
): ShopVisit[] {
  const visits: ShopVisit[] = [];
  let lastPurchase = -Infinity;
  for (const e of events) {
    if (e.type !== "ITEM_PURCHASED" || e.participantId !== participantId) continue;
    if (e.timestamp - lastPurchase > SAME_VISIT_MS) {
      visits.push({
        timestamp: e.timestamp,
        afterDeath: deaths.some(
          (d) =>
            d.participantId === participantId &&
            d.diedAt <= e.timestamp &&
            e.timestamp <= d.respawnAt + AFTER_RESPAWN_MS,
        ),
      });
    }
    lastPurchase = e.timestamp;
  }
  return visits;
}

// Gold a player had spent on items by frame `i`. Exact when Riot's unspent
// gold was saved. Otherwise it's estimated as the gold they had earned by
// their last shop visit, as if they spent it all there. Riot only records
// gold once a minute, so the gold at the moment of the visit is read off a
// straight line between the snapshots either side.
export function itemGoldAt(
  frames: TrimmedFrame[],
  i: number,
  participantId: number,
  visits: ShopVisit[],
): number {
  const p = frames[i].players[participantId - 1];
  if (p.unspentGold !== undefined) return Math.max(0, p.gold - p.unspentGold);
  const last = visits.findLast((v) => v.timestamp <= frames[i].timestamp);
  return last ? Math.min(p.gold, goldAt(frames, participantId, last.timestamp)) : 0;
}

// A player's total gold at any moment, from the snapshots either side.
export function goldAt(frames: TrimmedFrame[], participantId: number, t: number): number {
  const after = frames.findIndex((f) => f.timestamp >= t);
  if (after === -1) return frames.at(-1)?.players[participantId - 1].gold ?? 0;
  if (after === 0) return frames[0].players[participantId - 1].gold;
  const a = frames[after - 1];
  const b = frames[after];
  const share = (t - a.timestamp) / (b.timestamp - a.timestamp);
  const goldA = a.players[participantId - 1].gold;
  const goldB = b.players[participantId - 1].gold;
  return Math.round(goldA + (goldB - goldA) * share);
}

// --- What each jungler did ---

function activitiesBetween(
  id: number,
  from: number,
  to: number,
  data: {
    visits: ShopVisit[];
    kills: ChampionKill[];
    monsters: EliteMonsterKill[];
    csGained: number;
  },
): Activity[] {
  const inWindow = (t: number) => t > from && t <= to;
  const activities: Activity[] = [];
  for (const v of data.visits) {
    if (inWindow(v.timestamp)) activities.push({ type: "shop", ...v });
  }
  for (const k of data.kills) {
    if (!inWindow(k.timestamp)) continue;
    if (k.victimId === id) {
      activities.push({
        type: "died",
        timestamp: k.timestamp,
        killerId: k.killerId,
        position: k.position,
      });
    } else if (k.killerId === id || k.assistingParticipantIds.includes(id)) {
      activities.push({
        type: "takedown",
        timestamp: k.timestamp,
        victimId: k.victimId,
        killed: k.killerId === id,
        position: k.position,
      });
    }
  }
  for (const m of data.monsters) {
    const kind = monsterKind(m);
    if (!kind || !inWindow(m.timestamp)) continue;
    if (m.killerId === id || m.assistingParticipantIds.includes(id)) {
      activities.push({ type: "objective", timestamp: m.timestamp, kind, killed: m.killerId === id });
    }
  }
  activities.sort((a, b) => timeOf(a) - timeOf(b));
  if (data.csGained > 0) activities.push({ type: "farm", cs: data.csGained });
  return activities;
}

function timeOf(a: Activity): number {
  return a.type === "farm" ? Infinity : a.timestamp;
}

function monsterKind(m: EliteMonsterKill): ObjectiveKind | null {
  switch (m.monsterType) {
    case "DRAGON":
      return m.monsterSubType === "ELDER_DRAGON" ? "elder" : "dragon";
    case "BARON_NASHOR":
      return "baron";
    case "RIFTHERALD":
      return "herald";
    case "HORDE":
      return "grubs";
    case "ATAKHAN":
      return "atakhan";
    default:
      return null;
  }
}

// --- Epic monster timers ---

// Spawn and respawn times on Summoner's Rift, in ms. They match every saved
// game from patch 16.13 on (docs/tempo.md); Riot changes them now and then,
// so they're worth checking when a season starts.
export const DRAGON_SPAWN_MS = 5 * 60_000;
export const DRAGON_RESPAWN_MS = 5 * 60_000;
// Once a team has four dragons (the soul), Elder Dragon takes their place.
export const ELDER_RESPAWN_MS = 6 * 60_000;
export const GRUBS_SPAWN_MS = 8 * 60_000;
export const GRUBS_DESPAWN_MS = 14 * 60_000 + 45_000;
export const HERALD_SPAWN_MS = 15 * 60_000;
export const HERALD_DESPAWN_MS = 19 * 60_000 + 45_000;
export const BARON_SPAWN_MS = 20 * 60_000;
export const BARON_RESPAWN_MS = 6 * 60_000;
const SOUL_DRAGONS = 4;
const GRUBS = 3;

// When each epic monster was up, from the spawn timers and the kills Riot
// logged. `endMs` is the end of the game.
export function objectiveWindows(
  monsters: EliteMonsterKill[],
  myTeamId: number,
  endMs: number,
): ObjectiveWindow[] {
  const sorted = [...monsters].sort((a, b) => a.timestamp - b.timestamp);
  const windows: ObjectiveWindow[] = [];
  const add = (
    kind: ObjectiveWindow["kind"],
    spawnsAt: number,
    taken: EliteMonsterKill | undefined,
    despawnsAt = endMs,
  ) => {
    if (spawnsAt >= endMs) return;
    windows.push({
      kind,
      spawnsAt,
      takenAt: taken?.timestamp ?? null,
      ours: taken ? taken.killerTeamId === myTeamId : null,
      endsAt: Math.min(taken?.timestamp ?? despawnsAt, endMs),
    });
  };

  // Dragons, then Elder once a team has the soul.
  let spawn = DRAGON_SPAWN_MS;
  let elder = false;
  const dragonsBy = new Map<number, number>();
  for (const kill of sorted.filter((m) => m.monsterType === "DRAGON")) {
    add(elder ? "elder" : "dragon", spawn, kill);
    if (kill.monsterSubType !== "ELDER_DRAGON") {
      const count = (dragonsBy.get(kill.killerTeamId) ?? 0) + 1;
      dragonsBy.set(kill.killerTeamId, count);
      if (count >= SOUL_DRAGONS) elder = true;
    } else {
      elder = true;
    }
    spawn = kill.timestamp + (elder ? ELDER_RESPAWN_MS : DRAGON_RESPAWN_MS);
  }
  add(elder ? "elder" : "dragon", spawn, undefined);

  // Void grubs come once, three at a time. Taken means all three died; the
  // team that killed most of them gets the credit.
  const grubs = sorted.filter((m) => m.monsterType === "HORDE");
  if (GRUBS_SPAWN_MS < endMs) {
    const ours = grubs.filter((g) => g.killerTeamId === myTeamId).length;
    const done = grubs.length >= GRUBS ? grubs[GRUBS - 1] : undefined;
    windows.push({
      kind: "grubs",
      spawnsAt: GRUBS_SPAWN_MS,
      takenAt: done?.timestamp ?? null,
      ours: grubs.length === 0 ? null : ours * 2 > grubs.length,
      endsAt: Math.min(done?.timestamp ?? GRUBS_DESPAWN_MS, endMs),
    });
  }

  add(
    "herald",
    HERALD_SPAWN_MS,
    sorted.find((m) => m.monsterType === "RIFTHERALD"),
    HERALD_DESPAWN_MS,
  );

  let baronSpawn = BARON_SPAWN_MS;
  for (const kill of sorted.filter((m) => m.monsterType === "BARON_NASHOR")) {
    add("baron", baronSpawn, kill);
    baronSpawn = kill.timestamp + BARON_RESPAWN_MS;
  }
  add("baron", baronSpawn, undefined);

  return windows.sort((a, b) => a.spawnsAt - b.spawnsAt);
}

// --- Words for the page ---

// "You were up tempo", with the reasons behind it, for one minute.
// `you` and `them` are the two junglers' champion names.
export function describeTempo(
  m: TempoMinute,
  names: { them: string },
): { title: string; reasons: string[] } {
  const title =
    m.tone === "ahead"
      ? "You were up tempo"
      : m.tone === "behind"
        ? `${names.them} was up tempo`
        : "Even tempo";
  const reasons: string[] = [];

  if (!m.you.alive) reasons.push(`You were dead until ${formatClock(m.you.respawnAt!)}.`);
  if (!m.them.alive) reasons.push(`${names.them} was dead until ${formatClock(m.them.respawnAt!)}.`);

  const items = formatGap(m.you.itemGold, m.them.itemGold, { format: gold });
  reasons.push(
    items.tone === "even"
      ? `You'd both spent ${gold(m.you.itemGold)} on items.`
      : `You'd spent ${gold(m.you.itemGold)} on items, ${names.them} ${gold(m.them.itemGold)}: ${items.text}.`,
  );
  if (m.you.level !== m.them.level) {
    reasons.push(`You were level ${m.you.level}, ${names.them} level ${m.them.level}.`);
  }
  // The number the call is made on, unless being the only one alive decided it.
  if (m.you.alive && m.them.alive) {
    const together = formatGap(m.lead, 0, { format: gold });
    const bar = gold(TEMPO_LEAD);
    reasons.push(
      m.tone === "even"
        ? `Items and levels together: ${together.tone === "even" ? "even" : together.text}, short of the ${bar} that counts as up tempo.`
        : `Items and levels together: ${together.text} (up tempo from ${bar}).`,
    );
  }
  for (const [who, j] of [
    ["You were", m.you],
    [`${names.them} was`, m.them],
  ] as const) {
    if (j.alive && j.unspentGold >= HOLDING_GOLD) {
      const since = j.lastShop === null ? "" : `, last shopped at ${formatClock(j.lastShop)}`;
      reasons.push(`${who} holding ${gold(j.unspentGold)} not spent yet${since}.`);
    }
  }
  if (m.alive.ours !== m.alive.theirs) {
    reasons.push(`Players alive: ${m.alive.ours} on your team, ${m.alive.theirs} on theirs.`);
  }
  return { title, reasons };
}

// 2350 -> "2,350 gold"
function gold(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} gold`;
}
