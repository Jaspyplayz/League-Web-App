// Ranked from the stat rows and habit rates Insights already computed.

import type { StatComparison, StatKey } from "./compare";
import {
  formatClock,
  formatGap,
  formatSigned,
  plural,
  roundedGap,
  type GapOptions,
} from "./format";
import {
  EARLY_GANK_S,
  habitLabel,
  type HabitId,
  type HabitReport,
} from "./habit-trends";
import { positionName } from "@/lib/match-summary";

export type GradedStat = Exclude<StatKey, "enemyHalf">;

// The early-back split sits at the rank's usual time, so that rank does it
// in about half its games. That rate is not a skill you can be behind on.
export type RankHabitId = Exclude<HabitId, "early-back">;

export type SkillId = { kind: "stat"; key: GradedStat } | { kind: "habit"; id: RankHabitId };

export type Domain = "lead" | "from-zero" | "unit";

export type SkillTrack = {
  you: number;
  rank: number;
  zero: number | null;
};

export type SkillFocus =
  | {
      status: "behind";
      id: SkillId;
      label: string;
      sentence: string;
      youText: string;
      rankText: string;
      rankName: string;
      gap: { text: string; tone: "worse" };
      track: SkillTrack;
      games: number;
    }
  | { status: "level"; sentence: string };

type SkillGap = {
  decimals?: number;
  lowerIsBetter?: boolean;
  format?: (size: number) => string;
};

type StatSkill = {
  key: GradedStat;
  label: string;
  subject: string;
  format: (value: number) => string;
  gap: SkillGap;
  scale: number;
  domain: Domain;
};

type HabitSkill = {
  id: RankHabitId;
  youDid: string;
  format: (value: number) => string;
  gap: SkillGap;
  scale: number;
  domain: "unit";
};

const oneDecimal = (value: number) => value.toFixed(1);
const twoDecimals = (value: number) => value.toFixed(2);
const percent = (value: number) => `${Math.round(value * 100)}%`;

const leadGap = { decimals: 0 };
const tenthGap = { decimals: 1 };
const hundredthGap = { decimals: 2 };
const shareGap = { decimals: 2, format: percent };

// `scale` is the rounded gap that scores 1, so a gold lead and a death count share one ranking.
const STAT_SKILLS = {
  goldAt10: {
    key: "goldAt10",
    label: "Gold lead at 10",
    subject: "gold lead at 10",
    format: formatSigned,
    gap: leadGap,
    scale: 400,
    domain: "lead",
  },
  goldAt15: {
    key: "goldAt15",
    label: "Gold lead at 15",
    subject: "gold lead at 15",
    format: formatSigned,
    gap: leadGap,
    scale: 400,
    domain: "lead",
  },
  csAt10: {
    key: "csAt10",
    label: "CS lead at 10",
    subject: "CS lead at 10",
    format: formatSigned,
    gap: leadGap,
    scale: 10,
    domain: "lead",
  },
  csPerMinEarly: {
    key: "csPerMinEarly",
    label: "CS/min, 0 to 10",
    subject: "CS per minute from 0 to 10",
    format: oneDecimal,
    gap: tenthGap,
    scale: 1,
    domain: "from-zero",
  },
  csPerMinMid: {
    key: "csPerMinMid",
    label: "CS/min, 10 to 20",
    subject: "CS per minute from 10 to 20",
    format: oneDecimal,
    gap: tenthGap,
    scale: 1,
    domain: "from-zero",
  },
  earlyDeaths: {
    key: "earlyDeaths",
    label: "Deaths before 14:00",
    subject: "deaths before 14:00",
    format: oneDecimal,
    gap: { decimals: 1, lowerIsBetter: true },
    scale: 1,
    domain: "from-zero",
  },
  xpAt15: {
    key: "xpAt15",
    label: "XP lead at 15",
    subject: "XP lead at 15",
    format: formatSigned,
    gap: leadGap,
    scale: 500,
    domain: "lead",
  },
  earlyTakedowns: {
    key: "earlyTakedowns",
    label: "Kills + assists before 14:00",
    subject: "kill and assist count before 14:00",
    format: oneDecimal,
    gap: tenthGap,
    scale: 1,
    domain: "from-zero",
  },
  visionPerMin: {
    key: "visionPerMin",
    label: "Vision score per minute",
    subject: "vision score per minute",
    format: twoDecimals,
    gap: hundredthGap,
    scale: 0.25,
    domain: "from-zero",
  },
  strongerSide: {
    key: "strongerSide",
    label: "Minutes on the stronger side, 3 to 15",
    subject: "share of minutes on the stronger side from 3 to 15",
    format: percent,
    gap: shareGap,
    scale: 0.1,
    domain: "unit",
  },
  gankTakedowns: {
    key: "gankTakedowns",
    label: "Kills + assists in lanes before 14:00",
    subject: "lane takedown count before 14:00",
    format: oneDecimal,
    gap: tenthGap,
    scale: 1,
    domain: "from-zero",
  },
  objectiveShare: {
    key: "objectiveShare",
    label: "Dragons, grubs and Heralds your team took",
    subject: "share of dragons, grubs and Heralds your team took",
    format: percent,
    gap: shareGap,
    scale: 0.1,
    domain: "unit",
  },
  enemyJungleKills: {
    key: "enemyJungleKills",
    label: "Enemy jungle monsters killed",
    subject: "enemy jungle monster count",
    format: oneDecimal,
    gap: tenthGap,
    scale: 2,
    domain: "from-zero",
  },
  scuttles: {
    key: "scuttles",
    label: "Scuttle crabs",
    subject: "scuttle crab count",
    format: oneDecimal,
    gap: tenthGap,
    scale: 1,
    domain: "from-zero",
  },
} satisfies { [K in GradedStat]: StatSkill & { key: K } };

