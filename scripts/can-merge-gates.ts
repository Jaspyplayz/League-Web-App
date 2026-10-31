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

/** Lines added and deleted in one file. */
export type FileChange = { added: number; deleted: number };
export type ChangedLines = Record<string, FileChange>;

// git shows no line counts for a binary file, so one counts as this many
// added lines: more than either limit below, so a binary outside docs always
// gets the reviewer.
export const BINARY_LINES = 1000;

/** What git says about a PR's commits, for the reviewer gate. */
export type ReviewHistory = {
  /** Lines the PR changes against its base. */
  lines: ChangedLines;
  /**
   * For a commit the PR added: how many of the PR's commits came after it,
   * every file changed since (a mode-only change counts 0 lines), and the
   * files the PR changed at that commit, and the files added since. Undefined
   * for any other commit, such as one from main or one a force push dropped.
   */
  since: (sha: string) => { commits: number; lines: ChangedLines; files: string[]; created: string[] } | undefined;
};

export type Gate = { name: string; pass: boolean; detail: string };
export type Decision = { ok: boolean; gates: Gate[] };

type Tier = { ok: true; tier: "tiny" | "normal" } | { ok: false; why: string };
type Context = { pr: PrSnapshot; main: MainState; history: ReviewHistory; tier: Tier };
type Result = { pass: boolean; detail: string };

// Agents follow docs/workflow.md, the skill setup in docs/agents/, any CLAUDE
// or AGENTS file and anything in a dot folder as rules, so a change to one
// always gets the reviewer, whatever the tier (JAS-12). Windows ignores case,
// so this does too.
function isRuleFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower === "docs/workflow.md" ||
    lower.startsWith("docs/agents/") ||
    /(^|\/)\./.test(lower) ||
    /(^|\/)(claude|agents)[^/]*\.md$/.test(lower)
  );
}

// A doc is a .md file or image in docs/, or the root README.md,
// ARCHITECTURE.md or GLOSSARY.md, and never a rule file.
function isDoc(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower === "readme.md" || lower === "architecture.md" || lower === "glossary.md") return true;
  return /^docs\/.*\.(md|png|jpg|gif|webp)$/.test(lower) && !isRuleFile(lower);
}

function isTest(path: string): boolean {
  return /\.test\.(ts|tsx|mts|mjs|js)$/i.test(path);
}

// A tiny PR skips the reviewer up to this many changed lines outside docs
// (decision record 0017). Past it, "tiny" is a guess the reviewer should check.
export const TINY_LINES = 30;
// A no-blockers verdict still counts after later commits that change up to
// this many lines outside docs, so a should-fix or a postmortem entry doesn't
// need another review (0017). A test file added since the verdict is free;
// a change to one that was already there counts, so a test can't be
// weakened unseen.
export const CARRY_OVER_LINES = 40;

function size(lines: ChangedLines, path: string): number {
  const change = lines[path];
  return change ? change.added + change.deleted : 0;
}

function total(lines: ChangedLines, paths: string[]): number {
  return paths.reduce((sum, path) => sum + size(lines, path), 0);
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const pass = (detail: string): Result => ({ pass: true, detail });
const fail = (detail: string): Result => ({ pass: false, detail });

const SAID: Record<CheckState, string> = {
  success: "passed",
  failure: "failed",
  pending: "still running",
  skipped: "skipped",
};

const REVIEWER_GATE = "Reviewer cleared the PR";

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
      return problems.length > 0 ? fail(problems.join("; ")) : pass(`${pr.headRefName}, Builder: ${"value" in builder ? builder.value : ""}`);
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
      // Fail closed (JAS-58): a ticked box counts only on a line GitHub shows
      // whole, but an unticked one counts even inside a code block or comment.
      const criteria = section(pr.body, "Acceptance criteria");
      if ("why" in criteria) return fail(criteria.why);
      const box = (line: string) => line.match(/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[([^\]]*)\](?!\()/);
      const boxes = criteria.shown.flatMap((line, i) => {
        const raw = criteria.raw[i];
        const match = line === raw ? box(line) : null;
        if (match) return [{ ticked: /^x$/i.test(match[1]), text: line.trim() }];
        const hidden = box(raw);
        return hidden && !/^x$/i.test(hidden[1]) ? [{ ticked: false, text: raw.trim() }] : [];
      });
      // The section may end early where GitHub shows no heading, such as at
      // a "# " comment in a list item's code block, so an unticked box later
      // in the body still counts.
      for (const raw of criteria.rest) {
        const hidden = box(raw);
        if (hidden && !/^x$/i.test(hidden[1])) boxes.push({ ticked: false, text: raw.trim() });
      }
      if (boxes.length === 0) return fail("the Acceptance criteria section has no boxes");
      const open = boxes.filter(({ ticked }) => !ticked);
      if (open.length > 0) {
        return fail(`${open.length} of ${boxes.length} unticked: ${open.map(({ text }) => `"${text}"`).join(", ")}`);
      }
      return pass(`all ${boxes.length} ticked`);
    },
  },
];

