// The replay's plays (beta): every fight, epic monster, tower and inhibitor
// of a game, each graded by how much it changed your team's chance to win.
// Sports call this Win Probability Added.
//
// The chance comes from the win chance model (win-chance.ts), which reads
// each team's gold, XP, kills and objectives. It was trained on Riot's
// once-a-minute snapshots, but it can be read at any second: kills and
// objectives are logged to the millisecond, and gold and XP are estimated
// between the snapshots the same way the replay's scoreboard does it (goldAt
// in replay.ts). The model has learned that a kill is worth the gold it
// brings, so that estimate is what makes a kill count.
//
// A play is a run of kills, epic monsters and buildings less than
// PLAY_GAP_MS apart, so a fight at Baron and the tower after it are one
// play. Its grade is your team's chance just after its last event minus
// just before its first. Plays never overlap, so in between them only gold
// and XP move the chance (farming, mostly).
//
// Everything here runs on the server: the page gets the chance at every
// second and the graded plays, not the model.

import type { MapPosition } from "@/lib/riot/types";
import { formatClock, listNames } from "./format";
import type { ObjectiveKind } from "./objectives";
import { between, goldAt, type ReplayData, type ReplayKill } from "./replay";
import type { TrimmedTimeline } from "./trim";
import {
  blueWinChance,
  modelFits,
  TEAM_STATS,
  teamStateAt,
  winChanceFeatures,
  type WinChanceModel,
} from "./win-chance";

export type Play = {
  from: number; // ms, its first event
  to: number; // ms, its last event
  // Which of the replay's kills and objectives it's made of (indexes into
  // ReplayData.kills and ReplayData.objectives).
  kills: number[];
  objectives: number[];
  // Your team's chance to win (0 to 1) just before its first event and just
  // after its last.
  before: number;
  after: number;
  // True when you got a kill or assist in it, died in it, or helped take one
  // of its epic monsters. Riot doesn't log who took a tower.
  mine: boolean;
  // Its grade (see gradePlay), worked out once here so the page doesn't.
  grade: Grade;
};

export type ReplayChances = {
  // Your team's chance to win at every second of the game, in tenths of a
  // percent (534 is 53.4%), which keeps the page small.
  perSecond: number[];
  plays: Play[];
};

// Kills, epic monsters and buildings closer together than this are one play.
const PLAY_GAP_MS = 20_000;

// The chance at every second and the graded plays, for the player
// `meId` (the one whose page it is). Null when the saved model was trained
// on a different feature list (see modelFits).
export function replayChances(
  timeline: TrimmedTimeline,
  replay: ReplayData,
  model: Pick<WinChanceModel, "features" | "weights">,
  meId: number,
): ReplayChances | null {
  if (!modelFits(model)) return null;
  const chanceAt = chanceReader(timeline, replay, model);

  const perSecond: number[] = [];
  for (let s = 0; s * 1000 <= replay.end; s++) perSecond.push(Math.round(chanceAt(s * 1000) * 1000));

  // The epic monsters you helped take, by the millisecond they died.
  const myMonsters = new Set(
    timeline.events
      .filter(
        (e) =>
          e.type === "ELITE_MONSTER_KILL" &&
          (e.killerId === meId || e.assistingParticipantIds.includes(meId)),
      )
      .map((e) => e.timestamp),
  );

  const plays = groupEvents(replay).map((group): Play => {
    const kills = group.flatMap((e) => (e.kill === undefined ? [] : [e.kill]));
    const objectives = group.flatMap((e) => (e.objective === undefined ? [] : [e.objective]));
    const from = group[0].at;
    const to = group[group.length - 1].at;
    const mine =
      kills.some((i) => {
        const k = replay.kills[i];
        return k.killerId === meId || k.victimId === meId || k.assists.includes(meId);
      }) || objectives.some((i) => myMonsters.has(replay.objectives[i].timestamp));
    const before = chanceAt(from - 1);
    const after = chanceAt(to);
    const grade = gradePlay({ kills, before, after }, replay);
    return { from, to, kills, objectives, before, after, mine, grade };
  });
  return { perSecond, plays };
}

// Kills and objectives in time order, cut into runs wherever two are at
// least PLAY_GAP_MS apart.
type PlayEvent = { at: number; kill?: number; objective?: number };