const HABIT_SKILLS = {
  "level-6-first": {
    id: "level-6-first",
    youDid: "hit level 6 first",
    format: percent,
    gap: shareGap,
    scale: 0.1,
    domain: "unit",
  },
  "first-scuttles": {
    id: "first-scuttles",
    youDid: "took more of the two 3:30 scuttle crabs than the enemy jungler",
    format: percent,
    gap: shareGap,
    scale: 0.1,
    domain: "unit",
  },
  "early-gank": {
    id: "early-gank",
    youDid: `had a kill or assist in a lane before ${formatClock(EARLY_GANK_S * 1000)}`,
    format: percent,
    gap: shareGap,
    scale: 0.1,
    domain: "unit",
  },
} satisfies { [K in RankHabitId]: HabitSkill & { id: K } };

for (const row of [...Object.values(STAT_SKILLS), ...Object.values(HABIT_SKILLS)]) {
  if (!Number.isFinite(row.scale) || row.scale <= 0) {
    throw new Error("A skill scale must be a positive finite number");
  }
}

export type StatRowStyle = {
  label: string;
  format: (value: number) => string;
  gap: GapOptions;
};

// Time in the enemy half is shown on the table and left out of the ranking.
// Invading at the wrong moment gets you killed, so it has no better or worse color.
const ENEMY_HALF: StatRowStyle = {
  label: "Minutes in the enemy half, 3 to 15",
  format: percent,
  gap: { decimals: 2, format: percent, neutral: true },
};

export function statRowStyle(key: StatKey): StatRowStyle {
  if (key === "enemyHalf") return ENEMY_HALF;
  const row = STAT_SKILLS[key];
  return { label: row.label, format: row.format, gap: row.gap };
}

export function isRankHabit(id: HabitId): id is RankHabitId {
  return id !== "early-back";
}

type Behind = Extract<SkillFocus, { status: "behind" }>;

