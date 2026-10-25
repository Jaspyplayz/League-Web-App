import { describe, expect, it } from "vitest";
import {
  decide,
  parseAgentMerge,
  parseReverts,
  toCheck,
  type AgentMerge,
  type CheckState,
  type Decision,
  type PrSnapshot,
  type RevertedPr,
  type RollupEntry,
} from "./can-merge-gates";

const HEAD = "2ee7e1dc85217494c55a3dd20022b87184b8d675";
const OLDER = "85e30eb0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6";
const ON: AgentMerge = { on: true, since: "2026-10-25" };

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
      { name: "check", state: "success" },
      { name: "Vercel", state: "success" },
      { name: "smoke", state: "success" },
      { name: "CodeQL", state: "success" },
      { name: "Vercel Preview Comments", state: "skipped" },
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
    const decision = decide(pr(), ON, []);
    expect(decision.ok).toBe(true);
    expect(failed(decision)).toEqual([]);
    expect(detail(decision, "Reviewer cleared the head commit")).toBe(`Reviewer agent at ${HEAD}: no blockers`);
  });

  it("allows a tiny PR with no review and no criteria, written on GitHub's website", () => {
    const tiny = body({ tier: "tiny. Docs only.", criteria: [], review: [] }).replaceAll("\n", "\r\n");
    const decision = decide(pr({ body: tiny }), ON, []);
    expect(decision.ok).toBe(true);
  });

  it("refuses while agent merging is switched off", () => {
    const off: AgentMerge = { on: false, why: "no .claude/agent-merge.json on origin/main" };
    const decision = decide(pr(), off, []);
    expect(failed(decision)).toEqual(["Agent merging is on"]);
    expect(detail(decision, "Agent merging is on")).toBe("no .claude/agent-merge.json on origin/main");
  });

  it("refuses after a merged-by-claude PR was reverted, and names it", () => {
    const reverts: RevertedPr[] = [
      { number: 165, labels: ["merged-by-claude"], revertCommit: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" },
    ];
    const decision = decide(pr(), ON, reverts);
    expect(failed(decision)).toEqual(["No Claude merge was reverted"]);
    expect(detail(decision, "No Claude merge was reverted")).toContain("#165 (reverted in a1b2c3d)");
  });

  it("doesn't stop for a revert of a PR Jasper merged", () => {
    const reverts: RevertedPr[] = [{ number: 160, labels: [], revertCommit: OLDER }];
    expect(decide(pr(), ON, reverts).ok).toBe(true);
  });

  it.each<[string, Partial<PrSnapshot>]>([
    ["merged", { state: "MERGED" }],
    ["closed", { state: "CLOSED" }],
    ["a draft", { isDraft: true }],
    ["into another branch", { baseRefName: "claude/other-branch" }],
  ])("refuses a PR that is %s", (_, overrides) => {
    expect(failed(decide(pr(overrides), ON, []))).toEqual(["Open and ready"]);
  });

  it.each<[string, Partial<PrSnapshot>]>([
    ["it is on a Cursor branch", { headRefName: "cursor/fix-card" }],
    ["Dependabot opened it", { headRefName: "claude/x", author: { login: "app/dependabot", isBot: true } }],
    ["it comes from a fork", { isCrossRepository: true }],
    ["it has no Builder line", { body: body({ builder: null }) }],
    ["the Cursor chat built it", { body: body({ builder: "Cursor chat on Grok 4.7." }) }],
    ["its Builder line is the template's placeholder", { body: body({ builder: "Claude Code on Opus 5.5, Cursor chat on Grok 4.7, or cloud agent." }) }],
  ])("refuses a PR that Claude Code didn't build: %s", (_, overrides) => {
    expect(failed(decide(pr(overrides), ON, []))).toEqual(["Built by Claude Code"]);
  });

  it.each<[string, string | null]>([
    ["risky", "risky. It changes the Riot client."],
    ["missing", null],
    ["the template's placeholder", "tiny, normal or risky, and why."],
  ])("refuses a PR whose tier is %s", (_, tier) => {
    expect(failed(decide(pr({ body: body({ tier }) }), ON, []))).toEqual(["Tiny or normal tier"]);
  });

  it("refuses a risky file even when the tier says tiny, and names it", () => {
    const tiny = body({ tier: "tiny. One query.", criteria: [], review: [] });
    const decision = decide(pr({ body: tiny, files: ["docs/database.md", "src/db/schema.ts"] }), ON, []);
    expect(failed(decision)).toEqual(["No risky files"]);
    expect(detail(decision, "No risky files")).toBe("src/db/schema.ts (the database schema and queries)");
  });

  const passing = pr().checks;
  const without = (name: string) => passing.filter((check) => check.name !== name);

  it.each<[string, PrSnapshot["checks"], string]>([
    ["smoke is still running", [...without("smoke"), { name: "smoke", state: "pending" }], "smoke still running"],
    ["smoke was skipped", [...without("smoke"), { name: "smoke", state: "skipped" }], "smoke skipped"],
    ["Vercel hasn't reported", without("Vercel"), "Vercel hasn't reported"],
    ["check failed", [...without("check"), { name: "check", state: "failure" }], "check failed"],
    ["another check failed", [...passing, { name: "CodeQL", state: "failure" }], "CodeQL failed"],
    ["another check is running", [...passing, { name: "dependency-review", state: "pending" }], "dependency-review still running"],
  ])("refuses when %s", (_, checks, expected) => {
    const decision = decide(pr({ checks }), ON, []);
    expect(failed(decision)).toEqual(["Checks pass at the head commit"]);
    expect(detail(decision, "Checks pass at the head commit")).toBe(expected);
  });

  it("refuses a reviewer verdict on an older commit", () => {
    const decision = decide(pr({ body: body({ review: [`Reviewer agent at ${OLDER.slice(0, 7)}: no blockers`] }) }), ON, []);
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
    expect(detail(decision, "Reviewer cleared the head commit")).toContain("85e30eb, not the head commit 2ee7e1d");
  });

  it("refuses when the reviewer found blockers at the head commit", () => {
    const review = [`Reviewer agent at ${OLDER}: 2 blockers`, `Reviewer agent at ${HEAD.slice(0, 12)}: 1 blockers`];
    expect(failed(decide(pr({ body: body({ review }) }), ON, []))).toEqual(["Reviewer cleared the head commit"]);
  });

  it("refuses a normal PR with no reviewer line in the new format", () => {
    const decision = decide(pr({ body: body({ review: ["Reviewer agent: no blockers."] }) }), ON, []);
    expect(failed(decision)).toEqual(["Reviewer cleared the head commit"]);
  });

  it("refuses an unticked acceptance criterion", () => {
    const criteria = ["- [x] The card shows: test \"shows\"", "- [ ] It works on phones: screenshot"];
    const decision = decide(pr({ body: body({ criteria }) }), ON, []);
    expect(failed(decision)).toEqual(["Acceptance criteria ticked"]);
    expect(detail(decision, "Acceptance criteria ticked")).toContain("It works on phones");
  });

  it("refuses a normal PR with no acceptance criteria", () => {
    expect(failed(decide(pr({ body: body({ criteria: [] }) }), ON, []))).toEqual(["Acceptance criteria ticked"]);
  });

  it("lists every failing gate, not just the first", () => {
    const decision = decide(
      pr({ state: "MERGED", headRefName: "cursor/x", files: ["drizzle/0013.sql"], body: body({ review: [] }) }),
      { on: false, why: "enabledSince is null in .claude/agent-merge.json" },
      [],
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
  it.each<[string, RollupEntry, CheckState]>([
    ["a running check", { __typename: "CheckRun", name: "smoke", status: "IN_PROGRESS", conclusion: "" }, "pending"],
    ["a queued check", { __typename: "CheckRun", name: "smoke", status: "QUEUED", conclusion: null }, "pending"],
    ["a passed check", { __typename: "CheckRun", name: "check", status: "COMPLETED", conclusion: "SUCCESS" }, "success"],
    ["a skipped check", { __typename: "CheckRun", name: "check", status: "COMPLETED", conclusion: "SKIPPED" }, "skipped"],
    ["a cancelled check", { __typename: "CheckRun", name: "check", status: "COMPLETED", conclusion: "CANCELLED" }, "failure"],
    ["a timed-out check", { __typename: "CheckRun", name: "check", status: "COMPLETED", conclusion: "TIMED_OUT" }, "failure"],
    ["a pending status", { __typename: "StatusContext", context: "Vercel", state: "PENDING" }, "pending"],
    ["a passed status", { __typename: "StatusContext", context: "Vercel", state: "SUCCESS" }, "success"],
    ["an errored status", { __typename: "StatusContext", context: "Vercel", state: "ERROR" }, "failure"],
  ])("reads %s as %s", (_, entry, state) => {
    expect(toCheck(entry).state).toBe(state);
  });
});