// can-merge exits with this code when a gate fails, and with 1 when it
// crashes (Node's code for an uncaught error). The Agent merge workflow tells
// them apart: a refusal is normal while checks still run, a crash isn't.
export const REFUSED_EXIT_CODE = 2;

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

// In this order: a verdict, if there is one, decides, so a tiny PR can't skip
// past blockers the reviewer found. With none, a small tiny PR skips the
// reviewer. A verdict on an earlier commit carries over small changes.
function reviewerResult(pr: ReviewInput, history: ReviewHistory, tier: Tier): Result {
  const read = readVerdicts(pr.body);
  if ("why" in read) return fail(read.why);
  const { verdicts } = read;
  if (verdicts.length === 0) {
    const skip = tinySkip(pr, history, tier);
    if (skip.pass) return skip;
    return fail(`the Review section has no "Reviewer agent at <sha>: no blockers" line${skip.detail}`);
  }
  const placed = verdicts.flatMap((verdict) => {
    if (pr.headRefOid.startsWith(verdict.sha)) {
      return [{ ...verdict, commits: 0, lines: {} as ChangedLines, files: [] as string[], created: [] as string[] }];
    }
    const since = history.since(verdict.sha);
    return since ? [{ ...verdict, ...since }] : [];
  });
  // A blockers verdict on a commit a force push dropped would otherwise
  // vanish and let an older clean verdict count again. A clean review of the
  // head itself still clears it.
  const lost = verdicts.find((verdict) => !placed.some(({ line }) => line === verdict.line) && !isClean(verdict.verdict));
  const cleanAtHead = placed.some(({ commits, verdict }) => commits === 0 && isClean(verdict));
  if (lost && !cleanAtHead) return fail(`"${lost.line}" names a commit that isn't on the branch any more, and a fix for a blocker needs a new review`);
  if (placed.length === 0) {
    const shas = verdicts.map(({ sha }) => sha.slice(0, 7)).join(", ");
    return fail(`the reviewer saw ${shas}, which isn't the head commit ${pr.headRefOid.slice(0, 7)} or one this PR added before it`);
  }
  // The newest verdict is the one with the fewest of the PR's commits after it.
  const fewest = Math.min(...placed.map(({ commits }) => commits));
  const newest = placed.filter(({ commits }) => commits === fewest);
  const blocked = newest.find(({ verdict }) => !isClean(verdict));
  if (blocked) return fail(`blockers in the newest verdict: "${blocked.line}". A fix for a blocker needs a new review`);
  return carryOver(pr, newest[0]);
}

type Verdict = { sha: string; verdict: string; line: string };

const isClean = (verdict: string) => /^no blockers\b/i.test(verdict);

