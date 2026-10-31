// The gates `npm run can-merge` checks before Claude Code merges its own PR
// (issue #158, docs/adr/0008-agents-merge-two-way-doors.md). Everything here
// is pure, so each gate is tested without GitHub. scripts/can-merge.ts reads
// the PR and main through `gh api` and git, and passes them in.

import { z } from "zod";
import { riskyFiles } from "./risky-paths";

export const SWITCH_FILE = ".claude/agent-merge.json";
export const MERGED_BY_CLAUDE = "merged-by-claude";
// can-merge writes this into every merge commit it makes. The revert gate
// finds Claude's merges by it, not by the label, because main's history
// changes only through a merge, while anyone with access can change a label.
export const MERGE_MARKER = "Merged by Claude Code (npm run can-merge).";

export type CheckState = "success" | "failure" | "pending" | "skipped";
export type Check =
  | { kind: "run"; name: string; workflow: string; state: CheckState }
  | { kind: "status"; name: string; url: string; state: CheckState };

// Each required check counts only from where it really runs, so a commit
// status named "check" doesn't pass for the CI workflow's job.
const REQUIRED_CHECKS: { name: string; where: string; counts: (check: Check) => boolean }[] = [
  { name: "check", where: "the CI workflow", counts: (c) => c.kind === "run" && c.workflow === "CI" },
  { name: "smoke", where: "the Smoke test workflow", counts: (c) => c.kind === "run" && c.workflow === "Smoke test" },
  { name: "Vercel", where: "Vercel", counts: (c) => c.kind === "status" && c.url.startsWith("https://vercel.com/") },
];

// scripts/can-merge-rest.ts builds this from GitHub's REST answers.
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
  /** Every path the head commit changes against main, with both paths of a rename. */
  files: string[];
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

/** A merge commit on main with MERGE_MARKER, and every commit it brought in. */
export type ClaudeMerge = { subject: string; commits: string[] };

/** What can-merge reads from origin/main and from the folder it runs in. */
export type MainState = {
  agentMerge: AgentMerge;
  /** Gate code (scripts/can-merge*, scripts/risky-paths*, package.json) that differs from origin/main here. */
  changedGateCode: string[];
  /** Reverts on main since enabledSince. */
  reverts: RevertCommit[];
  claudeMerges: ClaudeMerge[];
};

/** Lines changed in each file, added plus deleted. A binary file counts 0. */
export type ChangedLines = Record<string, number>;

/** What git says about a PR's commits, for the reviewer gate. */
export type ReviewHistory = {
  /** Lines the PR changes against its base. */
  lines: ChangedLines;
  /**
   * What changed from an earlier commit to the head: how many commits and
   * which lines. Undefined when the commit isn't the head or one before it.
   */
  since: (sha: string) => { commits: number; lines: ChangedLines } | undefined;
};

export type Gate = { name: string; pass: boolean; detail: string };
export type Decision = { ok: boolean; gates: Gate[] };

type Tier = { ok: true; tier: "tiny" | "normal" } | { ok: false; why: string };
type Context = { pr: PrSnapshot; main: MainState; history: ReviewHistory; tier: Tier };
type Result = { pass: boolean; detail: string };

// Agents follow docs/workflow.md, any CLAUDE or AGENTS file and anything in a
// dot folder as rules, so a change to one always gets the reviewer, whatever
// the tier (JAS-12). Windows ignores case, so this does too.
function isRuleFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower === "docs/workflow.md" || /(^|\/)\./.test(lower) || /(^|\/)(claude|agents)[^/]*\.md$/.test(lower);
}

// A doc is a .md file or image in docs/, or the root README.md or
// ARCHITECTURE.md, and never a rule file.
function isDoc(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower === "readme.md" || lower === "architecture.md") return true;
  return /^docs\/.*\.(md|png|jpg|gif|webp)$/.test(lower) && !isRuleFile(lower);
}

function isTest(path: string): boolean {
  return /\.test\.(ts|tsx|mts|mjs|js)$/i.test(path);
}

// A tiny PR skips the reviewer up to this many changed lines outside docs
// (decision record 0017). Past it, "tiny" is a guess the reviewer should check.
export const TINY_LINES = 30;
// A no-blockers verdict still counts after later commits that change up to
// this many lines outside docs and tests, so a should-fix or a postmortem
// entry doesn't need another review (0017).
export const CARRY_OVER_LINES = 40;