function groupEvents(replay: ReplayData): PlayEvent[][] {
  const events: PlayEvent[] = [
    ...replay.kills.map((k, i) => ({ at: k.timestamp, kill: i })),
    ...replay.objectives.map((o, i) => ({ at: o.timestamp, objective: i })),
  ].sort((a, b) => a.at - b.at);
  const groups: PlayEvent[][] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last && e.at - last[last.length - 1].at < PLAY_GAP_MS) last.push(e);
    else groups.push([e]);
  }
  return groups;
}

// A function giving your team's chance to win (0 to 1) at any moment (ms):
// each team's numbers at that moment, read by the model.
function chanceReader(
  timeline: TrimmedTimeline,
  replay: ReplayData,
  model: Pick<WinChanceModel, "weights">,
): (t: number) => number {
  const { frames } = timeline;
  // Only these events change a team's numbers.
  const events = timeline.events.filter(
    (e) => e.type === "CHAMPION_KILL" || e.type === "ELITE_MONSTER_KILL" || e.type === "BUILDING_KILL",
  );
  const teamOf = new Map(replay.players.map((p) => [p.participantId, p.teamId]));
  // teamStateAt reads players by position: players[0] is participantId 1.
  const ids = Array.from({ length: frames[0]?.players.length ?? 0 }, (_, i) => i + 1);
  const byId = new Map(replay.players.map((p) => [p.participantId, p]));
  const xp = new Map(ids.map((id) => [id, frames.map((f) => f.players[id - 1]?.xp ?? 0)]));
  // Each player's own kills and assists, so their gold is quick to work out
  // at every second.
  const killsOf = new Map(
    ids.map((id) => [id, replay.kills.filter((k) => k.killerId === id || k.assists.includes(id))]),
  );

  return (t) => {
    // At 0:00 nobody has anything yet: an even game.
    if (t <= 0) return 0.5;
    const frame = {
      timestamp: t,
      players: ids.map((id) => {
        const p = byId.get(id);
        return {
          gold: p ? goldAt(p.gold, replay.snapshots, killsOf.get(id) ?? [], id, t) : 0,
          xp: between(xp.get(id) ?? [], replay.snapshots, t),
        };
      }),
    };
    const blue = teamStateAt(frame, events, teamOf, 100);
    const red = teamStateAt(frame, events, teamOf, 200);
    const chance = blueWinChance(
      model.weights,
      winChanceFeatures({
        t: t / 1000,
        blue: TEAM_STATS.map((stat) => blue[stat]),
        red: TEAM_STATS.map((stat) => red[stat]),
      }),
    );
    return replay.myTeamId === 100 ? chance : 1 - chance;
  };
}

// --- Grades and words, for the plays list ---

// Chess-style grades, best first. Chess.com's scale also has Best, Miss
// and Book, which Turnpoint leaves out on purpose (decision record 0023):
// Best needs the other options a player had, Miss the absence of a play,
// and Book an opening move that isn't a kill or an objective.
export const GRADES = [
  "Brilliant",
  "Great",
  "Excellent",
  "Good",
  "Even",
  "Inaccuracy",
  "Mistake",
  "Blunder",
] as const;

export type Grade = (typeof GRADES)[number];

// Where the replay jumps to for a play: the first whole second of it, so the
// clock, scoreboard and win chance all count its first event.
export function playStart(play: Pick<Play, "from">): number {
  return Math.ceil(play.from / 1000) * 1000;
}

// How much a play moved your team's chance, in points, to one decimal: 7.6
// when it went from 52.0% to 59.6%.
export function playSwing(play: Pick<Play, "before" | "after">): number {
  return Math.round((play.after - play.before) * 1000) / 10;
}

// The lines between the grades, in points of win chance.
const SMALL_SWING = 1;
const BIG_SWING = 4;
// Great and Blunder also need the play to change your team's band, below.
// Without this, an early lone kill that tips the chance from 43% to 39%
// would be a Blunder.
const TURNING_SWING = 8;

// Your team is losing under 40%, winning over 60%, and even in between
// (40% and 60% included). Moving across one of these lines is what makes a
// big play Great or a Blunder: it changed who was ahead, not just by how
// much.
const LOSING_BELOW = 0.4;
const WINNING_ABOVE = 0.6;