// A verdict is the reviewer's first line, copied in as written: up to 3
// spaces, at most bold or code around it, and the start of a paragraph or
// right after another verdict. Any other line that names a
// commit like a verdict fails the gate instead of being skipped, such as one
// after a bullet or other words, one GitHub hides in a comment or shows as
// code, or PR 209's "Reviewer agent at <sha> (re-review since <since>): no
// blockers". Skipping it could let an older clean verdict count over newer
// blockers (JAS-58).
const VERDICT = /^ {0,3}(?:\*\*|__|`+)?Reviewer agent at ([0-9a-f]{7,40}):\s*(.*)$/i;
const LOOKS_LIKE_VERDICT = /Reviewer agent at [0-9a-f]{7,40}\b[^:]*:/i;

function readVerdicts(body: string): { verdicts: Verdict[] } | { why: string } {
  const review = section(body, "Review");
  if ("why" in review && !("missing" in review)) return { why: review.why };
  if ("why" in review) {
    // No heading the gate can read, but GitHub may show one it doesn't, such
    // as "## Review:" or a setext heading, so a verdict anywhere still fails
    // rather than letting a tiny PR skip past it.
    const stray = body.split(/\r?\n/).filter((line) => LOOKS_LIKE_VERDICT.test(line.replace(/[*_`]/g, "")));
    if (stray.length === 0) return { verdicts: [] };
    const quoted = stray.map((line) => `"${line.trim()}"`).join(", ");
    return { why: `found no "## Review" heading the gate can read, but ${quoted} names a commit like a verdict. Put verdicts under a "## Review" line of their own` };
  }
  const verdicts: Verdict[] = [];
  const unread = new Set<string>();
  // Where the gate's reading of the section went wrong, if it did, so the
  // message can name the cause and not just the verdict it couldn't read.
  // Only for a verdict the gate reads as code or a comment, or one after the
  // section ended somewhere other than a real heading.
  let hiddenFrom: string | undefined;
  let cause: string | undefined;
  let afterVerdict = false;
  review.shown.forEach((line, i) => {
    const raw = review.raw[i];
    // Reset at each line GitHub surely shows, so the cause is the nearest one.
    if (line !== raw) hiddenFrom ??= raw.trim();
    else if (raw.trim() !== "") hiddenFrom = undefined;
    // Right after the heading, a blank line or another verdict, nothing
    // earlier in a paragraph can hide this line.
    const paragraph = i === 0 || review.raw[i - 1].trim() === "" || afterVerdict;
    const match = line === raw && paragraph ? line.match(VERDICT) : null;
    afterVerdict = match !== null;
    if (match) {
      const verdict = match[2].replace(/[*_`]/g, "").trim();
      const text = `Reviewer agent at ${match[1]}: ${verdict}`;
      verdicts.push({ sha: match[1].toLowerCase(), verdict, line: text });
    } else if (LOOKS_LIKE_VERDICT.test(raw.replace(/[*_`]/g, ""))) {
      unread.add(raw.trim());
      if (line !== raw && hiddenFrom !== undefined && hiddenFrom !== raw.trim()) {
        cause ??= `the gate reads the lines from "${hiddenFrom}" on as code or a comment`;
      }
    }
  });
  // The section may end early where GitHub shows no heading, so a verdict
  // later in the body is never safe to skip either.
  for (const raw of review.rest) {
    if (LOOKS_LIKE_VERDICT.test(raw.replace(/[*_`]/g, ""))) {
      unread.add(raw.trim());
      const end = review.rest[0];
      if (!/^#{1,2}[ \t]/.test(end)) cause ??= `the gate's Review section ended at "${end.trim()}", which it reads as a heading`;
    }
  }
  if (unread.size > 0) {
    const quoted = [...unread].map((line) => `"${line}"`).join(", ");
    const fix = cause ? ` (${cause}; start a code block's fence on a line of its own, not after "- " or "1. ")` : "";
    return {
      why: `couldn't read ${quoted}${fix}: a verdict is a line of its own after a blank line, reading "Reviewer agent at <sha>: no blockers", with a re-review's "(re-review since <since>)" after the verdict. Quote other reviews without their "at <sha>:"`,
    };
  }
  return { verdicts };
}

// A pass, or a fail whose detail says why a tiny PR still needs the reviewer.
function tinySkip(pr: ReviewInput, history: ReviewHistory, tier: Tier): Result {
  if (!(tier.ok && tier.tier === "tiny")) return fail("");
  const rules = pr.files.filter(isRuleFile);
  if (rules.length > 0) return fail(`, which a tiny PR needs once it changes ${rules.join(", ")}`);
  const risky = riskyFiles(pr.files).map(({ path }) => path);
  if (risky.length > 0) return fail(`, which a tiny PR needs once it changes ${risky.join(", ")}`);
  const code = pr.files.filter((path) => !isDoc(path));
  if (code.length === 0) return pass("a tiny PR that changes only docs skips the reviewer");
  const lines = total(history.lines, code);
  if (lines <= TINY_LINES) return pass(`a tiny PR that changes ${lines} lines outside docs (up to ${TINY_LINES}) skips the reviewer`);
  return fail(`, which a tiny PR needs once it changes more than ${TINY_LINES} lines outside docs (${lines} in ${code.join(", ")})`);
}

function carryOver(
  pr: ReviewInput,
  verdict: Verdict & { commits: number; lines: ChangedLines; files: string[]; created: string[] },
): Result {
  const { line, sha, commits, lines, files, created } = verdict;
  if (commits === 0) return pass(line);
  // The PR's files now and at the verdict, so a file put back to main's
  // version still counts. Main's changes to other files, merged in, don't.
  // Main's changes to these files do, which can ask for a review nobody
  // needed but never skips one.
  const after = [...new Set([...pr.files, ...files])].filter((path) => path in lines);
  const guarded = [...after.filter(isRuleFile), ...riskyFiles(after).map(({ path }) => path)];
  if (guarded.length > 0) {
    const named = [...new Set(guarded)].join(", ");
    return fail(`${named} changed after the verdict at ${sha.slice(0, 7)}, and a change to a rule file or risky path needs a new review`);
  }
  const counted = total(lines, after.filter((path) => !isDoc(path) && !(isTest(path) && created.includes(path))));
  if (counted > CARRY_OVER_LINES) {
    return fail(
      `${counted} lines outside docs changed after the verdict at ${sha.slice(0, 7)}, more than the ${CARRY_OVER_LINES} a verdict carries over`,
    );
  }
  return pass(`${line}, carried over ${plural(commits, "commit")} with ${plural(counted, "line")} outside docs`);
}

// The template's placeholder, "tiny, normal or risky", names all three, so a
// line that names more than one tier is refused rather than guessed at.
function readTier(body: string): Tier {
  const tier = field(body, "Tier");
  if (!("value" in tier)) return { ok: false, why: tier.why };
  const line = tier.value;
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

function builderProblem(builder: Field): string | false {
  if (!("value" in builder)) return builder.why;
  if (!/claude code/i.test(builder.value)) return "the **Builder:** line doesn't name Claude Code";
  if (/cursor|cloud agent|grok|composer/i.test(builder.value)) return "the **Builder:** line names another builder too";
  return false;
}

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

type Field = { value: string } | { why: string };

// Ignores list and quote markers and indentation, to count every line that
// could pass for a heading or field somewhere GitHub shows it differently.
const CONTAINER = String.raw`^(?:\s|>|[-+*]\s|\d+[.)]\s)*`;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The text after "**Label:**" on the one line that starts with it. A second
// such line anywhere, even in a code block or comment, fails closed: the
// readers below can't promise to agree with GitHub on which one it shows.
function field(body: string, label: string): Field {
  const prefix = `**${label}:**`;
  const candidates = new RegExp(`${CONTAINER}${escape(prefix)}`);
  const count = lines(body).filter((line) => candidates.test(line)).length;
  if (count > 1) return { why: `${count} lines start with ${prefix}; keep one` };
  const { raw, shown } = bodyLines(body);
  const index = shown.findIndex((text, i) => text === raw[i] && /^ {0,3}\S/.test(text) && text.trim().startsWith(prefix));
  if (index === -1) return { why: `no ${prefix} line` };
  return { value: shown[index].trim().slice(prefix.length).trim() };
}

// A fence opens a code block: up to 3 spaces, then 3 or more backticks with
// no backtick after them on the line, or 3 or more tildes. Only a fence of
// the same character, at least as long, with nothing after it closes the
// block, and one that never closes runs to the end.
const FENCE = /^ {0,3}(?:(`{3,})(?!.*`)|(~{3,}))/;

// An inline code span: a run of backticks, closed by a run of the same
// length, so "`<!--``" isn't one.
const CODE_SPAN = /(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g;

// The body's lines as written, and as GitHub shows them as text: a line
// inside a code block is "", and so is the part of a line inside an HTML
// comment. The two lists line up, so a reader can compare a line with what
// was written (JAS-58).
function bodyLines(body: string): { raw: string[]; shown: string[] } {
  const raw = lines(body);
  let fence: string | undefined;
  let inComment = false;
  const shown = raw.map((line) => {
    if (fence !== undefined) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = undefined;
      return "";
    }
    const open = inComment ? null : line.match(FENCE);
    if (open) {
      fence = open[1] ?? open[2];
      return "";
    }
    // A "<!--" inside a code span is text, so look for one with code spans
    // blanked out. A comment ends at the first "-->", code span or not.
    const marks = line.replace(CODE_SPAN, (span) => " ".repeat(span.length));
    let text = "";
    let at = 0;
    while (at < line.length) {
      if (inComment) {
        const end = line.indexOf("-->", at);
        if (end === -1) return text;
        inComment = false;
        at = end + 3;
      } else {
        const start = marks.indexOf("<!--", at);
        if (start === -1) return text + line.slice(at);
        text += line.slice(at, start);
        inComment = true;
        at = start + 4;
      }
    }
    return text;
  });
  return { raw, shown };
}

// The text of a "## " heading GitHub shows: up to 3 spaces before it, since
// 4 make a code block, and optional closing #s. "##" alone is an empty one.
function headingText(line: string): string | undefined {
  const match = line.match(/^ {0,3}##(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/);
  return match ? (match[1] ?? "") : undefined;
}

type Section = { shown: string[]; raw: string[]; rest: string[] } | { why: string; missing?: true };

// The lines under "## Heading", as written and as shown, up to the next "#"
// or "##" heading, and the raw lines after it. A "# " line GitHub shows as
// code, such as a comment in a list item's code block, ends it too early, so
// the gates still look for failing lines in the rest. Fails closed when
// anything else in the body could pass for the same heading, such as one in
// a list item's code block, since GitHub might show that one and hide this
// one (JAS-58).
function section(body: string, heading: string): Section {
  const { raw, shown } = bodyLines(body);
  const lookalike = new RegExp(`${CONTAINER}#{1,6}\\s*${escape(heading)}[\\s#]*$`, "i");
  const count = raw.filter((line) => lookalike.test(line)).length;
  if (count > 1) return { why: `the description has ${count} lines that look like a "## ${heading}" heading; keep only the real one` };
  const start = shown.findIndex((line, i) => line === raw[i] && headingText(line)?.toLowerCase() === heading.toLowerCase());
  if (start === -1 && count === 1) {
    // GitHub may well show it while the gate can't, such as after a code
    // block that starts after "- ", so it isn't safe to treat as missing: a
    // tiny PR would skip past blockers under it.
    const at = raw.findIndex((line) => lookalike.test(line));
    if (shown[at] === raw[at]) {
      return { why: `"${raw[at].trim()}" isn't read as a "## ${heading}" heading; write it as "## ${heading}" on a line of its own` };
    }
    return {
      why: `the gate can't see the "## ${heading}" heading: something above it, such as a code block that starts after "- " or a "<!--" in a paragraph, hides it. Start the fence on a line of its own, or put the "<!--" in backticks`,
    };
  }
  if (start === -1) return { why: `no "## ${heading}" section`, missing: true };
  const end = shown.findIndex((line, i) => i > start && /^ {0,3}#{1,2}(?:[ \t]|$)/.test(line));
  const stop = end === -1 ? raw.length : end;
  return { shown: shown.slice(start + 1, stop), raw: raw.slice(start + 1, stop), rest: raw.slice(stop) };
}