export function skillToImprove(
  stats: readonly StatComparison[] | null,
  habits: HabitReport | null,
  rankName: string,
): SkillFocus | null {
  let best: { score: number; focus: Behind } | null = null;
  let sawAhead = false;
  let sawEven = false;
  let graded = false;

  const note = (judged: Grade): Grade | null => {
    if (judged.tone === "skip") return null;
    graded = true;
    if (judged.tone === "better") sawAhead = true;
    else if (judged.tone === "even") sawEven = true;
    return judged;
  };

  const beats = (score: number) => best === null || score > best.score;

  for (const row of Object.values(STAT_SKILLS)) {
    const found = stats?.find((item) => item.key === row.key);
    if (!found) continue;
    const judged = note(grade(found.you, found.them, row.gap, row.scale));
    if (judged?.tone !== "worse" || !beats(judged.score)) continue;
    best = {
      score: judged.score,
      focus: {
        status: "behind",
        id: { kind: "stat", key: row.key },
        label: row.label,
        sentence: statSentence(row, judged.text, rankName, found.games),
        youText: row.format(found.you),
        rankText: row.format(found.them),
        rankName,
        gap: { text: judged.text, tone: "worse" },
        track: trackOf(row.domain, found.you, found.them),
        games: found.games,
      },
    };
  }

  if (habits) {
    for (const row of Object.values(HABIT_SKILLS)) {
      const found = habits.habits.find((item) => item.id === row.id);
      if (!found || !isRankHabit(found.id) || found.rank === null) continue;
      const youGames = found.you.with.games + found.you.without.games;
      const rankGames = found.rank.with.games + found.rank.without.games;
      if (youGames === 0 || rankGames === 0) continue;
      const you = found.you.with.games / youGames;
      const them = found.rank.with.games / rankGames;
      const judged = note(grade(you, them, row.gap, row.scale));
      if (judged?.tone !== "worse" || !beats(judged.score)) continue;
      best = {
        score: judged.score,
        focus: {
          status: "behind",
          id: { kind: "habit", id: found.id },
          label: habitLabel(found.id),
          sentence: habitSentence(
            habits,
            row.youDid,
            found.you.with.games,
            youGames,
            found.rank.with.games,
            rankGames,
            rankName,
          ),
          youText: row.format(you),
          rankText: row.format(them),
          rankName,
          gap: { text: judged.text, tone: "worse" },
          track: trackOf(row.domain, you, them),
          games: youGames,
        },
      };
    }
  }

  if (!graded) return null;
  if (best) return best.focus;
  if (sawAhead && sawEven) {
    return {
      status: "level",
      sentence: `You are level with ${rankName} on some skills that had enough games, and ahead on the others.`,
    };
  }
  if (sawAhead) {
    return {
      status: "level",
      sentence: `You are ahead of ${rankName} on every skill that had enough games.`,
    };
  }
  return {
    status: "level",
    sentence: `You are level with ${rankName} on every skill that had enough games.`,
  };
}

type Grade =
  | { tone: "skip" }
  | { tone: "better" }
  | { tone: "even" }
  | { tone: "worse"; score: number; text: string };

function grade(you: number, them: number, options: SkillGap, scale: number): Grade {
  if (!Number.isFinite(you) || !Number.isFinite(them)) return { tone: "skip" };
  const gap = formatGap(you, them, options);
  if (gap.tone !== "worse") return { tone: gap.tone };
  const score = Math.abs(roundedGap(you, them, options.decimals ?? 0)) / scale;
  return { tone: "worse", score, text: gap.text };
}

function statSentence(row: StatSkill, gapText: string, rankName: string, games: number): string {
  const across = `across ${plural(games, "game")}`;
  const main = row.gap.lowerIsBetter
    ? `Your ${row.subject} are ${gapText} than ${rankName} ${across}.`
    : `Your ${row.subject} is ${gapText} ${rankName} ${across}.`;
  const rough = games < 8 ? ` That's ${plural(games, "game")}, so it's a rough read.` : "";
  const lead =
    row.domain === "lead" ? " That number is a lead over each player's own lane opponent." : "";
  return main + rough + lead;
}

function habitSentence(
  report: HabitReport,
  youDid: string,
  youWith: number,
  youGames: number,
  rankWith: number,
  rankGames: number,
  rankName: string,
): string {
  const role = positionName(report.position)?.toLowerCase();
  const roleNoun = role ? `${role} game` : "game";
  const rough = youGames < 8 ? ` That's ${plural(youGames, "game")}, so it's a rough read.` : "";
  return (
    `You ${youDid} in ${youWith} of ${plural(youGames, roleNoun)}. ` +
    `${rankName} did in ${rankWith} of ${plural(rankGames, "game")}.` +
    rough +
    " These are patterns across games, not advice for any one of them."
  );
}

// Leads are signed, so the line can start below zero. The zero tick exists
// only when that span crosses even. A lead from 0 to 800 has no tick.
function trackOf(domain: Domain, you: number, them: number): SkillTrack {
  const low = domain === "lead" ? Math.min(you, them, 0) : 0;
  const high = domain === "unit" ? 1 : Math.max(you, them, 0);
  const mark = (value: number) => (high === low ? 0.5 : (value - low) / (high - low));
  return {
    you: mark(you),
    rank: mark(them),
    zero: domain === "lead" && low < 0 && 0 < high ? mark(0) : null,
  };
}
