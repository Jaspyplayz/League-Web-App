// The gates `npm run can-merge` checks before Claude Code merges its own PR
// (issue #158, docs/adr/0008-agents-merge-two-way-doors.md). Everything here
// is pure, so each gate is tested without GitHub. scripts/can-merge.ts reads
// the PR and main through gh and git, and passes them in.

import { z } from "zod";
import { riskyFiles } from "./risky-paths";

export const SWITCH_FILE = ".claude/agent-merge.json";
export const MERGED_BY_CLAUDE = "merged-by-claude";
const REQUIRED_CHECKS = ["check", "Vercel", "smoke"];

export type CheckState = "success" | "failure" | "pending" | "skipped";
export type Check = { name: string; state: CheckState };

// gh's statusCheckRollup: GitHub Actions and app checks are CheckRuns, and
// Vercel's deployment check is a commit status.
export type RollupEntry =
  | { __typename: "CheckRun"; name: string; status: string; conclusion: string | null }
  | { __typename: "StatusContext"; context: string; state: string };

export function toCheck(entry: RollupEntry): Check {
  if (entry.__typename === "StatusContext") {
    return { name: entry.context, state: statusState(entry.state) };
  }
  return { name: entry.name, state: checkRunState(entry.status, entry.conclusion) };
}

function statusState(state: string): CheckState {
  if (state === "SUCCESS") return "success";
  if (state === "PENDING" || state === "EXPECTED") return "pending";
  return "failure";
}

function checkRunState(status: string, conclusion: string | null): CheckState {
  if (status !== "COMPLETED") return "pending";
  if (conclusion === "SUCCESS") return "success";
  if (conclusion === "NEUTRAL" || conclusion === "SKIPPED") return "skipped";
  return "failure";
}

export type PrSnapshot = {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  isCrossRepository: boolean;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  author: { login: string; isBot: boolean };
  body: string;
  /** Every path the PR changes, with both the old and new path of a rename. */
  files: string[];
  /** The checks on the head commit. */
  checks: Check[];
};

export type AgentMerge = { on: true; since: string } | { on: false; why: string };

const SwitchFile = z.object({ enabledSince: z.iso.date().nullable() });

// `today` is a UTC date. A date after it keeps merging off until that day, so
// a revert can't land in the gap before the revert check starts counting.
export function parseAgentMerge(text: string, today: string): AgentMerge {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { on: false, why: `${SWITCH_FILE} isn't valid JSON` };
  }
  const parsed = SwitchFile.safeParse(json);
  if (!parsed.success) {
    return { on: false, why: `${SWITCH_FILE} needs { "enabledSince": "YYYY-MM-DD" } or null` };
  }
  const since = parsed.data.enabledSince;
  if (since === null) return { on: false, why: `enabledSince is null in ${SWITCH_FILE}` };
  if (since > today) return { on: false, why: `enabledSince ${since} is after today (${today}, UTC)` };
  return { on: true, since };
}

export type RevertCommit = { sha: string; reverts: string[] };

// Reads `git log --format=%H%x1f%cI%x1f%B%x1e` and keeps the commits made on
// or after `since` (a UTC date) whose message says "This reverts commit <sha>".
export function parseReverts(log: string, since: string): RevertCommit[] {
  return log.split("\x1e").flatMap((record) => {
    const [sha, date, message] = record.trim().split("\x1f");
    if (!sha || !date || !message) return [];
    if (new Date(date).toISOString().slice(0, 10) < since) return [];
    const reverts = [...message.matchAll(/This reverts commit ([0-9a-f]{40})/g)].map((match) => match[1]);
    return reverts.length > 0 ? [{ sha, reverts }] : [];
  });
}

/** A PR that a revert commit on main undid. */
export type RevertedPr = { number: number; labels: string[]; revertCommit: string };

export type Gate = { name: string; pass: boolean; detail: string };
export type Decision = { ok: boolean; gates: Gate[] };

