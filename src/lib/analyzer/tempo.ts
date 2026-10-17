// The tempo timeline (beta): for a jungler, an estimate of which jungler had
// the tempo at every second of the game, next to what each of them did with
// it.
//
// Tempo, the way junglers use the word, is the time advantage: the jungler who
// has just spent their gold on items, is alive and has the levels can make the
// next play, while the one who is dead, or still carrying the gold from their
// last few camps, has to farm, recall or give way. Riot doesn't record tempo,
// so this estimates it from what it does record:
//
// - Items: gold each jungler has already spent on items. Riot gives each
//   player's total gold and unspent gold once a minute; total minus unspent
//   is what they've spent. Purchases are logged to the second, so the amount
//   steps up at the shop visit rather than at the next snapshot. Timelines
//   saved before unspent gold was kept get an estimate from their shop visits
//   instead (see itemGoldAt).
// - Levels: each level counts as LEVEL_GOLD gold. Riot logs every skill point
//   to the second, and each level gives one.
// - Alive: a dead jungler has no tempo until they respawn. Riot records the
//   moment of each death; the respawn time comes from the game's death timer
//   formula.
// - Players alive: each extra player alive on your team counts as PLAYER_GOLD
//   gold, since a team a player down can't contest the next play as well.
//
// The jungler whose items, levels and players alive add up to at least
// TEMPO_LEAD more is "up tempo". docs/tempo.md explains how these numbers were
// worked out from real games, and how well they held up.
//
// Like the jungle map and the gank log, it lays out the situation and never
// grades a decision. Whether to fight, farm or back depends on things Riot
// doesn't record (waves, vision, cooldowns, health), and Riot's policies rule
// out tools that tell players what to do.

import type { MapPosition } from "@/lib/riot/types";
import { formatClock, formatGap } from "./format";
import type { ObjectiveKind } from "./objectives";
import type { ChampionKill, EliteMonsterKill, TrimmedFrame, TrimmedTimeline } from "./trim";

// How much one level and one extra player alive are worth, in gold, and how
// big the combined lead has to be to count as up tempo. Set from the study in
// docs/tempo.md: in 1,923 games, a level and a player alive each did about as
// much as 2,000 gold of items, so being a level or a player up is enough on
// its own.
export const LEVEL_GOLD = 2000;
export const PLAYER_GOLD = 2000;
export const TEMPO_LEAD = 2000;

// Purchases this close together are one shop visit.
const SAME_VISIT_MS = 30_000;
// A purchase this soon after respawning still counts as shopping after a
// death rather than after a recall.
const AFTER_RESPAWN_MS = 15_000;
// Holding at least this much unspent gold is worth pointing out: it's about
// a component item that hasn't been bought yet.
export const HOLDING_GOLD = 700;

export type TempoTone = "ahead" | "behind" | "even"; // from your point of view

// One jungler at one of Riot's minute snapshots.
export type JunglerState = {
  participantId: number;
  alive: boolean;
  // When a dead jungler is back, by the death timer formula. Null when alive.
  respawnAt: number | null;
  level: number;
  gold: number; // total earned so far
  itemGold: number; // spent on items so far
  unspentGold: number; // earned but not spent yet
  // Their last shop visit at or before this moment. Null before the first.
  lastShop: number | null;
  cs: number;
  position: MapPosition | null;
};

// One jungler at any second: the part of JunglerState the call is made from.
export type JunglerMoment = Pick<
  JunglerState,
  "alive" | "respawnAt" | "level" | "itemGold" | "unspentGold" | "lastShop"
>;

// Something a jungler did, at the second it happened.
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
  | {
      type: "died";
      timestamp: number;
      killerId: number;
      position: MapPosition | null;
      // When they were back, by the death timer formula.
      respawnAt: number;
    }
  // An epic monster they landed the last hit on (killed) or helped with.
  | { type: "objective"; timestamp: number; kind: ObjectiveKind; killed: boolean };

// The call at one moment, and what it was made from.
export type TempoCall = {
  tone: TempoTone;
  // Your item gold lead, plus LEVEL_GOLD per level and PLAYER_GOLD per extra
  // player alive. Negative when the enemy jungler is ahead.
  lead: number;
  you: JunglerMoment;
  them: JunglerMoment;
  // Players alive on each team.
  alive: { ours: number; theirs: number };
};

// A stretch of the game where nothing the call is made from changed, so the
// call held from `from` until `to`, when the next stretch starts.
export type TempoStretch = TempoCall & { from: number; to: number };

