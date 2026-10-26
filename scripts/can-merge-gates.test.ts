import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decide,
  parseAgentMerge,
  parseReverts,
  toCheck,
  type AgentMerge,
  type Check,
  type CheckState,
  type Decision,
  type MainState,
  type PrSnapshot,
  type RollupEntry,
} from "./can-merge-gates";

const HEAD = "2ee7e1dc85217494c55a3dd20022b87184b8d675";
const OLDER = "85e30eb0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6";
const ON: AgentMerge = { on: true, since: "2026-10-25" };
const VERCEL = "https://vercel.com/jaspy-s-team/league-web-app/Bth8tZWfPTqkq34tGX4qgjxz2ry3";

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
    "## Walkthrough",
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
    "## My read (Jasper)",
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
    "src/lib/analyzer/fixtures/README.md",
    "src/components/docs/notes.md",
    "docs/notes.test.ts",
    "docs/run.ts",
    "docs/diagram.svg",
    "docs/photo.jpeg",
    "docs/Workflow.md",
    "Docs/workflow.md",
  ])("refuses a tiny PR that changes %s without the reviewer", (file) => {
    const tiny = body({ tier: "tiny. Docs only.", criteria: [], review: [] });
    expect(failed(decide(pr({ body: tiny, files: ["docs/habits.md", file] }), main()))).toEqual([
      "Reviewer cleared the head commit",
    ]);
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

  // A PR names its own tier, so a tiny one that changes code still gets the reviewer (JAS-12).
  it("refuses a tiny PR that changes code without the reviewer, and names the file", () => {
    const tiny = body({ tier: "tiny. Copy.", criteria: [], review: [] });
    const decision = decide(pr({ body: tiny, files: ["docs/habits.md", "src/lib/analyzer/death-recap.ts"] }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
    expect(detail(decision, "Reviewer cleared the head commit")).toContain("src/lib/analyzer/death-recap.ts");
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
    ["its Builder line is the template's placeholder", { body: body({ builder: "Claude Code on Opus 5.5, Cursor chat on Grok 4.7, or cloud agent." }) }],
  ])("refuses a PR that Claude Code didn't build: %s", (_, overrides) => {
    expect(failed(decide(pr(overrides), main()))).toEqual(["Built by Claude Code"]);
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

  it("refuses a reviewer verdict on an older commit", () => {
    const decision = decide(pr({ body: body({ review: [`Reviewer agent at ${OLDER.slice(0, 7)}: no blockers`] }) }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
    expect(detail(decision, "Reviewer cleared the head commit")).toContain("85e30eb, not the head commit 2ee7e1d");
  });

  it("refuses when the reviewer found blockers at the head commit", () => {
    const review = [`Reviewer agent at ${OLDER}: 2 blockers`, `Reviewer agent at ${HEAD.slice(0, 12)}: 1 blockers`];
    expect(failed(decide(pr({ body: body({ review }) }), main()))).toEqual(["Reviewer cleared the head commit"]);
  });

  it("refuses a normal PR with no reviewer line in the new format", () => {
    const decision = decide(pr({ body: body({ review: ["Reviewer agent: no blockers."] }) }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
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

describe("toCheck", () => {
  const run = (status: string, conclusion: string | null): RollupEntry => ({
    __typename: "CheckRun",
    name: "smoke",
    workflowName: "Smoke test",
    status,
    conclusion,
  });
  const status = (state: string): RollupEntry => ({
    __typename: "StatusContext",
    context: "Vercel",
    targetUrl: VERCEL,
    state,
  });

  it.each<[string, RollupEntry, CheckState]>([
    ["a running check", run("IN_PROGRESS", ""), "pending"],
    ["a queued check", run("QUEUED", null), "pending"],
    ["a passed check", run("COMPLETED", "SUCCESS"), "success"],
    ["a skipped check", run("COMPLETED", "SKIPPED"), "skipped"],
    ["a cancelled check", run("COMPLETED", "CANCELLED"), "failure"],
    ["a timed-out check", run("COMPLETED", "TIMED_OUT"), "failure"],
    ["a pending status", status("PENDING"), "pending"],
    ["a passed status", status("SUCCESS"), "success"],
    ["an errored status", status("ERROR"), "failure"],
  ])("reads %s as %s", (_, entry, state) => {
    expect(toCheck(entry).state).toBe(state);
  });

  it("keeps where each check came from", () => {
    expect(toCheck(run("COMPLETED", "SUCCESS"))).toEqual({
      kind: "run",
      name: "smoke",
      workflow: "Smoke test",
      state: "success",
    });
    expect(toCheck(status("SUCCESS"))).toEqual({ kind: "status", name: "Vercel", url: VERCEL, state: "success" });
  });
});
