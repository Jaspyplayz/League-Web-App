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

import { formatClock, listNames } from "./format";
import type { ObjectiveKind } from "./objectives";
import { between, goldAt, type ReplayData } from "./replay";
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
    return { from, to, kills, objectives, before: chanceAt(from - 1), after: chanceAt(to), mine };
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

export type Grade = "Great" | "Good" | "Even" | "Inaccuracy" | "Mistake";

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

// Great from +4 points, Good from +1, Inaccuracy from −1, Mistake from −4,
// and Even in between. It grades what a play did to the chance, not whether
// it was the right call.
export function gradeOf(swing: number): Grade {
  if (swing >= 4) return "Great";
  if (swing >= 1) return "Good";
  if (swing <= -4) return "Mistake";
  if (swing <= -1) return "Inaccuracy";
  return "Even";
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
  const teamOf = new Map(replay.players.map((p) => [p.participantId, p.teamId]));
  const kills = play.kills.map((i) => replay.kills[i]);
  const objectives = play.objectives.map((i) => replay.objectives[i]);

  // Kills by your team are the enemy team's deaths.
  const won = kills.filter((k) => !ours(teamOf.get(k.victimId) ?? 0)).length;
  const lost = kills.length - won;
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