// The call at one of Riot's minute snapshots, which is all the first version
// of the panel showed. The study (tempo-study.ts) compares the two.
export type TempoMinute = {
  timestamp: number;
  tone: TempoTone;
  lead: number;
  you: JunglerState;
  them: JunglerState;
  alive: { ours: number; theirs: number };
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
  // The whole game, from 0:00 to the end, in order.
  stretches: TempoStretch[];
  // Everything each jungler did that Riot logged to the second, in order.
  activities: { you: Activity[]; them: Activity[] };
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
  const end = frames.at(-1)?.timestamp ?? 0;
  const deaths = deathSpans(timeline);
  const visits = new Map(
    [meId, enemyId].map((id) => [id, shopVisits(timeline, id, deaths)]),
  );
  const skillPoints = new Map(
    [meId, enemyId].map((id) => [
      id,
      events
        .filter((e) => e.type === "SKILL_LEVEL_UP" && e.participantId === id)
        .map((e) => e.timestamp),
    ]),
  );
  const teamOf = new Map(players.map((p) => [p.participantId, p.teamId]));
  const aliveOn = (team: number | undefined, t: number) =>
    players.filter((p) => p.teamId === team && !deathAt(deaths, p.participantId, t)).length;

  // One jungler at second t.
  const jungler = (id: number, t: number): JunglerMoment => {
    const i = Math.max(0, frames.findLastIndex((f) => f.timestamp <= t));
    const next = frames[i + 1];
    const theirVisits = visits.get(id)!;
    // Item gold comes from a snapshot: the one before t until the jungler's
    // first shop visit after it, then the next one, the first to show what
    // they bought.
    const shopped =
      next !== undefined &&
      theirVisits.some((v) => v.timestamp > frames[i].timestamp && v.timestamp <= t);
    const source = shopped ? i + 1 : i;
    const itemGold = itemGoldAt(frames, source, id, theirVisits);
    // Each level gives one skill point. Points can be spent a little late,
    // so the count is kept between the levels in the snapshots either side.
    const lowest = frames[i].players[id - 1].level;
    const highest = next ? next.players[id - 1].level : lowest;
    const points = skillPoints.get(id)!.filter((at) => at <= t).length;
    const death = deathAt(deaths, id, t);
    return {
      alive: !death,
      respawnAt: death?.respawnAt ?? null,
      level: Math.min(highest, Math.max(lowest, points)),
      itemGold,
      unspentGold: Math.max(0, frames[source].players[id - 1].gold - itemGold),
      lastShop: theirVisits.findLast((v) => v.timestamp <= t)?.timestamp ?? null,
    };
  };

  const callAt = (t: number): TempoCall => {
    const you = jungler(meId, t);
    const them = jungler(enemyId, t);
    const alive = { ours: aliveOn(teamOf.get(meId), t), theirs: aliveOn(teamOf.get(enemyId), t) };
    return { ...tempoTone(you, them, alive), you, them, alive };
  };

  // What the call is made from only changes at these moments: a snapshot, a
  // death or respawn, or a jungler's skill point or shop visit. So it's
  // worked out at each one and holds until the next, and every second of the
  // game is covered without checking them one by one.
  const changes = new Set([
    0,
    ...frames.map((f) => f.timestamp),
    ...deaths.flatMap((d) => [d.diedAt, d.respawnAt]),
    ...[meId, enemyId].flatMap((id) => [
      ...visits.get(id)!.map((v) => v.timestamp),
      ...skillPoints.get(id)!,
    ]),
  ]);
  const times = [...changes].filter((t) => t >= 0 && t < end).sort((a, b) => a - b);
  const stretches: TempoStretch[] = [];
  let previous = "";
  for (const [i, from] of times.entries()) {
    const to = times[i + 1] ?? end;
    const call = callAt(from);
    // Some moments change nothing (a skill point the snapshot already
    // counted, say), so they extend the stretch before.
    const key = JSON.stringify(call);
    if (key === previous) stretches[stretches.length - 1].to = to;
    else stretches.push({ from, to, ...call });
    previous = key;
  }

  const kills = events.filter((e): e is ChampionKill => e.type === "CHAMPION_KILL");
  const monsters = events.filter((e): e is EliteMonsterKill => e.type === "ELITE_MONSTER_KILL");
  const activities = (id: number) =>
    activitiesOf(id, { visits: visits.get(id)!, kills, monsters, deaths });

  return {
    meId,
    enemyId,
    stretches,
    activities: { you: activities(meId), them: activities(enemyId) },
    objectives: objectiveWindows(monsters, teamOf.get(meId)!, end),
    exactItemGold: frames
      .slice(1)
      .every((f) => [meId, enemyId].every((id) => f.players[id - 1].unspentGold !== undefined)),
  };
}

// The stretch covering moment t. The last one also covers the very end of
// the game. Null only for a timeline with no stretches.
export function stretchAt(stretches: TempoStretch[], t: number): TempoStretch | null {
  return stretches.find((s) => t < s.to) ?? stretches.at(-1) ?? null;
}