// A fight is Brilliant when your team won it with at least this many fewer
// champions than the enemy. One fewer isn't enough: in a big fight the
// losing side nearly always shows all five, so a 4 against 5 is usually a
// teammate who stayed out of it, not a risk.
const OUTNUMBERED_BY = 2;
// A play can run on as long as its events are less than 20 seconds apart,
// so for Brilliant its kills are split into fights wherever two are this far
// apart. Three pickoffs 15 seconds apart are three 1 against 1 fights, not
// one 1 against 3.
const FIGHT_GAP_MS = 10_000;
// Kills this far apart on the map (in game units, out of 14,900 across) are
// in different fights, even seconds apart: a dive top while bot lane wins a
// 2 against 2 is two fights, not one 3 against 5. It's a little wider than a
// side lane, so kills in one chase still join up.
const FIGHT_RANGE = 3000;

// A play's grade, from how much it moved your team's chance to win:
//
// - 4 points or more: Brilliant when one of its fights was won while
//   outnumbered by 2 or more, Great for 8 points or more that moved your
//   team up a band (losing, even, winning), Excellent otherwise.
// - 1 to 4 points: Good. Less than 1 either way: Even. −1 to −4: Inaccuracy.
// - −4 or more: Blunder for −8 or more that dropped your team down a band,
//   Mistake otherwise.
//
// It grades what a play did to the chance, not whether it was the right
// call.
export function gradePlay(
  play: Pick<Play, "before" | "after" | "kills">,
  replay: Pick<ReplayData, "kills" | "players" | "myTeamId">,
): Grade {
  const swing = playSwing(play);
  const moved = band(play.after) - band(play.before);
  if (swing >= BIG_SWING) {
    if (fights(play.kills, replay).some((fight) => wonOutnumbered(fightSides(fight, replay)))) {
      return "Brilliant";
    }
    return swing >= TURNING_SWING && moved > 0 ? "Great" : "Excellent";
  }
  if (swing >= SMALL_SWING) return "Good";
  if (swing <= -BIG_SWING) return swing <= -TURNING_SWING && moved < 0 ? "Blunder" : "Mistake";
  if (swing <= -SMALL_SWING) return "Inaccuracy";
  return "Even";
}

// The page shows the chance to a tenth of a percent, so the band reads it
// the same way: 39.996% shows as 40.0%, which is even.
function band(chance: number): number {
  const shown = Math.round(chance * 1000) / 1000;
  if (shown < LOSING_BELOW) return 0;
  if (shown > WINNING_ABOVE) return 2;
  return 1;
}

// A play's kills (indexes into ReplayData.kills, in time order) cut into
// fights. A kill joins the latest fight whose last kill was less than
// FIGHT_GAP_MS before it and that has a kill within FIGHT_RANGE of it;
// otherwise it starts a fight. Two fights at once on different parts of the
// map stay apart this way. A kill Riot gave no position is a fight of its
// own, since there's no telling which fight it was in.
function fights(kills: number[], replay: Pick<ReplayData, "kills">): number[][] {
  const out: number[][] = [];
  for (const i of kills) {
    const kill = replay.kills[i];
    const fight = out.findLast((f) => {
      const last = replay.kills[f[f.length - 1]];
      if (kill.timestamp - last.timestamp >= FIGHT_GAP_MS) return false;
      return f.some((j) => near(replay.kills[j].position, kill.position));
    });
    if (fight) fight.push(i);
    else out.push([i]);
  }
  return out;
}

function near(a: MapPosition | null, b: MapPosition | null): boolean {
  return a !== null && b !== null && Math.hypot(a.x - b.x, a.y - b.y) < FIGHT_RANGE;
}

// True when your team won the fight (more enemy deaths than yours), had at
// least one champion in it, and had OUTNUMBERED_BY or more fewer than the
// enemy team.
function wonOutnumbered({ won, lost, ours, theirs }: FightSides): boolean {
  return won > lost && ours.size > 0 && theirs.size - ours.size >= OUTNUMBERED_BY;
}

export type FightSides = {
  // Enemy deaths and your team's deaths.
  won: number;
  lost: number;
  // The champions in it on each side: whoever killed, helped or died. Riot
  // counts anyone who did damage as a helper, but an enemy who ran away
  // untouched isn't counted at all.
  ours: Set<number>;
  theirs: Set<number>;
};

// Who won some kills (indexes into ReplayData.kills) and who was in them,
// from your team's side.
export function fightSides(
  kills: number[],
  replay: Pick<ReplayData, "kills" | "players" | "myTeamId">,
): FightSides {
  const teamOf = new Map(replay.players.map((p) => [p.participantId, p.teamId]));
  const isOurs = (id: number) => teamOf.get(id) === replay.myTeamId;
  const sides: FightSides = { won: 0, lost: 0, ours: new Set(), theirs: new Set() };
  for (const i of kills) {
    const k: ReplayKill = replay.kills[i];
    if (isOurs(k.victimId)) sides.lost++;
    else sides.won++;
    // killerId is 0 when a tower or minions got the kill.
    const champions = [k.victimId, ...(k.killerId > 0 ? [k.killerId] : []), ...k.assists];
    for (const id of champions) (isOurs(id) ? sides.ours : sides.theirs).add(id);
  }
  return sides;
}

