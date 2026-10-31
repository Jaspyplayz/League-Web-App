// Every figure How it works shows, worked out from the three model files and
// the code, so the page stays right after a retrain. Each function takes the
// models as arguments, which lets the tests hand it a "retrained" copy and
// check the page follows.

import { listNames } from "@/lib/analyzer/format";
import { PHASES, type PhaseModel } from "@/lib/analyzer/phase-score";
import type { ScoreModel } from "@/lib/analyzer/score";
import {
  whatIfChance,
  WIN_CHANCE_FEATURES,
  withRank,
  type Evaluation,
  type WhatIf,
  type WinChanceModel,
} from "@/lib/analyzer/win-chance";
import { RIOT_LIMITS } from "@/lib/riot/rate-limit";

export type Models = { winChance: WinChanceModel; score: ScoreModel; phases: PhaseModel };

// Two figures that aren't in a model file. figures.test.ts checks each one
// against where it really comes from, so neither can drift unnoticed.
// The golden tests' saved games (src/lib/analyzer/fixtures/).
export const GOLDEN_GAMES = 4;
// The replay's item check: players whose rebuilt items matched what Riot says
// they ended with (docs/replay.md, "All six items").
export const ITEM_CHECK = { matched: 1370, players: 1370 };

// The minute the accuracy figures quote, where the game is decided often
// enough to be interesting but most games are still going.
const QUOTED_MINUTE = 20;

// What the rank table's last column asks the model about.
export const RANK_LEAD: WhatIf = {
  minute: QUOTED_MINUTE,
  goldLead: 3000,
  xpLead: 2000,
  dragonLead: 0,
  inhibitorLead: 0,
  baron: 0,
};

export type GlanceRow = { name: string; gives: string; learnedFrom: string; result: string };

// The table at the top: what each model gives, what it learned from and how
// it did on games it never saw.
export function glanceRows({ winChance, score, phases }: Models): GlanceRow[] {
  const quoted = atMinute(winChance.evaluation, QUOTED_MINUTE);
  const phaseAccuracy = PHASES.flatMap((p) => {
    const model = phases.phases[p.key];
    return model ? [`${percent(model.shared.accuracy)} ${p.key}`] : [];
  });
  const firstPhase = PHASES.map((p) => phases.phases[p.key]).find(Boolean);
  return [
    {
      name: "Win chance",
      gives: "Each team’s chance to win at every minute",
      learnedFrom: `${count(winChance.games)} ranked games, patches ${winChance.patches[0]} to ${winChance.patches.at(-1)}`,
      result: quoted
        ? `Right ${percent(quoted.accuracy)} of the time at ${quoted.minute}:00, where “more gold wins” gets ${percent(quoted.goldRule)} (both flattered; see Win chance)`
        : `Right ${percent(winChance.evaluation.accuracy)} of the time`,
    },
    {
      name: "Game score",
      gives: "A 0 to 100 rating for all ten players",
      learnedFrom: `${count(score.games)} games, ${count(score.shared.samples)} players`,
      result: score.unseen
        ? `Picks the winning side ${percent(score.unseen.accuracy)} of the time on ${count(score.unseen.games)} later games`
        : `Picks the winning side ${percent(score.shared.accuracy)} of the time in cross-validation`,
    },
    {
      name: "Early, mid and late ratings",
      gives: "A 0 to 100 rating for each phase of your game",
      learnedFrom: `${count(firstPhase?.games ?? 0)} ranked games`,
      result: `Picks the winner ${listNames(phaseAccuracy)}`,
    },
  ];
}

export type WeightBar = {
  label: string;
  // "0.397", or "−0.206" with a real minus sign.
  value: string;
  // Whether a lead here raises the chance (blue) or lowers it (red).
  helps: boolean;
  // Whether this weight only adjusts another lead (grey), like the gold lead
  // counting for less late in the game.
  adjusts: boolean;
  // How long the bar is, from 0 to 1, where the biggest weight is 1.
  share: number;
};

// The weights that matter, biggest first. Those near 0 (kills, towers) are
// explained in words under the bars.
export function weightBars(model: WinChanceModel): WeightBar[] {
  const weights = WIN_CHANCE_FEATURES.map((f, i) => ({ label: f.label, weight: model.weights[i] }))
    .filter((w) => Math.abs(w.weight) >= 0.05)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const biggest = Math.max(...weights.map((w) => Math.abs(w.weight)));
  return weights.map((w) => ({
    // Drop the note on how a buff is counted ("Elder buff (1 blue, -1 red)"):
    // it's for the training output, and the page reads every lead from your
    // team's side.
    label: capitalize(w.label.replace(/ \(.*\)$/, "")),
    value: `${w.weight < 0 ? "−" : ""}${Math.abs(w.weight).toFixed(3)}`,
    helps: w.weight > 0,
    // A red bar here would wrongly say a gold lead hurts.
    adjusts: w.label.includes(" times "),
    share: Math.abs(w.weight) / biggest,
  }));
}