// The call at each of Riot's minute snapshots, the way the first version of
// the panel made it: one block per minute, decided at its first second.
// Frame 0 is the loading screen and the last frame is the end of the game,
// so the minute marks are everything in between.
export function tempoMinutes(
  timeline: TrimmedTimeline,
  players: Player[],
  meId: number,
  enemyId: number,
): TempoMinute[] {
  const { frames } = timeline;
  const teamOf = new Map(players.map((p) => [p.participantId, p.teamId]));
  const deaths = deathSpans(timeline);
  const visits = new Map(
    [meId, enemyId].map((id) => [id, shopVisits(timeline, id, deaths)]),
  );

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

  const minutes: TempoMinute[] = [];
  for (let i = 1; i < frames.length - 1; i++) {
    const t = frames[i].timestamp;
    const you = state(i, meId);
    const them = state(i, enemyId);
    const aliveOn = (team: number | undefined) =>
      players.filter((p) => p.teamId === team && !deathAt(deaths, p.participantId, t)).length;
    const alive = { ours: aliveOn(teamOf.get(meId)), theirs: aliveOn(teamOf.get(enemyId)) };
    minutes.push({ timestamp: t, ...tempoTone(you, them, alive), you, them, alive });
  }
  return minutes;
}

// Who was up tempo, and by how much: item gold lead, plus LEVEL_GOLD per level
// and PLAYER_GOLD per extra player alive. Being the only jungler alive beats
// any lead, since a dead jungler can't make a play.
export function tempoTone(
  you: Pick<JunglerState, "alive" | "itemGold" | "level">,
  them: Pick<JunglerState, "alive" | "itemGold" | "level">,
  alive: TempoCall["alive"],
): { tone: TempoTone; lead: number } {
  const lead =
    you.itemGold -
    them.itemGold +
    LEVEL_GOLD * (you.level - them.level) +
    PLAYER_GOLD * (alive.ours - alive.theirs);
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

// Every shop visit, takedown, death and epic monster for one jungler, in
// order.
function activitiesOf(
  id: number,
  data: {
    visits: ShopVisit[];
    kills: ChampionKill[];
    monsters: EliteMonsterKill[];
    deaths: DeathSpan[];
  },
): Activity[] {
  const activities: Activity[] = data.visits.map((v) => ({ type: "shop", ...v }));
  for (const k of data.kills) {
    if (k.victimId === id) {
      const death = data.deaths.find((d) => d.participantId === id && d.diedAt === k.timestamp);
      activities.push({
        type: "died",
        timestamp: k.timestamp,
        killerId: k.killerId,
        position: k.position,
        respawnAt: death?.respawnAt ?? k.timestamp,
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
    if (kind && (m.killerId === id || m.assistingParticipantIds.includes(id))) {
      activities.push({ type: "objective", timestamp: m.timestamp, kind, killed: m.killerId === id });
    }
  }
  return activities.sort((a, b) => a.timestamp - b.timestamp);
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

// Spawn and respawn times on Summoner's Rift, in ms. None of the 13,738 epic
// monsters in the study's games (patches 16.1 to 16.20, docs/tempo.md) was
// taken before them. Riot changes them now and then, so they're worth
// checking when a season starts.
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

// "You were up tempo", with the reasons behind it, for one moment.
// `names.them` is the enemy jungler's champion name.
export function describeTempo(
  m: TempoCall,
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
  // Levels and players alive, with the gold each counts as, so the total
  // below adds up.
  if (m.you.level !== m.them.level) {
    const levels = formatGap(LEVEL_GOLD * m.you.level, LEVEL_GOLD * m.them.level, { format: gold });
    reasons.push(
      `You were level ${m.you.level}, ${names.them} level ${m.them.level}: counts as ${levels.text}.`,
    );
  }
  if (m.alive.ours !== m.alive.theirs) {
    const players = formatGap(PLAYER_GOLD * m.alive.ours, PLAYER_GOLD * m.alive.theirs, { format: gold });
    reasons.push(
      `Players alive: ${m.alive.ours} on your team, ${m.alive.theirs} on theirs: counts as ${players.text}.`,
    );
  }
  // The number the call is made on, unless being the only one alive decided it.
  if (m.you.alive && m.them.alive) {
    const together = formatGap(m.lead, 0, { format: gold });
    const bar = gold(TEMPO_LEAD);
    reasons.push(
      m.tone === "even"
        ? `All together: ${together.tone === "even" ? "even" : together.text}, short of the ${bar} that counts as up tempo.`
        : `All together: ${together.text} (up tempo from ${bar}).`,
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
  return { title, reasons };
}

// 2350 -> "2,350 gold"
function gold(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} gold`;
}