type Tier = { ok: true; tier: "tiny" | "normal" } | { ok: false; why: string };
type Context = { pr: PrSnapshot; agentMerge: AgentMerge; reverts: RevertedPr[]; tier: Tier };
type Result = { pass: boolean; detail: string };

const pass = (detail: string): Result => ({ pass: true, detail });
const fail = (detail: string): Result => ({ pass: false, detail });

const SAID: Record<CheckState, string> = {
  success: "passed",
  failure: "failed",
  pending: "still running",
  skipped: "skipped",
};

const GATES: { name: string; check: (context: Context) => Result }[] = [
  {
    name: "Agent merging is on",
    check: ({ agentMerge }) =>
      agentMerge.on ? pass(`enabledSince ${agentMerge.since} on origin/main`) : fail(agentMerge.why),
  },
  {
    name: "No Claude merge was reverted",
    check: ({ agentMerge, reverts }) => {
      if (!agentMerge.on) return pass("nothing to count while merging is off");
      const reverted = reverts.filter((pr) => pr.labels.includes(MERGED_BY_CLAUDE));
      if (reverted.length === 0) return pass(`no ${MERGED_BY_CLAUDE} PR reverted since ${agentMerge.since}`);
      const list = reverted.map((pr) => `#${pr.number} (reverted in ${pr.revertCommit.slice(0, 7)})`);
      return fail(`${list.join(", ")}. Jasper turns merging back on with a new enabledSince`);
    },
  },
  {
    name: "Open and ready",
    check: ({ pr }) => {
      const problems = [
        pr.state !== "OPEN" && `the PR is ${pr.state.toLowerCase()}`,
        pr.isDraft && "the PR is a draft",
        pr.baseRefName !== "main" && `it targets ${pr.baseRefName}, not main`,
      ].filter((problem) => problem !== false);
      return problems.length > 0 ? fail(problems.join("; ")) : pass("open, not a draft, into main");
    },
  },
  {
    name: "Built by Claude Code",
    check: ({ pr }) => {
      const builder = field(pr.body, "Builder");
      const problems = [
        !pr.headRefName.startsWith("claude/") && `the branch ${pr.headRefName} doesn't start with claude/`,
        pr.author.isBot && `opened by a bot (${pr.author.login})`,
        pr.isCrossRepository && "the branch is in a fork",
        builderProblem(builder),
      ].filter((problem) => problem !== false);
      return problems.length > 0 ? fail(problems.join("; ")) : pass(`${pr.headRefName}, Builder: ${builder}`);
    },
  },
  {
    name: "Tiny or normal tier",
    check: ({ tier }) => (tier.ok ? pass(tier.tier) : fail(tier.why)),
  },
  {
    name: "No risky files",
    check: ({ pr }) => {
      const risky = riskyFiles(pr.files);
      if (risky.length === 0) return pass(`none of the ${pr.files.length} changed paths is in scripts/risky-paths.ts`);
      return fail(risky.map(({ path, why }) => `${path} (${why})`).join(", "));
    },
  },
  {
    name: "Checks pass at the head commit",
    check: ({ pr }) => {
      const problems: string[] = [];
      for (const name of REQUIRED_CHECKS) {
        const runs = pr.checks.filter((check) => check.name === name);
        const notPassed = runs.find((check) => check.state !== "success");
        if (runs.length === 0) problems.push(`${name} hasn't reported`);
        else if (notPassed) problems.push(`${name} ${SAID[notPassed.state]}`);
      }
      for (const check of pr.checks) {
        const other = !REQUIRED_CHECKS.includes(check.name);
        if (other && (check.state === "failure" || check.state === "pending")) {
          problems.push(`${check.name} ${SAID[check.state]}`);
        }
      }
      if (problems.length > 0) return fail(problems.join("; "));
      return pass(`${REQUIRED_CHECKS.join(", ")} passed, and no other check failed or is still running`);
    },
  },
  {
    name: "Reviewer cleared the head commit",
    check: ({ pr, tier }) => {
      if (tier.ok && tier.tier === "tiny") return pass("a tiny PR skips the reviewer");
      const verdicts = section(pr.body, "Review").flatMap((line) => {
        const match = line.replace(/[*_`]/g, "").match(/Reviewer agent at ([0-9a-f]{7,40}):\s*(.*)/i);
        return match ? [{ sha: match[1].toLowerCase(), verdict: match[2].trim(), line: match[0].trim() }] : [];
      });
      if (verdicts.length === 0) {
        return fail('the Review section has no "Reviewer agent at <sha>: no blockers" line');
      }
      const atHead = verdicts.filter(({ sha }) => pr.headRefOid.startsWith(sha));
      if (atHead.length === 0) {
        const shas = verdicts.map(({ sha }) => sha.slice(0, 7)).join(", ");
        return fail(`the reviewer saw ${shas}, not the head commit ${pr.headRefOid.slice(0, 7)}`);
      }
      const blocked = atHead.find(({ verdict }) => !/^no blockers\b/i.test(verdict));
      return blocked ? fail(`blockers at the head commit: "${blocked.line}"`) : pass(atHead[0].line);
    },
  },
  {
    name: "Acceptance criteria ticked",
    check: ({ pr, tier }) => {
      if (tier.ok && tier.tier === "tiny") return pass("a tiny PR has no acceptance criteria");
      const boxes = section(pr.body, "Acceptance criteria").flatMap((line) => {
        const match = line.match(/^\s*[-*]\s+\[( |x)\]/i);
        return match ? [{ ticked: match[1] !== " ", text: line.trim() }] : [];
      });
      if (boxes.length === 0) return fail("the Acceptance criteria section has no boxes");
      const open = boxes.filter(({ ticked }) => !ticked);
      if (open.length > 0) {
        return fail(`${open.length} of ${boxes.length} unticked: ${open.map(({ text }) => `"${text}"`).join(", ")}`);
      }
      return pass(`all ${boxes.length} ticked`);
    },
  },
];

// Every gate runs, even after one fails, so the output lists every reason.
export function decide(pr: PrSnapshot, agentMerge: AgentMerge, reverts: RevertedPr[]): Decision {
  const context: Context = { pr, agentMerge, reverts, tier: readTier(pr.body) };
  const gates = GATES.map(({ name, check }) => ({ name, ...check(context) }));
  return { ok: gates.every((gate) => gate.pass), gates };
}

// The template's placeholder, "tiny, normal or risky", names all three, so a
// line that names more than one tier is refused rather than guessed at.
function readTier(body: string): Tier {
  const line = field(body, "Tier");
  if (line === undefined) return { ok: false, why: "no **Tier:** line" };
  const first = line.match(/^\W*(\w+)/)?.[1].toLowerCase();
  const named = new Set([...line.matchAll(/\b(tiny|normal|risky)\b/gi)].map((match) => match[1].toLowerCase()));
  if (first === "risky") return { ok: false, why: "risky tier, so Jasper merges it" };
  if (first !== "tiny" && first !== "normal") {
    return { ok: false, why: `the **Tier:** line starts with "${first ?? ""}", not tiny or normal` };
  }
  if (named.size > 1) {
    return { ok: false, why: `the **Tier:** line names more than one tier (${[...named].join(", ")})` };
  }
  return { ok: true, tier: first };
}

function builderProblem(builder: string | undefined): string | false {
  if (builder === undefined) return "no **Builder:** line";
  if (!/claude code/i.test(builder)) return "the **Builder:** line doesn't name Claude Code";
  if (/cursor|cloud agent|grok|composer/i.test(builder)) return "the **Builder:** line names another builder too";
  return false;
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

// The text after "**Label:**" on the first line that starts with it.
function field(body: string, label: string): string | undefined {
  const prefix = `**${label}:**`;
  const line = lines(body).find((text) => text.trim().startsWith(prefix));
  return line?.trim().slice(prefix.length).trim();
}

// The lines under "## Heading", up to the next "## ".
function section(body: string, heading: string): string[] {
  const all = lines(body);
  const start = all.findIndex((line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start === -1) return [];
  const rest = all.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}