// Short names for the phase models' stats, for "counts most". The keys are
// PHASE_FEATURES' in src/lib/analyzer/phase-score.ts.
const PHASE_STAT_NAMES: Record<string, string> = {
  kda: "KDA",
  deathsPer10: "deaths",
  killParticipation: "kill participation",
  damageShare: "damage share",
  damagePerMin: "damage",
  goldShare: "gold share",
  csPerMin: "CS",
  goldLeadPerMin: "gold lead",
  xpLeadPerMin: "XP lead",
  epicShare: "epic monsters",
};

export type PhaseRow = {
  key: string;
  name: string;
  span: string;
  games: string;
  accuracy: string;
  countsMost: string;
};

// One row per rated phase. "Counts most" is the three stats with the biggest
// weights; each stat is compared with its role's normal first, so the
// weights can be compared with each other.
export function phaseRows(model: PhaseModel): PhaseRow[] {
  return PHASES.flatMap((phase) => {
    const m = model.phases[phase.key];
    if (!m) return [];
    const top = m.shared.weights
      .map((weight, i) => ({
        name: PHASE_STAT_NAMES[model.features[i]] ?? model.features[i],
        weight,
      }))
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      .slice(0, 3)
      .map((s) => s.name);
    return [
      {
        key: phase.key,
        name: phase.label,
        span: phaseSpan(phase),
        games: count(m.games),
        accuracy: percent(m.shared.accuracy),
        countsMost: capitalize(top.join(", ")),
      },
    ];
  });
}

// "0 to 14:00", "25:00 to the end".
export function phaseSpan(phase: (typeof PHASES)[number]): string {
  const from = phase.from === 0 ? "0" : `${phase.from}:00`;
  return `${from} to ${phase.to === null ? "the end" : `${phase.to}:00`}`;
}

export type RankRow = {
  key: string;
  label: string;
  games: string;
  // Accuracy at 20:00 of the rank's own model, and of the all-ranks model on
  // the same games.
  own: string;
  allRanks: string;
  // What RANK_LEAD is worth with the rank's own model.
  lead: string;
};

export function rankRows(model: WinChanceModel): RankRow[] {
  const at = (e: Evaluation) => percent(atMinute(e, QUOTED_MINUTE)?.accuracy ?? 0);
  return model.ranks.map((r) => ({
    key: r.key,
    label: r.label,
    games: count(r.games),
    own: at(r.evaluation),
    allRanks: at(r.allRanks),
    lead: percent(whatIfChance(withRank(model, r), RANK_LEAD)),
  }));
}

export type CheckRow = { name: string; what: string; figure: string };

// "How it's checked": what runs before anything ships, each with a figure.
export function checkRows(models: Models): CheckRow[] {
  return [
    {
      name: "Tested on games it never saw",
      what: "Every accuracy on this page comes from games the model didn’t train on.",
      figure: `${glanceRows(models).length} models`,
    },
    {
      name: "Golden tests",
      what: `The analyzer’s findings on ${GOLDEN_GAMES} real games are saved, and every change is compared with them.`,
      figure: `${GOLDEN_GAMES} games`,
    },
    {
      name: "Rebuilt items",
      what: "The replay rebuilds every player’s items from Riot’s purchase log, then compares them with the items Riot says each player ended with.",
      figure: `${count(ITEM_CHECK.matched)} of ${count(ITEM_CHECK.players)}`,
    },
    {
      name: "Checks on every change",
      what: "Lint, type checks, unit tests and a production build run before anything merges; a browser test and an accessibility scan run on each preview.",
      figure: "Every PR",
    },
  ];
}

// Riot's slowest limit, the one a busy page runs into: "100 requests every
// 2 minutes".
export function riotLimit(): string {
  const slowest = RIOT_LIMITS.reduce((a, b) => (b.seconds > a.seconds ? b : a));
  const time =
    slowest.seconds % 60 === 0
      ? `${slowest.seconds / 60} minute${slowest.seconds === 60 ? "" : "s"}`
      : `${slowest.seconds} seconds`;
  return `${slowest.requests} requests every ${time}`;
}

function atMinute(e: Evaluation, minute: number) {
  return e.byMinute.find((m) => m.minute === minute);
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function count(n: number): string {
  return n.toLocaleString("en-US");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
