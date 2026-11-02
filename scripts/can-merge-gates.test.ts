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
  type ChangedLines,
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

type BodyParts = { tier?: string | null; builder?: string | null; criteria?: string[]; door?: string | null; review?: string[] };

function body({
  tier = "normal. One Insights card, with no new stored data.",
  builder = "Claude Code on Opus 5.5.",
  criteria = ['- [x] The card shows each habit\'s win rate: test "shows the win rate"'],
  door = "two-way. A revert takes the card away.",
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
    "## Merge Danger",
    door === null ? "" : `**Door:** ${door}`,
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

// Added lines per file, in the shape git's numstat gives.
function changes(counts: Record<string, number>): ChangedLines {
  return Object.fromEntries(Object.entries(counts).map(([path, added]) => [path, { added, deleted: 0 }]));
}

// Every changed file has 5 lines unless a test says otherwise, and no verdict
// commit is on the branch except the head.
function history(
  { lines, since }: { lines?: Record<string, number>; since?: ReviewHistory["since"] } = {},
  files = pr().files,
): ReviewHistory {
  return { lines: changes(lines ?? Object.fromEntries(files.map((path) => [path, 5]))), since: since ?? (() => undefined) };
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
    expect(detail(decision, "Reviewer cleared the PR")).toBe(`Reviewer agent at ${HEAD}: no blockers`);
  });

  it("allows a tiny PR that changes only docs, with no review and no criteria, written on GitHub's website", () => {
    const tiny = body({ tier: "tiny. Docs only.", criteria: [], review: [] }).replaceAll("\n", "\r\n");
    const files = ["docs/habits.md", "docs/screenshots/x.png", "README.md", "ARCHITECTURE.md"];
    expect(decide(pr({ body: tiny, files }), main()).ok).toBe(true);
  });

  it("refuses a normal PR that changes only docs without the reviewer", () => {
    const decision = decide(pr({ body: body({ review: [] }), files: ["docs/habits.md"] }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the PR"]);
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
    expect(failed(decision)).toEqual(["Reviewer cleared the PR"]);
    expect(detail(decision, "Reviewer cleared the PR")).toContain(file);
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
    expect(failed(decide(pr({ body: tiny, files }), main(), big))).toEqual(["Reviewer cleared the PR"]);
  });

  // On the panel list since JAS-191, so they need the reviewer and the panel.
  it.each(["docs/.claude/skills/x/SKILL.md", "docs/adr/.cursor/rules/x.md", "src/lib/x/eslint.config.mjs"])(
    "refuses a tiny PR that changes %s as risky and unreviewed",
    (file) => {
      const tiny = body({ tier: "tiny. Docs only.", criteria: [], review: [] });
      expect(failed(decide(pr({ body: tiny, files: [file] }), main()))).toEqual([
        "Reviewer cleared the PR",
        "Interrogate panel ran",
        "Acceptance criteria ticked",
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
    expect(detail(decision, "Reviewer cleared the PR")).toBe(
      `a tiny PR that changes 30 lines outside docs (up to ${TINY_LINES}) skips the reviewer`,
    );
  });

  // A PR names its own tier, so a bigger "tiny" one still gets the reviewer (JAS-12).
  it("refuses a tiny PR past the limit without the reviewer, and names the files", () => {
    const tiny = body({ tier: "tiny. Copy.", criteria: [], review: [] });
    const files = ["docs/habits.md", "src/lib/analyzer/death-recap.ts"];
    const lines = { "docs/habits.md": 1, "src/lib/analyzer/death-recap.ts": TINY_LINES + 1 };
    const decision = decide(pr({ body: tiny, files }), main(), history({ lines }, files));
    expect(failed(decision)).toEqual(["Reviewer cleared the PR"]);
    expect(detail(decision, "Reviewer cleared the PR")).toContain("31 in src/lib/analyzer/death-recap.ts");
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
      .replace(/^\*\*Door:\*\*.*$/m, "**Door:** two-way. A revert takes the card away.")
      .replace(/^## Review\s*$/m, `## Review\nReviewer agent at ${HEAD}: no blockers`);
    expect(failed(decide(pr({ body: filled }), main()))).toEqual([]);
  });

  // The gates skip HTML comments and fenced code blocks (decision record
  // 0019), but the template still has neither, so a builder filling it in
  // never needs to know that.
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
    ["missing", null],
    ["the template's placeholder", "tiny, normal or risky, and why."],
  ])("refuses a PR whose tier is %s, and asks for the panel in case it's risky", (_, tier) => {
    expect(failed(decide(pr({ body: body({ tier }) }), main()))).toEqual(["Tier is tiny, normal or risky", "Interrogate panel ran"]);
  });

  // Real Tier lines that can-merge refused for naming "risky" in the reason
  // (docs/agent-mistakes/tier-line-names-two-tiers.md), and the other ways
  // this repo's PRs end a tier. Only the tier itself counts, up to the first
  // colon, semicolon, bracket, dash or full stop.
  it.each([
    ["PR 211", "normal: docs plus a new test, nothing on the risky list", "normal"],
    ["PR 211, reworded", "normal: none of its files is in `scripts/risky-paths.ts`", "normal"],
    ["PR 230", "normal: it adds a check and loosens nothing. But it adds a file in `e2e/`, which is on the risky list.", "normal"],
    ["PR 234", "normal. Shared components with two timers, no data changes, nothing on the risky list.", "normal"],
    [
      "PR 237",
      "normal: one area, the header. Jasper merges, because it edits files on `scripts/risky-paths.ts`: the browser tests in `e2e/`, the `verify` skill's Settings feature file, one sentence of `src/app/privacy/page.tsx` and two comments in `src/app/globals.css`.",
      "normal",
    ],
    [
      "PR 238",
      "normal. It fixes one script and changes what `npm run shot -- --phone` does; `scripts/` files here aren't on the risky list.",
      "normal",
    ],
    ["a semicolon", "normal; not on the risky list", "normal"],
    ["an em dash", "normal — nothing on the risky list", "normal"],
    ["an en dash", "normal – nothing on the risky list", "normal"],
    ["a spaced hyphen", "normal - nothing on the risky list", "normal"],
    ["a bracket", "tiny (docs only, nothing on the risky list)", "tiny"],
  ])("reads the tier before %s, though the reason says risky", (_, tier, expected) => {
    const decision = decide(pr({ body: body({ tier }) }), main());
    expect(failed(decision)).toEqual([]);
    expect(detail(decision, "Tier is tiny, normal or risky")).toBe(expected);
  });

  it.each([
    ["the template's placeholder", "tiny, normal or risky, and why."],
    ["two tiers before a colon", "tiny or normal: a copy fix"],
    ["two tiers before a full stop", "normal, maybe risky. A copy fix."],
    ["two tiers around a file name's dot", "normal, `docs/a.md` and risky: a copy fix"],
    // A comma can't end the tier, or the placeholder would read as tiny.
    ["a reason after a comma", "normal, because nothing is on the risky list"],
  ])("still refuses %s for naming more than one tier, and says how to fix it", (_, tier) => {
    expect(detail(decide(pr({ body: body({ tier }) }), main()), "Tier is tiny, normal or risky")).toMatch(
      /^the tier on the \*\*Tier:\*\* line names more than one tier \(.+\); name one, then a colon and the reason/,
    );
  });

  // Tier words in the reason no longer stop a tiny PR (JAS-117), so a tiny PR
  // whose reason says normal or risky skips the reviewer only within the
  // usual limits.
  it("lets a tiny PR whose reason names other tiers skip the reviewer only within the limits", () => {
    const tiny = body({ tier: "tiny. Arguably normal, and nothing on the risky list.", criteria: [], review: [] });
    const small = decide(pr({ body: tiny, files: ["src/x.ts"] }), main());
    expect(failed(small)).toEqual([]);
    expect(detail(small, "Reviewer cleared the PR")).toContain("skips the reviewer");
    const files = ["src/x.ts"];
    const big = decide(pr({ body: tiny, files }), main(), history({ lines: { "src/x.ts": TINY_LINES + 1 } }, files));
    expect(failed(big)).toEqual(["Reviewer cleared the PR"]);
    const risky = decide(pr({ body: tiny, files: ["src/lib/riot/client.ts"] }), main());
    expect(failed(risky)).toEqual(["Reviewer cleared the PR", "Interrogate panel ran", "Acceptance criteria ticked"]);
  });

  it("refuses a migration even when the tier says tiny, and names it", () => {
    const tiny = body({ tier: "tiny. One column.", criteria: [] });
    const decision = decide(pr({ body: tiny, files: ["docs/database.md", "drizzle/0013_notes.sql"] }), main());
    expect(failed(decision)).toEqual(["No files Jasper merges", "Interrogate panel ran", "Acceptance criteria ticked"]);
    expect(detail(decision, "No files Jasper merges")).toBe("drizzle/0013_notes.sql (database migrations)");
  });

  it("refuses a PR that only changes the agent-merge switch", () => {
    const decision = decide(pr({ files: [".claude/agent-merge.json"] }), main());
    expect(failed(decision)).toEqual(["No files Jasper merges", "Interrogate panel ran"]);
    expect(detail(decision, "No files Jasper merges")).toBe(".claude/agent-merge.json (the switch for agent merging)");
  });

  // Risky PRs merge once the interrogate panel and the reviewer clear them
  // (JAS-128), except migrations and the merge gates, which stay Jasper's
  // (JAS-191).
  describe("a risky PR", () => {
    const SIGN_IN = ["src/app/sign-in/page.tsx", "docs/sign-in.md"];
    const panel = (sha: string) => `Interrogate panel at ${sha}: 0 to act on`;
    const risky = (review: string[], tier = "risky. The sign-in page.") => body({ tier, review });
    // The panel ran on an earlier commit the PR added, as docs/workflow.md
    // asks: the first one that passes the checks.
    const added = (sha: string) => (sha === OLDER ? { commits: 1, lines: {}, files: SIGN_IN, created: [] } : undefined);

    it("merges once the panel names a commit in the PR and the reviewer cleared the head", () => {
      const decision = decide(pr({ body: risky([panel(OLDER), "", `Reviewer agent at ${HEAD}: no blockers`]), files: SIGN_IN }), main(), history({ since: added }, SIGN_IN));
      expect(failed(decision)).toEqual([]);
      expect(detail(decision, "Tier is tiny, normal or risky")).toBe("risky");
      expect(detail(decision, "Interrogate panel ran")).toBe(`Interrogate panel at ${OLDER.slice(0, 7)}`);
    });

    it("counts a panel line on the head commit, written with a short sha", () => {
      const decision = decide(pr({ body: risky([panel(HEAD.slice(0, 7)), "", `Reviewer agent at ${HEAD}: no blockers`]), files: SIGN_IN }), main());
      expect(failed(decision)).toEqual([]);
    });

    it.each<[string, string[]]>([
      ["no panel line", [`Reviewer agent at ${HEAD}: no blockers`]],
      ["only the note that it couldn't run", ["no interrogate panel yet", "", `Reviewer agent at ${HEAD}: no blockers`]],
      ["a panel line in a code block", ["```", panel(HEAD), "```", "", `Reviewer agent at ${HEAD}: no blockers`]],
      ["a panel line in a comment", [`<!-- ${panel(HEAD)} -->`, "", `Reviewer agent at ${HEAD}: no blockers`]],
      ["a panel line after a bullet", [`- ${panel(HEAD)}`, "", `Reviewer agent at ${HEAD}: no blockers`]],
      ["a panel line saying it couldn't run", [`Interrogate panel at ${HEAD}: could not run`, "", `Reviewer agent at ${HEAD}: no blockers`]],
    ])("refuses a risky tier with %s", (_, review) => {
      const decision = decide(pr({ body: risky(review), files: SIGN_IN }), main());
      expect(failed(decision)).toEqual(["Interrogate panel ran"]);
      expect(detail(decision, "Interrogate panel ran")).toContain('no "Interrogate panel at <sha>: <n> to act on" line');
    });

    // A panel that ran before the PR touched a risky path never read it, so a
    // docs-only first commit can't stand in for one.
    it("refuses a panel on a commit from before the PR changed a risky path, and names it", () => {
      const docsOnly = (sha: string) => (sha === OLDER ? { commits: 1, lines: {}, files: ["docs/sign-in.md"], created: [] } : undefined);
      const decision = decide(
        pr({ body: risky([panel(OLDER), "", `Reviewer agent at ${HEAD}: no blockers`]), files: SIGN_IN }),
        main(),
        history({ since: docsOnly }, SIGN_IN),
      );
      expect(failed(decision)).toEqual(["Interrogate panel ran"]);
      expect(detail(decision, "Interrogate panel ran")).toContain("src/app/sign-in/page.tsx");
    });

    // Two panels can read the PR's risky files between them.
    it("counts a risky file read by either of two panel lines", () => {
      const both = ["src/app/sign-in/page.tsx", "src/lib/riot/client.ts"];
      const first = (sha: string) => (sha === OLDER ? { commits: 1, lines: {}, files: ["src/app/sign-in/page.tsx"], created: [] } : undefined);
      const review = [panel(OLDER), panel(HEAD), "", `Reviewer agent at ${HEAD}: no blockers`];
      const decision = decide(pr({ body: risky(review), files: both }), main(), history({ since: first }, both));
      expect(failed(decision)).toEqual([]);
    });

    it("reads a panel line with its label in bold", () => {
      const review = [`**Interrogate panel at ${HEAD}:** 3 to act on`, "", `Reviewer agent at ${HEAD}: no blockers`];
      expect(failed(decide(pr({ body: risky(review), files: SIGN_IN }), main()))).toEqual([]);
    });

    // Otherwise "tiny" would skip the criteria on a PR that changes sign-in.
    it("asks a tiny PR that changes a risky path for its acceptance criteria", () => {
      const review = [panel(HEAD), "", `Reviewer agent at ${HEAD}: no blockers`];
      const decision = decide(pr({ body: body({ tier: "tiny. One line.", criteria: [], review }), files: SIGN_IN }), main());
      expect(failed(decision)).toEqual(["Acceptance criteria ticked"]);
    });

    // A normal tier that touches a risky path, like PR 245, needs it too.
    it("needs the panel for a risky path whatever the tier says", () => {
      const decision = decide(pr({ files: SIGN_IN }), main());
      expect(failed(decision)).toEqual(["Interrogate panel ran"]);
      expect(detail(decision, "Interrogate panel ran")).toContain("src/app/sign-in/page.tsx");
    });

    it("refuses a panel that names a commit outside the PR, even beside a good one", () => {
      const outside = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432";
      for (const review of [[panel(outside)], [panel(OLDER), panel(outside)]]) {
        const decision = decide(
          pr({ body: risky([...review, "", `Reviewer agent at ${HEAD}: no blockers`]), files: SIGN_IN }),
          main(),
          history({ since: added }, SIGN_IN),
        );
        expect(failed(decision)).toEqual(["Interrogate panel ran"]);
        expect(detail(decision, "Interrogate panel ran")).toBe(`the panel saw ${outside.slice(0, 7)}, which isn't the head commit or one this PR added`);
      }
    });

    it("doesn't ask for the panel on a normal PR with no risky paths", () => {
      expect(detail(decide(pr(), main()), "Interrogate panel ran")).toBe("not needed: no risky tier and no risky paths");
    });

    // Migrations and the merge gates' own code stay Jasper's whatever the tier
    // and verdicts (JAS-191's second criterion).
    it.each([
      "drizzle/0013_notes.sql",
      "drizzle.config.ts",
      "src/db/schema.ts",
      "scripts/can-merge-gates.ts",
      "scripts/risky-paths.ts",
      ".github/workflows/agent-merge.yml",
      ".github/workflows/agent-merge-sweep.yml",
      ".github/workflows/reviewer.yml",
      ".claude/agent-merge.json",
      ".claude/settings.json",
      "scripts/package.json",
      "scripts/node_modules/zod/index.js",
      "package-lock.json",
    ])("still refuses %s with a panel line and a clean verdict at the head, in every tier", (file) => {
      for (const tier of ["tiny. One line.", "normal. One line.", "risky. One line."]) {
        const files = ["src/app/sign-in/page.tsx", file];
        const decision = decide(pr({ body: risky([panel(HEAD), "", `Reviewer agent at ${HEAD}: no blockers`], tier), files }), main());
        expect(failed(decision)).toEqual(["No files Jasper merges"]);
        expect(detail(decision, "No files Jasper merges")).toContain(file);
      }
    });

    // These were Jasper's until JAS-191 and now merge once the panel and the
    // reviewer clear the head, in every tier.
    it.each([
      ".claude/skills/code-review-and-quality/SKILL.md",
      ".claude/agents/reviewer.md",
      "eslint-rules/no-green-classes.mjs",
      "eslint.config.js",
      "playwright.config.ts",
      "e2e/preview-login.ts",
      "src/app/themes.test.ts",
      "npm-shrinkwrap.json",
      "vercel.json",
    ])("merges %s with a panel line and a clean verdict at the head, in every tier", (file) => {
      for (const tier of ["tiny. One line.", "normal. One line.", "risky. One line."]) {
        const files = ["src/app/sign-in/page.tsx", file];
        const decision = decide(pr({ body: risky([panel(HEAD), "", `Reviewer agent at ${HEAD}: no blockers`], tier), files }), main());
        expect(failed(decision)).toEqual([]);
      }
    });

    // JAS-191's first criterion: a check's own files merge once the panel and
    // the reviewer clear the head commit, and not without either.
    describe.each([".github/workflows/ci.yml", ".claude/hooks/check-before-commit.mjs", "package.json"])("a PR that changes %s", (file) => {
      const files = [file, "docs/workflow.md"];
      const verdict = `Reviewer agent at ${HEAD}: no blockers`;

      it("merges once the panel and the reviewer clear the head", () => {
        const decision = decide(pr({ body: body({ review: [panel(HEAD), "", verdict] }), files }), main());
        expect(failed(decision)).toEqual([]);
        expect(detail(decision, "No files Jasper merges")).toBe("none of the 2 changed paths is on Jasper's list in scripts/risky-paths.ts");
      });

      it("refuses it without the panel", () => {
        const decision = decide(pr({ body: body({ review: [verdict] }), files }), main());
        expect(failed(decision)).toEqual(["Interrogate panel ran"]);
        expect(detail(decision, "Interrogate panel ran")).toContain(file);
      });

      it("refuses it without the reviewer", () => {
        expect(failed(decide(pr({ body: body({ review: [panel(HEAD)] }), files }), main()))).toEqual(["Reviewer cleared the PR"]);
      });

      it("refuses it when the file changed after the panel and the reviewer cleared an earlier commit", () => {
        const since = (sha: string) => (sha === OLDER ? { commits: 1, lines: changes({ [file]: 1 }), files, created: [] } : undefined);
        const decision = decide(pr({ body: body({ review: [panel(OLDER), "", `Reviewer agent at ${OLDER}: no blockers`] }), files }), main(), history({ since }, files));
        expect(failed(decision)).toEqual(["Reviewer cleared the PR"]);
        expect(detail(decision, "Reviewer cleared the PR")).toContain(`${file} changed after the verdict`);
      });
    });

    // JAS-191's third criterion. Dependabot's PRs change package.json and
    // .github/workflows/, which are off Jasper's list now, so only "Built by
    // Claude Code" keeps them, and anyone else's, his.
    it.each<[string, Partial<PrSnapshot>]>([
      ["it comes from a fork", { isCrossRepository: true }],
      ["Dependabot opened it on its own branch", { headRefName: "dependabot/npm_and_yarn/next-16.1.0", author: { login: "app/dependabot", isBot: true } }],
      ["a bot opened it on a claude/ branch", { author: { login: "app/some-bot", isBot: true } }],
      ["a person opened it on their own branch", { headRefName: "jasper/try-ci" }],
      ["its Builder line names another builder", { body: body({ builder: "Cursor chat on Grok 4.7.", review: [panel(HEAD), "", `Reviewer agent at ${HEAD}: no blockers`] }) }],
    ])("still refuses a PR that changes CI and dependencies when %s, with the panel and the reviewer", (_, overrides) => {
      const files = ["package.json", ".github/workflows/ci.yml", ".github/dependabot.yml"];
      const decision = decide(pr({ body: body({ review: [panel(HEAD), "", `Reviewer agent at ${HEAD}: no blockers`] }), files, ...overrides }), main());
      expect(failed(decision)).toEqual(["Built by Claude Code"]);
    });

    it("lets Claude merge skills after the panel, the verify and postmortem skills included", () => {
      const files = [".claude/skills/verify-turnpoint-ux/features/review-path.md", ".claude/skills/verify/SKILL.md", ".claude/skills/postmortem/SKILL.md"];
      const without = decide(pr({ files }), main());
      expect(failed(without)).toEqual(["Interrogate panel ran"]);
      const withPanel = decide(pr({ body: body({ review: [panel(HEAD), "", `Reviewer agent at ${HEAD}: no blockers`] }), files }), main());
      expect(failed(withPanel)).toEqual([]);
    });

    // Acceptance criterion 1, on a real description: PR 245 restyled the
    // sign-in page (normal tier, a risky path). The reviewer cleared f5d8985
    // and then 389ec03; 37d5a10 only retried the Vercel preview.
    describe("PR 245's own description", () => {
      const BODY_245 = readFileSync(new URL("./can-merge-fixtures/body-245.md", import.meta.url), "utf8");
      const FILES_245 = ["docs/sign-in.md", "src/app/sign-in/page.tsx", "src/app/sign-in/sign-in-panel.test.tsx", "src/app/sign-in/sign-in-panel.tsx"];
      const snapshot245 = (text: string) =>
        pr({ number: 245, headRefName: "claude/jas-104-sign-in-page", headRefOid: "37d5a1090093abb099676924a398dbc774a1c8f7", body: text, files: FILES_245 });
      const git245 = history(
        {
          since: (sha) =>
            "389ec035b4c2e0dbdb98965851a44ce24ce864d7".startsWith(sha)
              ? { commits: 1, lines: {}, files: FILES_245, created: [] }
              : "f5d898558b7a8ba5a7527678cc6900bd8194f931".startsWith(sha)
                ? { commits: 2, lines: changes({ "src/app/sign-in/sign-in-panel.tsx": 4, "docs/sign-in.md": 1 }), files: FILES_245, created: [] }
                : undefined,
        },
        FILES_245,
      );

      it("is refused as written, since it has no panel line", () => {
        const decision = decide(snapshot245(BODY_245), main(), git245);
        expect(failed(decision)).toEqual(["Interrogate panel ran"]);
      });

      it("merges once a panel line on its first commit is added", () => {
        const withPanel = BODY_245.replace("No interrogate panel: normal tier.", "Interrogate panel at f5d8985: 0 to act on");
        expect(withPanel).not.toBe(BODY_245);
        const decision = decide(snapshot245(withPanel), main(), git245);
        expect(failed(decision)).toEqual([]);
        expect(detail(decision, "Reviewer cleared the PR")).toMatch(/^Reviewer agent at 389ec035b4c2e0dbdb98965851a44ce24ce864d7: no blockers/);
      });
    });
  });

  // A one-way door is something a revert can't undo, which stays Jasper's to
  // merge (decision record 0008; Jasper kept it on 2026-11-01, JAS-128).
  describe("the Door line", () => {
    it.each<[string, string]>([
      ["one-way", "one-way. It sends an email."],
      ["the template's placeholder", "one-way or two-way. Two-way means a revert undoes it completely."],
      ["neither", "maybe. Nothing stays, I think."],
      ["two-way, then one-way in its reason", "two-way, except the emails it sends are one-way."],
      ["two-way, then one-way after a full stop", "two-way. The rows it writes are one-way."],
      ["a word that only starts with two-way", "two-way-ish. Most of it reverts."],
      ["two-way, then one way with a space", "two-way, apart from the emails, which are one way."],
      ["two-way, then one-way with a non-breaking hyphen", "two-way, apart from the emails, which are one‑way."],
      ["two-way with a word before it", "not two-way, I think."],
    ])("refuses a PR whose door is %s", (_, door) => {
      expect(failed(decide(pr({ body: body({ door }) }), main()))).toEqual(["Two-way door"]);
    });

    // Two lines could each be the one GitHub shows, even on a PR that needn't have one.
    it("refuses a tiny PR with two Door lines", () => {
      const tiny = body({ tier: "tiny. Copy.", door: "two-way.\n**Door:** two-way, again." });
      expect(failed(decide(pr({ body: tiny }), main()))).toEqual(["Two-way door"]);
    });

    // A code block can start after "- ", where the gate might read it as code
    // and GitHub as text, so it fails closed here too.
    it("refuses a one-way line inside a code block", () => {
      const text = body({ tier: "tiny. Copy.", door: null }).replace("## Merge Danger\n", "## Merge Danger\n```\n**Door:** one-way\n```\n");
      expect(failed(decide(pr({ body: text }), main()))).toEqual(["Two-way door"]);
    });

    // These read as one-way on GitHub but aren't the exact "**Door:**" line, so
    // the gate must not count them as no line at all.
    it.each([
      "- **Door:** one-way",
      "**Door: one-way.**",
      "**Door**: one-way",
      "Door: one-way",
      "> `**Door:**` one-way",
      "**Door**: one way",
      "**Door** one-way",
      "<b>Door:</b> one-way",
    ])(
      "refuses a line that only looks like the Door line and says one-way: %s, at any tier",
      (line) => {
        for (const tier of ["tiny. Copy.", "normal. Copy."]) {
          const text = body({ tier, door: null }).replace("## Merge Danger\n", `## Merge Danger\n${line}\n`);
          expect(failed(decide(pr({ body: text }), main()))).toEqual(["Two-way door"]);
        }
      },
    );

    it("doesn't refuse a line that mentions a one-way door in passing", () => {
      const text = body().replace("Adds a card to Insights.", "- The gate refuses a door marked `one-way`, and Door notes say why.");
      expect(failed(decide(pr({ body: text }), main()))).toEqual([]);
    });

    it("lets a tiny PR with no risky paths leave the Door line out", () => {
      const tiny = body({ tier: "tiny. Copy.", door: null });
      expect(detail(decide(pr({ body: tiny }), main()), "Two-way door")).toBe("a tiny PR with no risky paths needs no **Door:** line");
    });

    // A normal PR can be a one-way door too, such as one that sends a message,
    // so leaving the line out can't be how it merges.
    it("refuses a normal PR with no Door line", () => {
      const decision = decide(pr({ body: body({ door: null }) }), main());
      expect(failed(decision)).toEqual(["Two-way door"]);
      expect(detail(decision, "Two-way door")).toContain("no **Door:** line");
    });

    it("refuses a risky PR with no Door line", () => {
      const review = [`Interrogate panel at ${HEAD}: 0 to act on`, "", `Reviewer agent at ${HEAD}: no blockers`];
      const decision = decide(pr({ body: body({ tier: "risky. Sign-in.", door: null, review }), files: ["src/app/sign-in/page.tsx"] }), main());
      expect(failed(decision)).toEqual(["Two-way door"]);
    });
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
    expect(failed(decision)).toEqual(["Reviewer cleared the PR"]);
    expect(detail(decision, "Reviewer cleared the PR")).toContain("85e30eb, which isn't the head commit 2ee7e1d or one this PR added before it");
  });

  it("refuses when the reviewer found blockers at the head commit", () => {
    const review = [`Reviewer agent at ${OLDER}: 2 blockers`, `Reviewer agent at ${HEAD.slice(0, 12)}: 1 blockers`];
    expect(failed(decide(pr({ body: body({ review }) }), main()))).toEqual(["Reviewer cleared the PR"]);
  });

  it("refuses a normal PR with no reviewer line in the new format", () => {
    const decision = decide(pr({ body: body({ review: ["Reviewer agent: no blockers."] }) }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the PR"]);
  });

  // A re-review names the commit it started from (JAS-17). The gate reads the
  // head commit's verdict the same way, whatever follows it. The detail shows
  // it judged the re-review's line, not only the older one.
  it.each<[string, string[]]>([
    ["no blockers", []],
    ["1 blockers", ["Reviewer cleared the PR"]],
  ])("reads a re-review's %s like a full review's", (verdict, failing) => {
    const since = OLDER.slice(0, 7);
    const review = [`Reviewer agent at ${OLDER}: 2 blockers`, `Reviewer agent at ${HEAD}: ${verdict} (re-review since ${since})`];
    const older = (sha: string) =>
      sha === OLDER ? { commits: 1, lines: changes({ "src/components/habit-card.tsx": 2 }), files: pr().files, created: [] } : undefined;
    const decision = decide(pr({ body: body({ review }) }), main(), history({ since: older }));
    expect(failed(decision)).toEqual(failing);
    expect(detail(decision, "Reviewer cleared the PR")).toContain(`${verdict} (re-review since ${since})`);
  });

  // PR 209's re-review lines put the suffix before the colon, so the gate
  // skipped them and its message named only the older commits. It names the
  // line it couldn't read and the shape it reads (docs/agent-mistakes.md).
  it.each<[string, string[]]>([
    ["with an older verdict", [`Reviewer agent at ${OLDER}: no blockers`]],
    ["on its own", []],
  ])("names a verdict line it can't read, %s", (_, others) => {
    const misplaced = `Reviewer agent at ${HEAD} (re-review since ${OLDER.slice(0, 7)}): no blockers`;
    const decision = decide(pr({ body: body({ review: [misplaced, "", ...others] }) }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the PR"]);
    expect(detail(decision, "Reviewer cleared the PR")).toContain(
      `couldn't read "${misplaced}": a verdict is a line of its own after a blank line, reading "Reviewer agent at <sha>: no blockers", with a re-review's "(re-review since <since>)" after the verdict`,
    );
  });

  it("quotes a repeated unread line once, and not a line that only mentions a commit", () => {
    const misplaced = `Reviewer agent at ${HEAD} (re-review since ${OLDER.slice(0, 7)}): no blockers`;
    const mention = `- Fixed: the Reviewer agent at ${OLDER.slice(0, 7)} asked for a test`;
    const decision = decide(pr({ body: body({ review: [misplaced, misplaced, mention] }) }), main());
    const text = detail(decision, "Reviewer cleared the PR");
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
    const gate = decide(snapshot, main()).gates.find(({ name }) => name === "Reviewer cleared the PR");
    expect(reviewerCleared(snapshot, history({}, snapshot.files))).toEqual(gate);
  });

  describe("a verdict on an earlier commit (0017)", () => {
    const MIDDLE = "4b1c9d0e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c";
    const files = ["src/components/habit-card.tsx", "src/components/habit-card.test.tsx", "docs/habits.md"];
    const gateOf = (review: string[], since: ReviewHistory["since"], changed = files) =>
      decide(pr({ body: body({ review }), files: changed }), main(), history({ since }, changed));
    const after =
      (lines: ChangedLines, { commits = 2, at = files, created = [] as string[] } = {}) =>
      (sha: string) =>
        sha === OLDER ? { commits, lines, files: at, created } : sha === MIDDLE ? { commits: 1, lines, files: at, created } : undefined;
    const reviewer = (decision: Decision) => detail(decision, "Reviewer cleared the PR");

    it("carries over a no-blockers verdict past small fixes, docs and a new test file", () => {
      const changed = [...files, "src/components/habit-card-2.test.tsx"];
      const lines = changes({ "src/components/habit-card.tsx": CARRY_OVER_LINES, "src/components/habit-card-2.test.tsx": 300, "docs/habits.md": 80 });
      const decision = gateOf(
        [`Reviewer agent at ${OLDER}: no blockers`],
        after(lines, { created: ["src/components/habit-card-2.test.tsx"] }),
        changed,
      );
      expect(decision.ok).toBe(true);
      expect(reviewer(decision)).toBe(
        `Reviewer agent at ${OLDER}: no blockers, carried over 2 commits with ${CARRY_OVER_LINES} lines outside docs`,
      );
    });

    it("refuses once more than the limit changed outside docs", () => {
      const lines = changes({ "src/components/habit-card.tsx": CARRY_OVER_LINES + 1 });
      const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], after(lines));
      expect(failed(decision)).toEqual(["Reviewer cleared the PR"]);
      expect(reviewer(decision)).toContain(`${CARRY_OVER_LINES + 1} lines outside docs changed after the verdict`);
    });

    // An early return or a mock added to an existing test weakens it as surely as a deletion.
    it.each([
      ["deleted", { added: 0, deleted: CARRY_OVER_LINES + 1 }],
      ["added", { added: CARRY_OVER_LINES + 1, deleted: 0 }],
    ])("counts %s lines in a test file that was already there, so a test can't be weakened unseen", (_, change) => {
      const lines = { "src/components/habit-card.test.tsx": change };
      expect(failed(gateOf([`Reviewer agent at ${OLDER}: no blockers`], after(lines)))).toEqual(["Reviewer cleared the PR"]);
    });

    it.each(["docs/workflow.md", "docs/agents/issue-tracker.md", "src/db/schema.ts", "scripts/can-merge-gates.ts"])(
      "refuses when %s changed after the verdict, however small",
      (file) => {
        const changed = [...files, file];
        const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], after(changes({ [file]: 1 })), changed);
        expect(reviewer(decision)).toContain(`${file} changed after the verdict`);
      },
    );

    it("refuses a mode-only change to a rule file after the verdict", () => {
      const changed = [...files, ".claude/hooks/cloud-setup.mjs"];
      const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], after(changes({ ".claude/hooks/cloud-setup.mjs": 0 })), changed);
      expect(reviewer(decision)).toContain(".claude/hooks/cloud-setup.mjs changed after the verdict");
    });

    it("counts a file put back to main's version after the verdict", () => {
      const decision = gateOf(
        [`Reviewer agent at ${OLDER}: no blockers`],
        after(changes({ "src/lib/guard.ts": 120 }), { at: [...files, "src/lib/guard.ts"] }),
      );
      expect(reviewer(decision)).toContain("120 lines outside docs changed after the verdict");
    });

    it("refuses when the newest verdict found blockers", () => {
      const decision = gateOf(
        [`Reviewer agent at ${OLDER}: no blockers`, `Reviewer agent at ${MIDDLE}: 1 blockers`],
        after(changes({ "src/components/habit-card.tsx": 1 })),
      );
      expect(reviewer(decision)).toContain("A fix for a blocker needs a new review");
    });

    it("uses the newest verdict when an earlier one found blockers", () => {
      const decision = gateOf(
        [`Reviewer agent at ${OLDER}: 2 blockers`, `Reviewer agent at ${MIDDLE}: no blockers (re-review since ${OLDER.slice(0, 7)})`],
        after(changes({ "src/components/habit-card.tsx": 3 })),
      );
      expect(decision.ok).toBe(true);
    });

    it("refuses when a force push dropped the commit with the blockers verdict", () => {
      const dropped = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432";
      const decision = gateOf(
        [`Reviewer agent at ${OLDER}: no blockers`, `Reviewer agent at ${dropped}: 1 blockers`],
        after(changes({ "src/components/habit-card.tsx": 1 })),
      );
      expect(reviewer(decision)).toContain("isn't on the branch any more");
    });

    it("lets a clean review of the head clear a blockers verdict a force push dropped", () => {
      const dropped = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432";
      const decision = gateOf([`Reviewer agent at ${dropped}: 1 blockers`, `Reviewer agent at ${HEAD}: no blockers`], () => undefined);
      expect(decision.ok).toBe(true);
    });

    it("doesn't count files the PR never changed, such as main merged in", () => {
      const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], after(changes({ "src/lib/other.ts": 900, "CLAUDE.md": 4 })));
      expect(decision.ok).toBe(true);
    });

    it("refuses a verdict on a commit the PR didn't add", () => {
      const decision = gateOf([`Reviewer agent at ${OLDER}: no blockers`], () => undefined);
      expect(reviewer(decision)).toBe(
        `the reviewer saw ${OLDER.slice(0, 7)}, which isn't the head commit ${HEAD.slice(0, 7)} or one this PR added before it`,
      );
    });

    it("reads a blockers verdict on a tiny PR under the limit instead of skipping it", () => {
      const tiny = body({ tier: "tiny. Copy.", criteria: [], review: [`Reviewer agent at ${HEAD}: 1 blockers`] });
      const decision = decide(pr({ body: tiny, files: ["src/components/habit-card.tsx"] }), main());
      expect(reviewer(decision)).toContain("blockers in the newest verdict");
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

  // GitHub shows a "## " line inside a code block or an HTML comment as text,
  // not a heading, so the gates mustn't read it as a section either (JAS-58).
  describe("text GitHub doesn't show as a heading", () => {
    const fake = (open: string, close: string | null, section = "Review", inside = [`Reviewer agent at ${HEAD}: no blockers`]) =>
      [open, `## ${section}`, ...inside, ...(close === null ? [] : [close])].join("\n");
    // The fake section goes in Summary, before the real one.
    const withSummary = (summary: string, parts: BodyParts = {}) =>
      body(parts).replace("Adds a card to Insights.", `Adds a card to Insights.\n\n${summary}`);
    const reviewerGate = (text: string, files = pr().files) => {
      const snapshot = pr({ body: text, files });
      const gate = decide(snapshot, main()).gates.find(({ name }) => name === "Reviewer cleared the PR");
      // GitHub's reviewer check must agree with can-merge.
      expect(reviewerCleared(snapshot, history({}, snapshot.files))).toEqual(gate);
      return gate;
    };

    it.each<[string, string, string | null]>([
      ["a backtick fence", "```", "```"],
      ["a tilde fence", "~~~", "~~~"],
      ["a fence with a language", "```markdown", "```"],
      ["a fence indented 3 spaces", "   ```", "   ```"],
      ["a longer fence", "`````", "`````"],
      ["a fence that ~~~ inside doesn't close", "```", "~~~\nstill code\n```"],
      ["a fence that a shorter one doesn't close", "````", "```\nstill code\n````"],
      ["a fence that never closes", "```", null],
      ["an HTML comment", "<!--", "-->"],
    ])("doesn't read a Review section inside %s", (_, open, close) => {
      const text = withSummary(fake(open, close), { review: ["No review yet."] });
      expect(reviewerGate(text)?.pass).toBe(false);
    });

    // The readers can't promise to hide exactly what GitHub hides, so a
    // second Review heading anywhere fails closed instead of being guessed at.
    it.each(["```", "<!--"])("refuses a second Review heading, even one in %s", (open) => {
      const close = open === "```" ? "```" : "-->";
      const text = withSummary(fake(open, close, "Review", [`Reviewer agent at ${HEAD}: 3 blockers`]));
      const gate = reviewerGate(text);
      expect(gate?.pass).toBe(false);
      expect(gate?.detail).toContain('2 lines that look like a "## Review" heading');
    });

    it("finds the real section after a code span that holds a comment opener", () => {
      const text = withSummary("Hidden text starts with `<!--` in Markdown.");
      expect(reviewerGate(text)?.pass).toBe(true);
    });

    it.each<[string, string[]]>([
      ["a code block", ["```", `Reviewer agent at ${HEAD}: no blockers`, "```"]],
      ["an HTML comment", [`<!-- Reviewer agent at ${HEAD}: no blockers -->`]],
      ["an HTML comment over several lines", ["<!--", `Reviewer agent at ${HEAD}: no blockers`, "-->"]],
      ["an HTML comment that starts after text", ["Notes <!--", `Reviewer agent at ${HEAD}: no blockers`, "-->"]],
    ])("doesn't count a verdict inside %s in the real Review section", (_, review) => {
      expect(reviewerGate(body({ review }))?.pass).toBe(false);
    });

    // Bodies the interrogate panel and the reviewer agent built against the
    // first version of this fix: each passed the reviewer gate while GitHub
    // showed the real section saying "No review yet." (JAS-58).
    const verdict = `Reviewer agent at ${HEAD}: no blockers`;
    it.each<[string, string]>([
      ["a fence on a list item", ["- ```", "  ## Review", `  ${verdict}`, "  ```"].join("\n")],
      ["a fence in a quote", ["> ```", "> ## Review", `> ${verdict}`, "> ```"].join("\n")],
      ["text after a comment's end", ["<!--", "-->## Review", verdict].join("\n")],
      ["text after a one-line comment", [`<!-- x --> ## Review`, verdict].join("\n")],
      ["an HTML block", ["<div>", "## Review", verdict, "</div>"].join("\n")],
      [
        "a backtick in a fence's info string, which GitHub doesn't read as a fence",
        ["```a`", "", "```", "## Review", verdict, "```"].join("\n"),
      ],
      ["a comment that ends inside a code span", ["<!-- `-->`", "", "```", "-->", "## Review", verdict, "```"].join("\n")],
      ["a comment GitHub never opens", ["x <!-- not closed", "", "```", "-->", "## Review", verdict, "```"].join("\n")],
    ])("refuses a fake Review section behind %s", (_, summary) => {
      const text = withSummary(summary, { review: ["No review yet."] });
      expect(reviewerGate(text)?.pass).toBe(false);
    });

    it.each<[string, string[]]>([
      ["a code span with uneven backticks", ["No review yet. `<!--``", verdict, "-->"]],
      ["a link definition's title", ["[a]: /u '", verdict, "'"]],
    ])("refuses a verdict GitHub hides behind %s", (_, review) => {
      expect(reviewerGate(body({ review }))?.pass).toBe(false);
    });

    it.each<[string, string]>([
      ["indented 4 spaces", "    **Tier:** tiny"],
      ["in a code block", "```\n**Tier:** tiny\n```"],
    ])("refuses a second Tier line %s", (_, summary) => {
      const text = withSummary(summary, { tier: "risky. Sign-in." });
      expect(detail(decide(pr({ body: text }), main()), "Tier is tiny, normal or risky")).toBe("2 lines start with **Tier:**; keep one");
    });

    it("doesn't read a heading indented 4 spaces", () => {
      const text = withSummary(`    ## Review\n    Reviewer agent at ${HEAD}: no blockers`, { review: ["No review yet."] });
      expect(reviewerGate(text)?.pass).toBe(false);
    });

    it.each(["```", "<!--"])("doesn't read Acceptance criteria inside %s", (open) => {
      const close = open === "```" ? "```" : "-->";
      const summary = fake(open, close, "Acceptance criteria", ['- [x] A: test "a"']);
      const decision = decide(pr({ body: withSummary(summary, { criteria: ["- [ ] B"] }) }), main());
      expect(failed(decision)).toEqual(["Acceptance criteria ticked"]);
    });

    // Failing is the safe side: an unticked box counts wherever it is, a
    // ticked one only where GitHub shows it.
    it.each<[string, string[]]>([
      ["a code block", ["```", "- [ ] B", "```"]],
      ["a comment GitHub never closes", ["Notes <!-- not closed", "", "- [ ] B"]],
    ])("counts an unticked box inside %s", (_, hidden) => {
      const criteria = ['- [x] A: test "a"', ...hidden];
      expect(detail(decide(pr({ body: body({ criteria }) }), main()), "Acceptance criteria ticked")).toContain('1 of 2 unticked: "- [ ] B"');
    });

    it.each<[string, string[]]>([
      ["a code block", ["```", '- [x] A: test "a"', "```"]],
      ["a line with a comment", ['<!-- x --> - [x] A: test "a"']],
    ])("doesn't count a ticked box inside %s", (_, hidden) => {
      expect(failed(decide(pr({ body: body({ criteria: hidden }) }), main()))).toEqual(["Acceptance criteria ticked"]);
    });

    it.each(["##", "# Notes", "## Notes ##"])("ends the criteria at a %s heading", (heading) => {
      const criteria = ["None yet.", "", heading, '- [x] A: test "a"'];
      expect(failed(decide(pr({ body: body({ criteria }) }), main()))).toEqual(["Acceptance criteria ticked"]);
    });

    // A "# " comment in a list item's code block looks like a heading to the
    // gates, which don't follow a fence after "- ", so the section ends there.
    // A failing line after it must still count (re-review at e8adedb).
    it.each(["- ", "1. "])("counts an unticked box after a # comment in a code block on a %slist item", (marker) => {
      const pad = " ".repeat(marker.length);
      const criteria = ['- [x] A: test "a"', `${marker}\`\`\`bash`, `${pad}# how to try it`, `${pad}npx vitest`, `${pad}\`\`\``, "- [ ] B"];
      expect(detail(decide(pr({ body: body({ criteria }) }), main()), "Acceptance criteria ticked")).toContain('1 of 2 unticked: "- [ ] B"');
    });

    it("refuses blockers after a # comment in a list item's code block even when an older clean verdict would carry over", () => {
      const review = [`Reviewer agent at ${OLDER}: no blockers`, "", "- ```bash", "  # run it", "  npx vitest", "  ```", "", `Reviewer agent at ${HEAD}: 1 blockers`];
      const older = (sha: string) =>
        sha === OLDER ? { commits: 1, lines: changes({ "src/components/habit-card.tsx": 2 }), files: pr().files, created: [] } : undefined;
      expect(failed(decide(pr({ body: body({ review }) }), main(), history({ since: older })))).toEqual(["Reviewer cleared the PR"]);
    });

    // The real heading GitHub shows can be hidden from the gate by a code
    // block that starts after "- " or a "<!--" in a paragraph. Treating that
    // as no Review section let a tiny PR skip past blockers (re-review at
    // f50720e).
    it.each<[string, string]>([
      ["a code block on a list item", "- ```bash\n  npm run dev\n  ```"],
      ["a <!-- in a paragraph", "Docs use <!-- for hidden notes."],
    ])("reads a blockers verdict on a tiny PR when the heading is hidden from the gate by %s", (_, summary) => {
      const parts = { tier: "tiny. Copy.", criteria: [], review: [`Reviewer agent at ${HEAD}: 1 blockers`] };
      for (const files of [["docs/habits.md"], ["src/components/habit-card.tsx"]]) {
        const gate = reviewerGate(withSummary(summary, parts), files);
        expect(gate?.pass).toBe(false);
        expect(gate?.detail).toContain(`can't see the "## Review" heading`);
      }
    });

    it("names the code block when a verdict after one can't be read", () => {
      const review = [`Reviewer agent at ${HEAD}: no blockers (re-review since ${OLDER.slice(0, 7)})`, "", "- ```bash", "  npx vitest", "  ```", "", `Reviewer agent at ${OLDER}: 1 blockers`];
      const gate = reviewerGate(body({ review }));
      expect(gate?.pass).toBe(false);
      expect(gate?.detail).toContain('the gate reads the lines from "```" on as code or a comment');
    });

    it("names the line that ended the section when a verdict after it can't be read", () => {
      const review = [`Reviewer agent at ${HEAD}: no blockers`, "", "- ```bash", "  # run it", "  ```", "", `Reviewer agent at ${OLDER}: 1 blockers`];
      const gate = reviewerGate(body({ review }));
      expect(gate?.pass).toBe(false);
      expect(gate?.detail).toContain('the gate\'s Review section ended at "# run it"');
    });

    // GitHub shows these as the heading, but the gate can't read them, so a
    // verdict under one must still count against a tiny PR (re-review at
    // 468b685).
    it.each(["## Review\u00a0", "## Review:", "Review\n------"])("refuses a tiny PR's verdict under a heading the gate can't read: %j", (heading) => {
      const tiny = body({ tier: "tiny. Copy.", criteria: [], review: [`Reviewer agent at ${HEAD}: 1 blockers`] }).replace("## Review", heading);
      expect(reviewerGate(tiny, ["docs/habits.md"])?.pass).toBe(false);
    });

    it("says a heading has the wrong level rather than that something hides it", () => {
      const tiny = body({ tier: "tiny. Copy.", criteria: [], review: [`Reviewer agent at ${HEAD}: no blockers`] }).replace("## Review", "### Review");
      expect(reviewerGate(tiny, ["docs/habits.md"])?.detail).toContain('"### Review" isn\'t read as a "## Review" heading');
    });

    it.each<[string, string[], string]>([
      ["a bullet after a comment", ["<!-- paste below -->", "", `- Reviewer agent at ${HEAD}: no blockers`], "reads the lines from"],
      ["a quote under the next real heading", [`Reviewer agent at ${HEAD}: no blockers`, "", "## Docs and decisions touched", `Earlier: Reviewer agent at ${OLDER}: 1 blockers`], "section ended at"],
    ])("doesn't blame the wrong line for %s", (_, review, wrongCause) => {
      const gate = reviewerGate(body({ review }));
      expect(gate?.pass).toBe(false);
      expect(gate?.detail).toContain("couldn't read");
      expect(gate?.detail).not.toContain(wrongCause);
    });

    it("doesn't read a Tier line inside a code block", () => {
      const text = withSummary("```\n**Tier:** tiny\n```", { tier: null });
      expect(detail(decide(pr({ body: text }), main()), "Tier is tiny, normal or risky")).toBe("no **Tier:** line");
    });
  });

  // A verdict is a line of its own. One quoted in the middle of a sentence or
  // after a bullet is a mention, not the reviewer's line (JAS-58).
  it.each([
    `Earlier: Reviewer agent at ${HEAD}: no blockers`,
    `- Reviewer agent at ${HEAD}: no blockers`,
    `> Reviewer agent at ${HEAD}: no blockers`,
    `* Reviewer agent at ${HEAD}: no blockers`,
    `    Reviewer agent at ${HEAD}: no blockers`,
    `\tReviewer agent at ${HEAD}: no blockers`,
  ])("doesn't count a verdict that doesn't start its line, and names it: %s", (line) => {
    const decision = decide(pr({ body: body({ review: ["No review yet.", "", line] }) }), main());
    expect(failed(decision)).toEqual(["Reviewer cleared the PR"]);
    expect(detail(decision, "Reviewer cleared the PR")).toContain("a verdict is a line of its own");
  });

  // Skipping the newer line would let the older clean verdict carry over
  // past the blockers GitHub shows.
  it("refuses blockers after a bullet even when an older clean verdict would carry over", () => {
    const review = [`Reviewer agent at ${OLDER}: no blockers`, "", `- Reviewer agent at ${HEAD}: 2 blockers`];
    const older = (sha: string) =>
      sha === OLDER ? { commits: 1, lines: changes({ "src/components/habit-card.tsx": 2 }), files: pr().files, created: [] } : undefined;
    expect(failed(decide(pr({ body: body({ review }) }), main(), history({ since: older })))).toEqual(["Reviewer cleared the PR"]);
  });

  it.each([`**Reviewer agent at ${HEAD}: no blockers**`, `\`Reviewer agent at ${HEAD}: no blockers\``, `  Reviewer agent at ${HEAD}: no blockers`])(
    "counts a verdict in bold, in code or indented up to 3 spaces: %s",
    (line) => {
      expect(decide(pr({ body: body({ review: [line] }) }), main()).ok).toBe(true);
    },
  );

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
      "No files Jasper merges",
      "Reviewer cleared the PR",
      "Interrogate panel ran",
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
