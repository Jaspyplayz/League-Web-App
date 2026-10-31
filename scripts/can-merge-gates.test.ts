import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CARRY_OVER_LINES,
  decide as decideGates,
  parseAgentMerge,
  parseReverts,
  reviewerCleared,
  type AgentMerge,
  type Check,
  type CheckState,
  type Decision,
  type MainState,
  type PrSnapshot,
  type ReviewHistory,
  TINY_LINES,
} from "./can-merge-gates";

const HEAD = "2ee7e1dc85217494c55a3dd20022b87184b8d675";
const OLDER = "85e30eb0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6";
const ON: AgentMerge = { on: true, since: "2026-10-25" };
const VERCEL = "https://vercel.com/jaspy-s-team/league-web-app/Bth8tZWfPTqkq34tGX4qgjxz2ry3";
const TEMPLATE = readFileSync(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");

function main(overrides: Partial<MainState> = {}): MainState {
  return { agentMerge: ON, changedGateCode: [], reverts: [], claudeMerges: [], ...overrides };
}

type BodyParts = { tier?: string | null; builder?: string | null; criteria?: string[]; review?: string[] };

function body({
  tier = "normal. One Insights card, with no new stored data.",
  builder = "Claude Code on Opus 5.5.",
  criteria = ['- [x] The card shows each habit\'s win rate: test "shows the win rate"'],
  review = [`Reviewer agent at ${HEAD}: no blockers`],
}: BodyParts = {}): string {
  return [
    tier === null ? "" : `**Tier:** ${tier}`,
    builder === null ? "" : `**Builder:** ${builder}`,
    "Closes #170",
    "",
    "## Summary",
    "Adds a card to Insights.",
    "",
    "## Acceptance criteria",
    ...criteria,
    "",
    "## Review",
    ...review,
    "",
    "## Docs and decisions touched",
    "none",
    "",
  ].join("\n");
}

function pr(overrides: Partial<PrSnapshot> = {}): PrSnapshot {
  return {
    number: 170,
    state: "OPEN",
    isDraft: false,
    isCrossRepository: false,
    baseRefName: "main",
    headRefName: "claude/habit-card-170",
    headRefOid: HEAD,
    author: { login: "Jaspyplayz", isBot: false },
    body: body(),
    files: ["src/components/habit-card.tsx", "docs/habits.md"],
    checks: [
      { kind: "run", name: "check", workflow: "CI", state: "success" },
      { kind: "run", name: "smoke", workflow: "Smoke test", state: "success" },
      { kind: "status", name: "Vercel", url: VERCEL, state: "success" },
      { kind: "run", name: "CodeQL", workflow: "", state: "success" },
      { kind: "run", name: "Vercel Preview Comments", workflow: "", state: "skipped" },
    ],
    ...overrides,
  };
}

// Every changed file has 5 lines unless a test says otherwise, and no verdict
// commit is on the branch except the head.
function history(overrides: Partial<ReviewHistory> = {}, files = pr().files): ReviewHistory {
  return { lines: Object.fromEntries(files.map((path) => [path, 5])), since: () => undefined, ...overrides };
}

function decide(snapshot: PrSnapshot, state: MainState, git: ReviewHistory = history({}, snapshot.files)): Decision {
  return decideGates(snapshot, state, git);
}

function failed(decision: Decision): string[] {
  return decision.gates.filter((gate) => !gate.pass).map((gate) => gate.name);
}

function detail(decision: Decision, name: string): string {
  return decision.gates.find((gate) => gate.name === name)?.detail ?? "";
}

describe("decide", () => {
  it("allows a normal PR when every gate passes", () => {
    const decision = decide(pr(), main());
    expect(decision.ok).toBe(true);
    expect(failed(decision)).toEqual([]);
    expect(detail(decision, "Reviewer cleared the head commit")).toBe(`Reviewer agent at ${HEAD}: no blockers`);
  });

  it("allows a tiny PR that changes only docs, with no review and no criteria, written on GitHub's website", () => {
    const tiny = body({ tier: "tiny. Docs only.", criteria: [], review: [] }).replaceAll("\n", "\r\n");
    const files = ["docs/habits.md", "docs/screenshots/x.png", "README.md", "ARCHITECTURE.md"];
    expect(decide(pr({ body: tiny, files }), main()).ok).toBe(true);
  });

  it("refuses a normal PR that changes only docs without the reviewer", () => {
    const decision = decide(pr({ body: body({ review: [] }), files: ["docs/habits.md"] }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
  });

  // Agents follow these as rules, so a tiny PR can't loosen them unreviewed (JAS-12).
  it.each([
    "CLAUDE.md",
    "CLAUDE.local.md",
    "src/lib/analyzer/Claude.md",
    "docs/CLAUDE.md",
    "docs/CLAUDE.local.md",
    "AGENTS.md",
    "docs/AGENTS.md",
    "docs/workflow.md",
    ".cursor/skills/verify-turnpoint/SKILL.md",
    "docs/Workflow.md",
    "Docs/workflow.md",
  ])("refuses a tiny PR that changes %s without the reviewer, however small", (file) => {
    const tiny = body({ tier: "tiny. Docs only.", criteria: [], review: [] });
    const decision = decide(pr({ body: tiny, files: ["docs/habits.md", file] }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
    expect(detail(decision, "Reviewer cleared the head commit")).toContain(file);
  });

  // These aren't docs, so their lines count toward the tiny limit (0017).
  it.each([
    "src/lib/analyzer/fixtures/README.md",
    "src/components/docs/notes.md",
    "docs/notes.test.ts",
    "docs/run.ts",
    "docs/diagram.svg",
    "docs/photo.jpeg",
  ])("counts %s as lines outside docs for a tiny PR", (file) => {
    const tiny = body({ tier: "tiny. Docs only.", criteria: [], review: [] });
    const files = ["docs/habits.md", file];
    const small = history({ lines: { "docs/habits.md": 500, [file]: TINY_LINES } }, files);
    const big = history({ lines: { "docs/habits.md": 1, [file]: TINY_LINES + 1 } }, files);
    expect(decide(pr({ body: tiny, files }), main(), small).ok).toBe(true);
    expect(failed(decide(pr({ body: tiny, files }), main(), big))).toEqual(["Reviewer cleared the head commit"]);
  });

  it.each(["docs/.claude/skills/x/SKILL.md", "docs/adr/.cursor/rules/x.md"])(
    "refuses a tiny PR that changes %s as risky and unreviewed",
    (file) => {
      const tiny = body({ tier: "tiny. Docs only.", criteria: [], review: [] });
      expect(failed(decide(pr({ body: tiny, files: [file] }), main()))).toEqual([
        "No risky files",
        "Reviewer cleared the head commit",
      ]);
    },
  );

  // A small code change can be tiny and skip the reviewer (0017).
  it("allows a tiny PR that changes up to the limit of code lines without the reviewer", () => {
    const tiny = body({ tier: "tiny. Copy.", criteria: [], review: [] });
    const files = ["docs/habits.md", "src/lib/analyzer/death-recap.ts", "src/lib/analyzer/death-recap.test.ts"];
    const lines = { "docs/habits.md": 200, "src/lib/analyzer/death-recap.ts": 20, "src/lib/analyzer/death-recap.test.ts": 10 };
    const decision = decide(pr({ body: tiny, files }), main(), history({ lines }, files));
    expect(decision.ok).toBe(true);
    expect(detail(decision, "Reviewer cleared the head commit")).toBe(
      `a tiny PR that changes 30 lines outside docs (up to ${TINY_LINES}) skips the reviewer`,
    );
  });

  // A PR names its own tier, so a bigger "tiny" one still gets the reviewer (JAS-12).
  it("refuses a tiny PR past the limit without the reviewer, and names the files", () => {
    const tiny = body({ tier: "tiny. Copy.", criteria: [], review: [] });
    const files = ["docs/habits.md", "src/lib/analyzer/death-recap.ts"];
    const lines = { "docs/habits.md": 1, "src/lib/analyzer/death-recap.ts": TINY_LINES + 1 };
    const decision = decide(pr({ body: tiny, files }), main(), history({ lines }, files));
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
    expect(detail(decision, "Reviewer cleared the head commit")).toContain("31 in src/lib/analyzer/death-recap.ts");
  });

  it("refuses a small tiny PR that touches a risky file without the reviewer, in GitHub's check too", () => {
    const tiny = body({ tier: "tiny. One query.", criteria: [], review: [] });
    const snapshot = pr({ body: tiny, files: ["src/db/schema.ts"] });
    const gate = reviewerCleared(snapshot, history({}, snapshot.files));
    expect(gate.pass).toBe(false);
    expect(gate.detail).toContain("src/db/schema.ts");
  });

  it("allows a tiny PR that changes code once the reviewer cleared it", () => {
    const tiny = body({ tier: "tiny. Copy.", criteria: [] });
    expect(decide(pr({ body: tiny }), main()).ok).toBe(true);
  });

  it("refuses when the gate code here differs from main's", () => {
    const decision = decide(pr(), main({ changedGateCode: ["scripts/can-merge-gates.ts"] }));
    expect(failed(decision)).toEqual(["Gate code matches main"]);
    expect(detail(decision, "Gate code matches main")).toBe(
      "changed from origin/main: scripts/can-merge-gates.ts. Run can-merge from an up-to-date main checkout",
    );
  });

  it("refuses while agent merging is switched off", () => {
    const off: AgentMerge = { on: false, why: "no .claude/agent-merge.json on origin/main" };
    const decision = decide(pr(), main({ agentMerge: off }));
    expect(failed(decision)).toEqual(["Agent merging is on"]);
    expect(detail(decision, "Agent merging is on")).toBe("no .claude/agent-merge.json on origin/main");
  });

  const claudeMerge = {
    subject: "Merge pull request #165 from Jaspyplayz/claude/card",
    commits: ["d".repeat(40), "e".repeat(40)],
  };
  const revertSha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";

  it("refuses after a Claude merge was reverted, and names it", () => {
    const reverts = [{ sha: revertSha, reverts: ["d".repeat(40)] }];
    const decision = decide(pr(), main({ reverts, claudeMerges: [claudeMerge] }));
    expect(failed(decision)).toEqual(["No Claude merge was reverted"]);
    expect(detail(decision, "No Claude merge was reverted")).toContain(
      '"Merge pull request #165 from Jaspyplayz/claude/card" (reverted in a1b2c3d)',
    );
  });

  it("refuses after a revert of one commit that a Claude merge brought in", () => {
    const reverts = [{ sha: revertSha, reverts: ["e".repeat(40)] }];
    expect(failed(decide(pr(), main({ reverts, claudeMerges: [claudeMerge] })))).toEqual([
      "No Claude merge was reverted",
    ]);
  });

  it("doesn't stop for a revert of a merge Jasper made", () => {
    const reverts = [{ sha: revertSha, reverts: [OLDER] }];
    expect(decide(pr(), main({ reverts, claudeMerges: [claudeMerge] })).ok).toBe(true);
  });

  it.each<[string, Partial<PrSnapshot>]>([
    ["merged", { state: "MERGED" }],
    ["closed", { state: "CLOSED" }],
    ["a draft", { isDraft: true }],
    ["into another branch", { baseRefName: "claude/other-branch" }],
  ])("refuses a PR that is %s", (_, overrides) => {
    expect(failed(decide(pr(overrides), main()))).toEqual(["Open and ready"]);
  });

  it.each<[string, Partial<PrSnapshot>]>([
    ["it is on a Cursor branch", { headRefName: "cursor/fix-card" }],
    ["Dependabot opened it", { headRefName: "claude/x", author: { login: "app/dependabot", isBot: true } }],
    ["it comes from a fork", { isCrossRepository: true }],
    ["it has no Builder line", { body: body({ builder: null }) }],
    ["the Cursor chat built it", { body: body({ builder: "Cursor chat on Grok 4.7." }) }],
    ["its Builder line names other builders too", { body: body({ builder: "Claude Code on Opus 5.5, Cursor chat on Grok 4.7, or cloud agent." }) }],
  ])("refuses a PR that Claude Code didn't build: %s", (_, overrides) => {
    expect(failed(decide(pr(overrides), main()))).toEqual(["Built by Claude Code"]);
  });

  // Claude Code is the only builder (decision record 0012), so the PR
  // template's Builder line is already true as written.
  it("accepts the PR template's Builder line as written", () => {
    const builder = TEMPLATE.match(/^\*\*Builder:\*\*\s*(.+)$/m)?.[1].trim() ?? "";
    expect(builder).toBe("Claude Code on Opus 5.5, in a local or cloud session.");
    expect(failed(decide(pr({ body: body({ builder }) }), main()))).toEqual([]);
  });

  // A PR written from the template, with only its placeholders filled in,
  // must pass every gate, so a template edit can't quietly break can-merge.
  it("passes a PR written from the PR template", () => {
    const filled = TEMPLATE.replace(/^\*\*Tier:\*\*.*$/m, "**Tier:** normal. One Insights card.")
      .replace(/^- \[ \] .*$/m, '- [x] The card shows the win rate: test "shows the win rate"')
      .replace(/^## Review\s*$/m, `## Review\nReviewer agent at ${HEAD}: no blockers`);
    expect(failed(decide(pr({ body: filled }), main()))).toEqual([]);
  });

  // The gates read sections line by line, and a heading inside an HTML comment
  // or a code block can fool them (decision record 0009), so the template
  // itself has neither.
  it("keeps HTML comments and code blocks out of the PR template", () => {
    expect(TEMPLATE).not.toMatch(/<!--|^\s*(```|~~~)/m);
  });

  // The order is the layout Jasper chose on 2026-10-29, not something a gate
  // reads; change this list with the template.
  it("keeps the PR template's sections in the chosen order, with the Merge Danger labels", () => {
    const headings = [...TEMPLATE.matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1]);
    expect(headings).toEqual([
      "Summary",
      "Evidence",
      "Acceptance criteria",
      "Tested",
      "Not tested",
      "Merge Danger",
      "Review",
      "Docs and decisions touched",
    ]);
    expect(TEMPLATE).toMatch(/^\*\*Door:\*\*/m);
    expect(TEMPLATE).toMatch(/^\*\*Blast radius:\*\*/m);
  });

  // Wellness check 5 reads each blocker's check line and the answer under it,
  // so the template asks for the shapes reviewer.md writes. It mentions them
  // mid-sentence only: a template line starting with one would count as a
  // blocker in every PR that keeps the template's words.
  it("asks for the reviewer's check line and the Fixed or Rejected answer", () => {
    for (const shape of [
      "`Check could catch this: yes, <which check>`",
      "`Check could catch this: no, judgement call`",
      "`Fixed:`",
      "`Rejected:`",
    ]) {
      expect(TEMPLATE).toContain(shape);
    }
    expect(TEMPLATE).not.toMatch(/^[\s*_`-]*Check could catch this/m);
  });

  it.each<[string, string | null]>([
    ["risky", "risky. It changes the Riot client."],
    ["missing", null],
    ["the template's placeholder", "tiny, normal or risky, and why."],
  ])("refuses a PR whose tier is %s", (_, tier) => {
    expect(failed(decide(pr({ body: body({ tier }) }), main()))).toEqual(["Tiny or normal tier"]);
  });

  it("refuses a risky file even when the tier says tiny, and names it", () => {
    const tiny = body({ tier: "tiny. One query.", criteria: [] });
    const decision = decide(pr({ body: tiny, files: ["docs/database.md", "src/db/schema.ts"] }), main());
    expect(failed(decision)).toEqual(["No risky files"]);
    expect(detail(decision, "No risky files")).toBe("src/db/schema.ts (the database schema and queries)");
  });

  it("refuses a PR that only changes the agent-merge switch", () => {
    const decision = decide(pr({ files: [".claude/agent-merge.json"] }), main());
    expect(failed(decision)).toEqual(["No risky files"]);
    expect(detail(decision, "No risky files")).toBe(".claude/agent-merge.json (the switch for agent merging)");
  });

  const passing = pr().checks;
  const without = (name: string) => passing.filter((check) => check.name !== name);
  const ci = (state: CheckState): Check => ({ kind: "run", name: "check", workflow: "CI", state });
  const smoke = (state: CheckState): Check => ({ kind: "run", name: "smoke", workflow: "Smoke test", state });

  it.each<[string, Check[], string]>([
    ["smoke is still running", [...without("smoke"), smoke("pending")], "smoke still running"],
    ["smoke was skipped", [...without("smoke"), smoke("skipped")], "smoke skipped"],
    ["Vercel hasn't reported", without("Vercel"), "Vercel hasn't reported from Vercel"],
    ["check failed", [...without("check"), ci("failure")], "check failed"],
    ["another check failed", [...passing, { kind: "run", name: "CodeQL", workflow: "", state: "failure" }], "CodeQL failed"],
    [
      "another check is running",
      [...passing, { kind: "run", name: "dependency-review", workflow: "Dependency review", state: "pending" }],
      "dependency-review still running",
    ],
    [
      "a commit status named check stands in for the CI job",
      [...without("check"), { kind: "status", name: "check", url: "https://example.com/ci", state: "success" }],
      "check hasn't reported from the CI workflow",
    ],
    [
      "smoke comes from another workflow",
      [...without("smoke"), { kind: "run", name: "smoke", workflow: "Quick smoke", state: "success" }],
      "smoke hasn't reported from the Smoke test workflow",
    ],
    [
      "a check run named Vercel stands in for Vercel's status",
      [...without("Vercel"), { kind: "run", name: "Vercel", workflow: "Deploy", state: "success" }],
      "Vercel hasn't reported from Vercel",
    ],
    [
      "the Vercel status links somewhere else",
      [...without("Vercel"), { kind: "status", name: "Vercel", url: "https://vercel.example.com/x", state: "success" }],
      "Vercel hasn't reported from Vercel",
    ],
  ])("refuses when %s", (_, checks, expected) => {
    const decision = decide(pr({ checks }), main());
    expect(failed(decision)).toEqual(["Checks pass at the head commit"]);
    expect(detail(decision, "Checks pass at the head commit")).toBe(expected);
  });

  // The gate counts check and smoke only from these workflows, so renaming one
  // without updating scripts/can-merge-gates.ts would stop every merge.
  it("matches the workflow and job names in .github/workflows/", () => {
    const workflow = (file: string) => readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    expect(workflow("ci.yml")).toMatch(/^name: CI\r?\n[\s\S]*^ {2}check:/m);
    expect(workflow("smoke.yml")).toMatch(/^name: Smoke test\r?\n[\s\S]*^ {2}smoke:/m);
  });

  it("refuses a reviewer verdict on a commit that isn't on the branch", () => {
    const decision = decide(pr({ body: body({ review: [`Reviewer agent at ${OLDER.slice(0, 7)}: no blockers`] }) }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
    expect(detail(decision, "Reviewer cleared the head commit")).toContain("85e30eb, which isn't the head commit 2ee7e1d or one before it");
  });

  it("refuses when the reviewer found blockers at the head commit", () => {
    const review = [`Reviewer agent at ${OLDER}: 2 blockers`, `Reviewer agent at ${HEAD.slice(0, 12)}: 1 blockers`];
    expect(failed(decide(pr({ body: body({ review }) }), main()))).toEqual(["Reviewer cleared the head commit"]);
  });

  it("refuses a normal PR with no reviewer line in the new format", () => {
    const decision = decide(pr({ body: body({ review: ["Reviewer agent: no blockers."] }) }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
  });

  // A re-review names the commit it started from (JAS-17). The gate reads the
  // head commit's verdict the same way, whatever follows it. The detail shows
  // it judged the re-review's line, not only the older one.
  it.each<[string, string[]]>([
    ["no blockers", []],
    ["1 blockers", ["Reviewer cleared the head commit"]],
  ])("reads a re-review's %s like a full review's", (verdict, failing) => {
    const since = OLDER.slice(0, 7);
    const review = [`Reviewer agent at ${OLDER}: 2 blockers`, `Reviewer agent at ${HEAD}: ${verdict} (re-review since ${since})`];
    const decision = decide(pr({ body: body({ review }) }), main());
    expect(failed(decision)).toEqual(failing);
    expect(detail(decision, "Reviewer cleared the head commit")).toContain(`${verdict} (re-review since ${since})`);
  });

  // PR 209's re-review lines put the suffix before the colon, so the gate
  // skipped them and its message named only the older commits. It names the
  // line it couldn't read and the shape it reads (docs/agent-mistakes.md).
  it.each<[string, string[]]>([
    ["with an older verdict", [`Reviewer agent at ${OLDER}: no blockers`]],
    ["on its own", []],
  ])("names a verdict line it can't read, %s", (_, others) => {
    const misplaced = `Reviewer agent at ${HEAD} (re-review since ${OLDER.slice(0, 7)}): no blockers`;
    const decision = decide(pr({ body: body({ review: [misplaced, ...others] }) }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
    expect(detail(decision, "Reviewer cleared the head commit")).toContain(
      `couldn't read "${misplaced}": a verdict reads "Reviewer agent at <sha>: no blockers", and a re-review's "(re-review since <since>)" goes after the verdict`,
    );
  });

  it("quotes a repeated unread line once, and not a line that only mentions a commit", () => {
    const misplaced = `Reviewer agent at ${HEAD} (re-review since ${OLDER.slice(0, 7)}): no blockers`;
    const mention = `- Fixed: the Reviewer agent at ${OLDER.slice(0, 7)} asked for a test`;
    const decision = decide(pr({ body: body({ review: [misplaced, misplaced, mention] }) }), main());
    const text = detail(decision, "Reviewer cleared the head commit");
    expect(text.split(misplaced)).toHaveLength(2);
    expect(text).not.toContain("asked for a test");
  });

  // GitHub's required reviewer check runs reviewerCleared (JAS-15).
  it.each<[string, Partial<PrSnapshot>]>([
    ["a verdict at the head commit", {}],
    ["no verdict", { body: body({ review: [] }) }],
    ["a verdict on an older commit", { body: body({ review: [`Reviewer agent at ${OLDER}: no blockers`] }) }],
    ["blockers at the head commit", { body: body({ review: [`Reviewer agent at ${HEAD}: 1 blockers`] }) }],
    ["a risky PR", { body: body({ tier: "risky. Sign-in.", review: [] }) }],
    ["a docs-only tiny PR", { body: body({ tier: "tiny. Docs only.", criteria: [], review: [] }), files: ["docs/habits.md"] }],
    ["a tiny PR that changes code", { body: body({ tier: "tiny. A copy fix.", criteria: [], review: [] }), files: ["src/x.ts"] }],
  ])("gives GitHub's reviewer check the same answer for %s", (_, overrides) => {
    const snapshot = pr(overrides);
    const gate = decide(snapshot, main()).gates.find(({ name }) => name === "Reviewer cleared the head commit");
    expect(reviewerCleared(snapshot, history({}, snapshot.files))).toEqual(gate);
  });

  describe("a verdict on an earlier commit (0017)", () => {
    const MIDDLE = "4b1c9d0e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c";
    const files = ["src/components/habit-card.tsx", "src/components/habit-card.test.tsx", "docs/habits.md"];
    const gateOf = (review: string[], since: ReviewHistory["since"], changed = files) =>
      decide(pr({ body: body({ review }), files: changed }), main(), history({ since }, changed));
    const after = (lines: Record<string, number>, commits = 2) => (sha: string) =>
      sha === OLDER ? { commits, lines } : sha === MIDDLE ? { commits: 1, lines } : undefined;

    it("carries over a no-blockers verdict past small fixes, docs and tests", () => {
      const lines = { "src/components/habit-card.tsx": CARRY_OVER_LINES, "src/components/habit-card.test.tsx": 300, "docs/habits.md": 80 };
      const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], after(lines));
      expect(decision.ok).toBe(true);
      expect(detail(decision, "Reviewer cleared the head commit")).toBe(
        `Reviewer agent at ${OLDER}: no blockers, carried over 2 commits with ${CARRY_OVER_LINES} lines outside docs and tests`,
      );
    });

    it("refuses once more than the limit changed outside docs and tests", () => {
      const lines = { "src/components/habit-card.tsx": CARRY_OVER_LINES + 1 };
      const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], after(lines));
      expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
      expect(detail(decision, "Reviewer cleared the head commit")).toContain(`${CARRY_OVER_LINES + 1} lines outside docs and tests`);
    });

    it("refuses when a rule file changed after the verdict, however small", () => {
      const changed = [...files, "docs/workflow.md"];
      const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], after({ "docs/workflow.md": 1 }), changed);
      expect(detail(decision, "Reviewer cleared the head commit")).toContain("docs/workflow.md changed after the verdict");
    });

    it("refuses when the newest verdict found blockers", () => {
      const decision = gateOf(
        [`Reviewer agent at ${OLDER}: no blockers`, `Reviewer agent at ${MIDDLE}: 1 blockers`],
        after({ "src/components/habit-card.tsx": 1 }),
      );
      expect(detail(decision, "Reviewer cleared the head commit")).toContain("A fix for a blocker needs a new review");
    });

    it("uses the newest verdict when an earlier one found blockers", () => {
      const decision = gateOf(
        [`Reviewer agent at ${OLDER}: 2 blockers`, `Reviewer agent at ${MIDDLE}: no blockers (re-review since ${OLDER.slice(0, 7)})`],
        after({ "src/components/habit-card.tsx": 3 }),
      );
      expect(decision.ok).toBe(true);
    });

    it("doesn't count files the PR doesn't change, such as main merged in", () => {
      const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], after({ "src/lib/other.ts": 900, "CLAUDE.md": 4 }));
      expect(decision.ok).toBe(true);
    });

    it("refuses a verdict on a commit that isn't on the branch", () => {
      const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], () => undefined);
      expect(detail(decision, "Reviewer cleared the head commit")).toBe(
        `the reviewer saw ${OLDER.slice(0, 7)}, which isn't the head commit ${HEAD.slice(0, 7)} or one before it`,
      );
    });
  });

  it("refuses an unticked acceptance criterion", () => {
    const criteria = ["- [x] The card shows: test \"shows\"", "- [ ] It works on phones: screenshot"];
    const decision = decide(pr({ body: body({ criteria }) }), main());
    expect(failed(decision)).toEqual(["Acceptance criteria ticked"]);
    expect(detail(decision, "Acceptance criteria ticked")).toContain("It works on phones");
  });

  it.each(["1. [ ] B", "2) [ ] B", "+ [ ] B", "* [ ] B", "- [  ] B", "- [ x ] B", "-  [ ] B", "  - [ ] B", "> - [ ] B"])("counts %s as an unticked criterion", (line) => {
    const criteria = ['- [x] A: test "a"', line];
    expect(failed(decide(pr({ body: body({ criteria }) }), main()))).toEqual(["Acceptance criteria ticked"]);
  });

  it("reads ticked boxes in numbered and + lists, and skips a plain link", () => {
    const criteria = ['1. [x] A: test "a"', "+ [X] B: screenshot", "- [Screenshot of B](https://example.com/b.png)"];
    expect(decide(pr({ body: body({ criteria }) }), main()).ok).toBe(true);
  });

  it.each(["```", "~~~"])("reads criteria past a %s code block that holds a ## line", (fence) => {
    const criteria = ['- [x] A: test "a"', fence, "## not a heading", fence, "- [ ] B"];
    expect(failed(decide(pr({ body: body({ criteria }) }), main()))).toEqual(["Acceptance criteria ticked"]);
  });

  it("refuses a normal PR with no acceptance criteria", () => {
    expect(failed(decide(pr({ body: body({ criteria: [] }) }), main()))).toEqual(["Acceptance criteria ticked"]);
  });

  it("lists every failing gate, not just the first", () => {
    const decision = decide(
      pr({ state: "MERGED", headRefName: "cursor/x", files: ["drizzle/0013.sql"], body: body({ review: [] }) }),
      main({ agentMerge: { on: false, why: "enabledSince is null in .claude/agent-merge.json" } }),
    );
    expect(failed(decision)).toEqual([
      "Agent merging is on",
      "Open and ready",
      "Built by Claude Code",
      "No risky files",
      "Reviewer cleared the head commit",
    ]);
  });
});

describe("parseAgentMerge", () => {
  const today = "2026-10-26";

  it("is on from enabledSince", () => {
    expect(parseAgentMerge('{ "enabledSince": "2026-10-25" }', today)).toEqual({ on: true, since: "2026-10-25" });
    expect(parseAgentMerge('{ "enabledSince": "2026-10-26" }', today)).toEqual({ on: true, since: "2026-10-26" });
  });

  it.each([
    ["null", '{ "enabledSince": null }'],
    ["a date that isn't one", '{ "enabledSince": "2026-13-01" }'],
    ["no enabledSince", "{}"],
    ["broken JSON", '{ "enabledSince": '],
    ["a date after today", '{ "enabledSince": "2026-10-27" }'],
  ])("is off for %s", (_, text) => {
    expect(parseAgentMerge(text, today).on).toBe(false);
  });
});

describe("parseReverts", () => {
  const reverted = "3bca9000a1c12e74a016e753f84fe3f9c511380d";
  const record = (sha: string, date: string, message: string) => `${sha}\x1f${date}\x1f${message}\x1e\n`;

  it("keeps reverts made on or after enabledSince in UTC, with the commit each one undid", () => {
    const log =
      record("a".repeat(40), "2026-10-25T20:15:00-04:00", `Revert "Add a card"\n\nThis reverts commit ${reverted}.`) +
      record("b".repeat(40), "2026-10-24T12:00:00-04:00", `Revert "Older"\n\nThis reverts commit ${"c".repeat(40)}.`);
    expect(parseReverts(log, "2026-10-26")).toEqual([{ sha: "a".repeat(40), reverts: [reverted] }]);
  });

  it("reads a reverted merge commit", () => {
    const message = `Revert "Merge pull request #169"\n\nThis reverts commit ${reverted}, reversing\nchanges made to 2ee7e1dc85217494c55a3dd20022b87184b8d675.`;
    expect(parseReverts(record("a".repeat(40), "2026-10-26T01:00:00Z", message), "2026-10-25")).toEqual([
      { sha: "a".repeat(40), reverts: [reverted] },
    ]);
  });
});