function total(lines: ChangedLines, paths: string[]): number {
  return paths.reduce((sum, path) => sum + (lines[path] ?? 0), 0);
}

const pass = (detail: string): Result => ({ pass: true, detail });
const fail = (detail: string): Result => ({ pass: false, detail });

const SAID: Record<CheckState, string> = {
  success: "passed",
  failure: "failed",
  pending: "still running",
  skipped: "skipped",
};

const REVIEWER_GATE = "Reviewer cleared the head commit";

const GATES: { name: string; check: (context: Context) => Result }[] = [
  {
    name: "Gate code matches main",
    check: ({ main }) => {
      if (main.changedGateCode.length === 0) return pass("these gates are origin/main's");
      const changed = main.changedGateCode.join(", ");
      return fail(`changed from origin/main: ${changed}. Run can-merge from an up-to-date main checkout`);
    },
  },
  {
    name: "Agent merging is on",
    check: ({ main: { agentMerge } }) =>
      agentMerge.on ? pass(`enabledSince ${agentMerge.since} on origin/main`) : fail(agentMerge.why),
  },
  {
    name: "No Claude merge was reverted",
    check: ({ main }) => {
      if (!main.agentMerge.on) return pass("nothing to count while merging is off");
      const reverted = new Set(
        main.reverts.flatMap((revert) =>
          revert.reverts.flatMap((sha) => {
            const merge = main.claudeMerges.find(({ commits }) => commits.includes(sha));
            return merge ? [`"${merge.subject}" (reverted in ${revert.sha.slice(0, 7)})`] : [];
          }),
        ),
      );
      if (reverted.size === 0) return pass(`no Claude merge reverted since ${main.agentMerge.since}`);
      return fail(`${[...reverted].join(", ")}. Jasper turns merging back on with a later enabledSince`);
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
      for (const { name, where, counts } of REQUIRED_CHECKS) {
        const runs = pr.checks.filter((check) => check.name === name && counts(check));
        const notPassed = runs.find((check) => check.state !== "success");
        if (runs.length === 0) problems.push(`${name} hasn't reported from ${where}`);
        else if (notPassed) problems.push(`${name} ${SAID[notPassed.state]}`);
      }
      for (const check of pr.checks) {
        const required = REQUIRED_CHECKS.some(({ name, counts }) => check.name === name && counts(check));
        if (!required && (check.state === "failure" || check.state === "pending")) {
          problems.push(`${check.name} ${SAID[check.state]}`);
        }
      }
      if (problems.length > 0) return fail(problems.join("; "));
      return pass("check, smoke and Vercel passed, and no other check failed or is still running");
    },
  },
  { name: REVIEWER_GATE, check: ({ pr, history, tier }) => reviewerResult(pr, history, tier) },
  {
    name: "Acceptance criteria ticked",
    check: ({ pr, tier }) => {
      if (tier.ok && tier.tier === "tiny") return pass("a tiny PR has no acceptance criteria");
      // A box in any list GitHub renders ("-", "*", "+", "1." or "1)"), nested
      // or inside a ">" quote. Only "[x]" counts as ticked, and a "[text](url)"
      // link isn't a box.
      const boxes = section(pr.body, "Acceptance criteria").flatMap((line) => {
        const match = line.match(/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[([^\]]*)\](?!\()/);
        return match ? [{ ticked: /^x$/i.test(match[1]), text: line.trim() }] : [];
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
export function decide(pr: PrSnapshot, main: MainState, history: ReviewHistory): Decision {
  const context: Context = { pr, main, history, tier: readTier(pr.body) };
  const gates = GATES.map(({ name, check }) => ({ name, ...check(context) }));
  return { ok: gates.every((gate) => gate.pass), gates };
}

type ReviewInput = Pick<PrSnapshot, "body" | "headRefOid" | "files">;

// The reviewer gate on its own. GitHub's required `reviewer` check runs it too
// (scripts/can-merge-reviewer-check.ts), so GitHub and can-merge can't
// disagree about whether a PR was reviewed (JAS-15).
export function reviewerCleared(pr: ReviewInput, history: ReviewHistory): Gate {
  return { name: REVIEWER_GATE, ...reviewerResult(pr, history, readTier(pr.body)) };
}

function reviewerResult(pr: ReviewInput, history: ReviewHistory, tier: Tier): Result {
  const tiny = tier.ok && tier.tier === "tiny";
  const code = pr.files.filter((path) => !isDoc(path));
  const codeLines = total(history.lines, code);
  const rules = pr.files.filter(isRuleFile);
  const risky = riskyFiles(pr.files);
  const skips = tiny && rules.length === 0 && risky.length === 0 && codeLines <= TINY_LINES;
  if (skips) {
    if (code.length === 0) return pass("a tiny PR that changes only docs skips the reviewer");
    return pass(`a tiny PR that changes ${codeLines} lines outside docs (up to ${TINY_LINES}) skips the reviewer`);
  }
  const why = !tiny
    ? ""
    : rules.length > 0
      ? `, which a tiny PR needs once it changes ${rules.join(", ")}`
      : risky.length > 0
        ? `, which a tiny PR needs once it changes ${risky.map(({ path }) => path).join(", ")}`
        : `, which a tiny PR needs once it changes more than ${TINY_LINES} lines outside docs (${codeLines} in ${code.join(", ")})`;
  const lines = section(pr.body, "Review").map((line) => line.replace(/[*_`]/g, "").trim());
  const verdicts = lines.flatMap((line) => {
    const match = line.match(/Reviewer agent at ([0-9a-f]{7,40}):\s*(.*)/i);
    return match ? [{ sha: match[1].toLowerCase(), verdict: match[2].trim(), line: match[0].trim() }] : [];
  });
  // A line that names a commit but isn't a verdict, such as PR 209's
  // "Reviewer agent at <sha> (re-review since <since>): no blockers", is
  // skipped, so a failure names it instead of only the commits it did read.
  // Only a line with a colon after the commit looks like a verdict; one that
  // just mentions a commit in passing isn't quoted.
  const misread = new Set(
    lines.filter((line) => /Reviewer agent at [0-9a-f]{7,40}\b[^:]+:/i.test(line) && !/Reviewer agent at [0-9a-f]{7,40}:/i.test(line)),
  );
  const unread =
    misread.size === 0
      ? ""
      : `; couldn't read ${[...misread].map((line) => `"${line}"`).join(", ")}: a verdict reads "Reviewer agent at <sha>: no blockers", and a re-review's "(re-review since <since>)" goes after the verdict`;
  if (verdicts.length === 0) {
    return fail(`the Review section has no "Reviewer agent at <sha>: no blockers" line${why}${unread}`);
  }
  // The newest verdict is the one on the commit closest to the head. A
  // verdict on a commit that isn't on the branch doesn't count.
  const placed = verdicts.flatMap((verdict) => {
    if (pr.headRefOid.startsWith(verdict.sha)) return [{ ...verdict, commits: 0, lines: {} as ChangedLines }];
    const since = history.since(verdict.sha);
    return since ? [{ ...verdict, ...since }] : [];
  });
  if (placed.length === 0) {
    const shas = verdicts.map(({ sha }) => sha.slice(0, 7)).join(", ");
    return fail(`the reviewer saw ${shas}, which isn't the head commit ${pr.headRefOid.slice(0, 7)} or one before it${unread}`);
  }
  const fewest = Math.min(...placed.map(({ commits }) => commits));
  const newest = placed.filter(({ commits }) => commits === fewest);
  const blocked = newest.find(({ verdict }) => !/^no blockers\b/i.test(verdict));
  if (blocked) return fail(`blockers in the newest verdict: "${blocked.line}". A fix for a blocker needs a new review`);
  const { line, sha, commits, lines: since } = newest[0];
  if (commits === 0) return pass(line);
  // Only the PR's own files count, so merging main into the branch doesn't.
  const after = pr.files.filter((path) => (since[path] ?? 0) > 0);
  const changedRules = after.filter(isRuleFile);
  if (changedRules.length > 0) {
    return fail(`${changedRules.join(", ")} changed after the verdict at ${sha.slice(0, 7)}, and a rule change needs a new review`);
  }
  const counted = total(since, after.filter((path) => !isDoc(path) && !isTest(path)));
  if (counted > CARRY_OVER_LINES) {
    return fail(
      `${counted} lines outside docs and tests changed after the verdict at ${sha.slice(0, 7)}, more than the ${CARRY_OVER_LINES} a verdict carries over`,
    );
  }
  return pass(`${line}, carried over ${commits} commits with ${counted} lines outside docs and tests`);
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
  // A "## " line inside a code block isn't a heading.
  let inCode = false;
  const end = rest.findIndex((line) => {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    return !inCode && line.startsWith("## ");
  });
  return end === -1 ? rest : rest.slice(0, end);
}