// 7.6 -> "+7.6%", -2 -> "−2.0%" (with a real minus sign), 0 -> "0.0%".
export function formatSwing(swing: number): string {
  if (swing === 0) return "0.0%";
  return `${swing > 0 ? "+" : "−"}${Math.abs(swing).toFixed(1)}%`;
}

// What a play is called in the list: "Qiyana killed Shaco", "Won a fight 3
// for 1", "Your team took Baron", or a mix: "Won a fight 3 for 1, your team
// took Baron". `names` gives each participantId's champion.
export function playTitle(play: Play, replay: ReplayData, names: Record<number, string>): string {
  const ours = (teamId: number) => teamId === replay.myTeamId;
  const kills = play.kills.map((i) => replay.kills[i]);
  const objectives = play.objectives.map((i) => replay.objectives[i]);
  const { won, lost } = fightSides(play.kills, replay);
  const fight =
    kills.length === 0
      ? null
      : kills.length === 1
        ? killWords(kills[0], names)
        : won > lost
          ? `won a fight ${won} for ${lost}`
          : won < lost
            ? `lost a fight ${won} for ${lost}`
            : `traded ${won} for ${lost}`;
  const took = (who: string, mineOnly: boolean) => {
    const list = objectives.filter((o) => ours(o.teamId) === mineOnly);
    return list.length > 0 ? `${who} took ${objectiveWords(list.map((o) => o.kind))}` : null;
  };
  const title = [fight, took("your team", true), took("the enemy team", false)]
    .filter((part) => part !== null)
    .join(", ");
  return title.charAt(0).toUpperCase() + title.slice(1);
}

// What happened in a play, one line per kill or objective, in order:
// "12:31 Qiyana killed Shaco (Ahri helped)", "12:40 Your team took Dragon".
export function playLines(play: Play, replay: ReplayData, names: Record<number, string>): string[] {
  const lines = [
    ...play.kills.map((i) => {
      const k = replay.kills[i];
      const helpers = k.killerId > 0 ? k.assists.map((id) => names[id] ?? "someone") : [];
      const helped = helpers.length > 0 ? ` (${listNames(helpers)} helped)` : "";
      const words = killWords(k, names);
      return { at: k.timestamp, text: `${words.charAt(0).toUpperCase()}${words.slice(1)}${helped}` };
    }),
    ...play.objectives.map((i) => {
      const o = replay.objectives[i];
      const who = o.teamId === replay.myTeamId ? "Your team" : "The enemy team";
      return { at: o.timestamp, text: `${who} took ${objectiveWords([o.kind])}` };
    }),
  ];
  return lines.sort((a, b) => a.at - b.at).map((l) => `${formatClock(l.at)} ${l.text}`);
}

function killWords(
  k: Pick<ReplayData["kills"][number], "killerId" | "victimId">,
  names: Record<number, string>,
): string {
  const victim = names[k.victimId] ?? "someone";
  return k.killerId > 0
    ? `${names[k.killerId] ?? "someone"} killed ${victim}`
    : `${victim} died to a tower or minions`;
}

// The objectives a team took in a play, biggest first: "Baron and 2 towers".
const OBJECTIVE_WORDS: [ObjectiveKind, string, string][] = [
  ["elder", "Elder Dragon", "Elder Dragons"],
  ["baron", "Baron", "Barons"],
  ["atakhan", "Atakhan", "Atakhans"],
  ["inhibitor", "an inhibitor", "inhibitors"],
  ["dragon", "Dragon", "Dragons"],
  ["herald", "Rift Herald", "Rift Heralds"],
  ["grubs", "a Void Grub", "Void Grubs"],
  ["tower", "a tower", "towers"],
];

function objectiveWords(kinds: ObjectiveKind[]): string {
  return listNames(
    OBJECTIVE_WORDS.flatMap(([kind, one, many]) => {
      const count = kinds.filter((k) => k === kind).length;
      return count === 0 ? [] : [count === 1 ? one : `${count} ${many}`];
    }),
  );
}
