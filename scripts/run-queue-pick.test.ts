import { describe, expect, it } from "vitest";
import { CEILING, parseTouches, pickTickets, TRIES, type Picks, type QueueState, type Status, type Ticket } from "./run-queue-pick";

// A written-up, Ready, Medium ticket that touches a file of its own, so
// tickets clash only when a test says so.
function ticket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    title: `Ticket ${id}`,
    status: "Ready",
    priority: "Medium",
    createdAt: "2026-11-01T12:00:00.000Z",
    description: `${CRITERIA}\n\n${touching(`src/${id}.ts`)}`,
    blockedBy: [],
    labels: [],
    assignedToJasper: false,
    hasSubTickets: false,
    ...overrides,
  };
}

const CRITERIA = "**Acceptance criteria**\n\n- [ ] It works.";

function touching(...files: string[]): string {
  return `**Touches.** ${files.map((file) => `\`${file}\``).join(", ")}`;
}

function queue(overrides: Partial<QueueState> = {}): QueueState {
  return { tickets: [], openPrs: [], running: [], outOfTries: [], vercelRefusing: false, ...overrides };
}

function whyWaits(picks: Picks, id: string): string[] | undefined {
  return picks.waits.find((wait) => wait.id === id)?.why;
}

function merged(tickets: Ticket[], ids: string[]): Ticket[] {
  return tickets.map((t): Ticket => (ids.includes(t.id) ? { ...t, status: "Done" } : t));
}

// Copied from the tickets on 2026-11-02, with the lines around them, so the
// paths in backticks on other lines show they aren't read.
const JAS_143 = [
  "**Tier.** Risky: it decides what runs unattended. Jasper merges it, because it changes `scripts/risky-paths.ts`.",
  "",
  "**Touches.** `scripts/run-queue-pick.ts`, `scripts/run-queue-pick.test.ts`, `scripts/risky-paths.ts`, `scripts/risky-paths.test.ts`",
  "",
  "**Builder.** Claude Code on Opus 5.5, in a local or cloud session. One builder for this ticket.",
].join("\n");
const JAS_144 =
  "**Touches.** `.github/workflows/run-queue.yml`, `.github/ISSUE_TEMPLATE/feature.md`, `.claude/skills/run-queue/SKILL.md`, `scripts/run-queue.ts`, `scripts/run-queue-rest.ts`, `scripts/run-queue-rest.test.ts`, `docs/workflow.md`, `CLAUDE.md`, `ARCHITECTURE.md`";
const JAS_146 = [
  "**Touches.** `scripts/risky-paths.ts`, `scripts/risky-paths.test.ts`, `docs/adr/0025-risky-prs-merge-after-the-panel.md`",
  "",
  '**Clashes.** <issue id="10c0353a-9a1b-4a26-9842-18c1e9069081" href="https://linear.app/jaspy/issue/JAS-143/run-queue-the-picking-script-and-its-tests">JAS-143</issue> also changes `scripts/risky-paths.ts` and its test, so these two can\'t run at once. Neither depends on the other.',
].join("\n");
const JAS_164 =
  "**Touches.** `.github/workflows/agent-merge.yml`, `docs/workflow.md`. The builder adds any other file the cause turns out to need.";

describe("parseTouches", () => {
  it("reads the paths on JAS-143's Touches line and no other line", () => {
    expect(parseTouches(JAS_143)).toEqual({
      files: ["scripts/run-queue-pick.ts", "scripts/run-queue-pick.test.ts", "scripts/risky-paths.ts", "scripts/risky-paths.test.ts"],
    });
  });

  it("reads all nine of JAS-144's paths", () => {
    expect(parseTouches(JAS_144)).toEqual({
      files: [
        ".github/workflows/run-queue.yml",
        ".github/ISSUE_TEMPLATE/feature.md",
        ".claude/skills/run-queue/SKILL.md",
        "scripts/run-queue.ts",
        "scripts/run-queue-rest.ts",
        "scripts/run-queue-rest.test.ts",
        "docs/workflow.md",
        "CLAUDE.md",
        "ARCHITECTURE.md",
      ],
    });
  });

  it("skips the words after JAS-164's paths", () => {
    expect(parseTouches(JAS_164)).toEqual({ files: [".github/workflows/agent-merge.yml", "docs/workflow.md"] });
  });

  // Decision record 0027 and docs/agents/issue-tracker.md write "Touches:".
  it.each(["**Touches.**", "**Touches:**", "Touches:", "**touches.**"])("reads a line that starts with %s", (label) => {
    expect(parseTouches(`${label} \`src/a.ts\``)).toEqual({ files: ["src/a.ts"] });
  });

  it("reads a route path with brackets", () => {
    expect(parseTouches(touching("src/app/player/[region]/[riotId]/actions.ts"))).toEqual({
      files: ["src/app/player/[region]/[riotId]/actions.ts"],
    });
  });

  it("says so when the description has no Touches line", () => {
    expect(parseTouches("**Tier.** Normal.\n\n**Builder.** Claude Code.")).toEqual({
      why: "its description has no **Touches.** line",
    });
  });

  // Like can-merge's fields: with two, the queue can't tell which one is meant.
  it("refuses two Touches lines", () => {
    expect(parseTouches(`${touching("src/a.ts")}\n\n${touching("src/b.ts")}`)).toEqual({
      why: "its description has 2 Touches lines",
    });
  });

  it("refuses a Touches line with no paths in backticks", () => {
    expect(parseTouches("**Touches.** src/a.ts, src/b.ts")).toEqual({ why: "its Touches line names no files in backticks" });
  });

  // Only a line that starts with the label counts, not a sentence that mentions it.
  it("doesn't read a sentence that says touches:", () => {
    expect(parseTouches("This also touches: `src/a.ts`")).toEqual({ why: "its description has no **Touches.** line" });
  });

  // The files on the next line or paragraph would be lost, so the ticket
  // would hold fewer than it changes. Enter in Linear's editor makes a new paragraph.
  it.each([
    ["the next line", "**Touches.** `scripts/a.ts`\n`CLAUDE.md`", "its Touches line runs onto the next line; keep the list on one line"],
    [
      "a paragraph that starts with a path",
      "**Touches.** `scripts/a.ts`\n\n`CLAUDE.md`",
      "the paragraph after its Touches line starts with a path, so the list may go on there; start that paragraph with a word",
    ],
    [
      "a bullet that starts with a path",
      "**Touches.** `scripts/a.ts`\n\n- `CLAUDE.md`",
      "the paragraph after its Touches line starts with a path, so the list may go on there; start that paragraph with a word",
    ],
    [
      "the next paragraph, after a comma",
      "**Touches.** `scripts/a.ts`,\n\n`CLAUDE.md`, `docs/workflow.md`",
      'its Touches line ends with ",", so the list may go on past it; put every path on that line',
    ],
    [
      "a list after a colon",
      "**Touches.** `scripts/a.ts`, and these:\n\n- `CLAUDE.md`\n- `docs/workflow.md`",
      'its Touches line ends with ":", so the list may go on past it; put every path on that line',
    ],
  ])("refuses a Touches list carried on to %s", (_, description, why) => {
    expect(parseTouches(description)).toEqual({ why });
  });

  it.each([
    ["a paragraph that starts with a word", "**Touches.** `scripts/a.ts`\n\nThe Action reads `CLAUDE.md` later."],
    ["a code block", "**Touches.** `scripts/a.ts`\n\n```ts\nconst x = 1;\n```"],
  ])("reads a Touches line followed by %s", (_, description) => {
    expect(parseTouches(description)).toEqual({ files: ["scripts/a.ts"] });
  });

  it("reads a Touches line with another label straight after it", () => {
    expect(parseTouches("**Touches.** `src/a.ts`\n**Builder.** Claude Code.")).toEqual({ files: ["src/a.ts"] });
  });

  it("refuses a Touches line with a backtick that has no partner", () => {
    expect(parseTouches("**Touches.** `src/a.ts`, `src/b.ts")).toEqual({ why: "its Touches line has a backtick with no partner" });
  });

  it("refuses empty backticks", () => {
    expect(parseTouches("**Touches.** `src/a.ts`, ` `")).toEqual({ why: "its Touches line has backticks with nothing in them" });
  });

  // A folder holds everything inside it, so both spellings mean the same.
  it("reads a folder with or without a slash at the end", () => {
    expect(parseTouches(touching("docs/adr/", "docs/agents"))).toEqual({ files: ["docs/adr", "docs/agents"] });
  });

  // Each of these would hold less than the ticket really changes, since a
  // pattern or an odd spelling never equals the path a PR lists.
  it.each([
    ["src/**/*.ts", "is a pattern, not a file"],
    ["src/a?.ts", "is a pattern, not a file"],
    ["src/{a,b}.ts", "isn't a file path"],
    ["src/a.ts:12", "isn't a file path"],
    ["src/a.ts,", "isn't a file path"],
    ["src\\a.ts", "isn't a file path"],
    ["npm run lint", "isn't a file path"],
    ["./src/a.ts", "isn't a plain path from the repo root"],
    ["/src/a.ts", "isn't a plain path from the repo root"],
    ["src/./a.ts", "isn't a plain path from the repo root"],
    ["src/x/../a.ts", "isn't a plain path from the repo root"],
    ["src//a.ts", "isn't a plain path from the repo root"],
  ])("refuses `%s`, which %s", (path, problem) => {
    expect(parseTouches(touching("src/a.ts", path))).toEqual({ why: `\`${path}\` on its Touches line ${problem}` });
  });

  it("reads dotfiles and dot folders", () => {
    expect(parseTouches(touching(".nvmrc", ".github/workflows/ci.yml"))).toEqual({ files: [".nvmrc", ".github/workflows/ci.yml"] });
  });

  // The third is JAS-190's real line, whose output is a Linear document.
  it.each(["None", "none.", "None. The output is a Linear document and new tickets.", "None.", "None. It only writes in Linear, then stops. Nothing else changes."])(
    "reads **Touches.** %s as a ticket that changes no files",
    (line) => {
      expect(parseTouches(`**Touches.** ${line}`)).toEqual({ files: [] });
    },
  );

  // "None yet" and the rest don't say the ticket changes no files.
  it.each(["None yet", "None of the old files", "Nonesuch", "No files", "Nothing"])("can't read **Touches.** %s", (line) => {
    expect(parseTouches(`**Touches.** ${line}`)).toEqual({ why: "its Touches line names no files in backticks" });
  });

  // Each of these once read as no files, so its ticket would hold nothing and
  // start beside a builder changing the file it names or isn't sure about.
  it.each([
    "None (yet)",
    "None - TBD",
    "None, except src/db/schema.ts",
    "None. Actually it edits src/db/schema.ts",
    "None - probably src/lib/riot/client.ts",
    "None (src/db/queries.ts maybe)",
    "None?",
    "None (TBD)",
    "None, not worked out yet",
    "None/unknown",
    "None (it only writes in Linear)",
    "None - it only writes in Linear",
  ])("can't read **Touches.** %s, since only None or None. and a sentence says no files", (line) => {
    expect(parseTouches(`**Touches.** ${line}`)).toEqual({ why: "its Touches line names no files in backticks" });
  });

  it.each([
    ["a path", "None. It only changes docs/runbook"],
    ["a question", "None. Is that right?"],
    ["a file extension", "None. It only changes runbook.md"],
    ["tbd", "None. The rest is TBD."],
    ["yet", "None. Not worked out yet."],
    ["maybe", "None. Maybe later."],
    ["probably", "None. It probably stays in Linear."],
    ["unknown", "None. The rest is unknown."],
    ["except", "None. Nothing changes except the schema."],
  ])("can't read a None. sentence with %s in it", (_, line) => {
    expect(parseTouches(`**Touches.** ${line}`)).toEqual({ why: "its Touches line names no files in backticks" });
  });

  it("reads the paths on a line that says None and names them anyway, since holding them is the safe mistake", () => {
    expect(parseTouches("**Touches.** None. Maybe `src/a.ts`.")).toEqual({ files: ["src/a.ts"] });
  });

  it.each([
    ["**Touches.** None,", 'its Touches line ends with ",", so the list may go on past it; put every path on that line'],
    ["**Touches.** None\n`src/a.ts`", "its Touches line runs onto the next line; keep the list on one line"],
    ["**Touches.** None\n\n`src/a.ts`", "the paragraph after its Touches line starts with a path, so the list may go on there; start that paragraph with a word"],
  ])("refuses a None line whose list may carry on: %j", (description, why) => {
    expect(parseTouches(description)).toEqual({ why });
  });
});

describe("pickTickets: a ticket out of tries", () => {
  it("is two tries, as decision record 0026 says", () => {
    expect(TRIES).toBe(2);
  });

  it("doesn't start, and says why", () => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-1")], outOfTries: ["JAS-1"] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-1")).toEqual([
      "It can't start, because the queue has already tried it 2 times, which is the limit. Deleting one of the queue's start comments on it gives it another try, if Jasper wants one.",
    ]);
  });

  it("takes no slot from the tickets after it", () => {
    const tickets = ["JAS-1", "JAS-2", "JAS-3", "JAS-4", "JAS-5"].map((id) => ticket(id));
    expect(pickTickets(queue({ tickets, outOfTries: ["JAS-1"] })).start).toEqual(["JAS-2", "JAS-3", "JAS-4", "JAS-5"]);
  });

  it("holds no files from the tickets after it", () => {
    const tickets = [ticket("JAS-1", { description: touching("src/shared.ts") }), ticket("JAS-2", { description: touching("src/shared.ts") })];
    expect(pickTickets(queue({ tickets, outOfTries: ["JAS-1"] })).start).toEqual(["JAS-2"]);
  });

  it("doesn't pull its blockers into the queue, since it can't start once they're done", () => {
    const tickets = [ticket("JAS-1", { blockedBy: ["JAS-9"] }), ticket("JAS-9", { status: "Todo", description: `${CRITERIA}\n\n${touching("src/JAS-9.ts")}` })];
    expect(pickTickets(queue({ tickets, outOfTries: ["JAS-1"] })).promote).toEqual([]);
  });

  it("says a builder is running, not that it's out of tries, while one is", () => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-1")], running: ["JAS-1"], outOfTries: ["JAS-1"] }));
    expect(whyWaits(picks, "JAS-1")).toEqual(["A builder is already running on it."]);
  });
});

describe("pickTickets: what can start", () => {
  it("starts a Ready ticket with a Priority, a Touches line and no blockers", () => {
    expect(pickTickets(queue({ tickets: [ticket("JAS-1")] }))).toEqual({ start: ["JAS-1"], promote: [], waits: [] });
  });

  it("starts a Ready ticket that changes no files, and it holds nothing for the tickets after it", () => {
    const tickets = [ticket("JAS-1", { description: "**Touches.** None." }), ticket("JAS-2")];
    expect(pickTickets(queue({ tickets }))).toEqual({ start: ["JAS-1", "JAS-2"], promote: [], waits: [] });
  });

  it("starts tickets beside a running builder whose ticket changes no files", () => {
    const tickets = [ticket("JAS-1", { status: "In Progress", description: "**Touches.** None. The output is a Linear document." }), ticket("JAS-2")];
    expect(pickTickets(queue({ tickets, running: ["JAS-1"] })).start).toEqual(["JAS-2"]);
  });

  it("still starts nothing beside a running builder whose Touches line it can't read", () => {
    const tickets = [ticket("JAS-1", { status: "In Progress", description: "**Touches.** None yet." }), ticket("JAS-2")];
    const picks = pickTickets(queue({ tickets, running: ["JAS-1"] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual([
      "Nothing starts while JAS-1 has a builder running, because its Touches line names no files in backticks, so that builder could be changing any file.",
    ]);
  });

  it("moves a Todo blocker that changes no files to Ready", () => {
    const tickets = [ticket("JAS-1", { blockedBy: ["JAS-9"] }), ticket("JAS-9", { status: "Todo", description: `${CRITERIA}\n\n**Touches.** None.` })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.promote).toEqual([{ id: "JAS-9", priority: "High" }]);
    expect(picks.start).toEqual(["JAS-9"]);
  });

  // Only Ready is the ticket queue, so other tickets don't get a comment either.
  it.each<Status>(["Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled", "Duplicate"])(
    "leaves out a ticket in %s",
    (status) => {
      expect(pickTickets(queue({ tickets: [ticket("JAS-1", { status })] }))).toEqual({ start: [], promote: [], waits: [] });
    },
  );

  it("holds back a ticket with no Priority", () => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-1", { priority: null })] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-1")).toEqual(["It has no Priority."]);
  });

  it("holds back a ticket with no Touches line", () => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-1", { description: "**Tier.** Normal." })] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-1")).toEqual(["It can't start, because its description has no **Touches.** line."]);
  });

  it.each<Status>(["Ready", "In Progress", "In Review"])("holds back a ticket whose blocker is %s", (status) => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status, priority: "Low" })] }));
    expect(picks.start).not.toContain("JAS-2");
    expect(whyWaits(picks, "JAS-2")).toEqual([`It waits for JAS-1, which is ${status}.`]);
  });

  // As in docs/agents/issue-tracker.md: a blocker is finished once it's Done,
  // Canceled or Duplicate.
  it.each<Status>(["Done", "Canceled", "Duplicate"])("starts a ticket whose blocker is %s", (status) => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status })] }));
    expect(picks.start).toEqual(["JAS-2"]);
  });

  it("holds back a ticket whose blocker wasn't read", () => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-2", { blockedBy: ["JAS-1"] })] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual(["It waits for JAS-1, which the queue couldn't read."]);
  });

  it("lists every missing piece at once, so one fix covers them", () => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-2", { priority: null, description: "", blockedBy: ["JAS-1"] })] }));
    expect(whyWaits(picks, "JAS-2")).toEqual([
      "It has no Priority.",
      "It can't start, because its description has no **Touches.** line.",
      "It waits for JAS-1, which the queue couldn't read.",
    ]);
  });
});

describe("pickTickets: the order", () => {
  it("goes Urgent, High, Medium, Low", () => {
    const tickets = [
      ticket("JAS-1", { priority: "Low" }),
      ticket("JAS-2", { priority: "Medium" }),
      ticket("JAS-3", { priority: "Urgent" }),
      ticket("JAS-4", { priority: "High" }),
    ];
    expect(pickTickets(queue({ tickets })).start).toEqual(["JAS-3", "JAS-4", "JAS-2", "JAS-1"]);
  });

  it("takes the oldest first within a Priority", () => {
    const tickets = [
      ticket("JAS-1", { createdAt: "2026-11-03T09:00:00.000Z" }),
      ticket("JAS-2", { createdAt: "2026-10-30T09:00:00.000Z" }),
      ticket("JAS-3", { createdAt: "2026-11-01T09:00:00.000Z" }),
    ];
    expect(pickTickets(queue({ tickets })).start).toEqual(["JAS-2", "JAS-3", "JAS-1"]);
  });

  it("breaks a tie on the date by ticket number, so JAS-9 comes before JAS-10", () => {
    const tickets = [ticket("JAS-10"), ticket("JAS-9")];
    expect(pickTickets(queue({ tickets })).start).toEqual(["JAS-9", "JAS-10"]);
  });

  it("gives the same picks whatever order the tickets arrive in", () => {
    const tickets = [
      ticket("JAS-1", { priority: "Low" }),
      ticket("JAS-2", { priority: "High", description: touching("src/shared.ts") }),
      ticket("JAS-3", { priority: "High", description: touching("src/shared.ts"), createdAt: "2026-10-01T00:00:00.000Z" }),
      ticket("JAS-4"),
      ticket("JAS-5"),
      ticket("JAS-6", { priority: "Urgent" }),
    ];
    const forwards = pickTickets(queue({ tickets }));
    expect(forwards.start).toEqual(["JAS-6", "JAS-3", "JAS-4", "JAS-5"]);
    expect(pickTickets(queue({ tickets: [...tickets].reverse() }))).toEqual(forwards);
  });

  // The Action may compare a reason with the last comment before posting again.
  it("gives the same reasons whatever order the PRs and running builders arrive in", () => {
    const tickets = [
      ticket("JAS-1", { description: touching("src/a.ts", "src/b.ts", "src/c.ts") }),
      ticket("JAS-8", { status: "In Progress", description: touching("src/c.ts") }),
      ticket("JAS-9", { status: "In Progress", description: touching("src/b.ts") }),
    ];
    const openPrs = [
      { number: 271, ticket: null, files: ["src/a.ts"] },
      { number: 270, ticket: null, files: ["src/b.ts"] },
    ];
    const forwards = pickTickets(queue({ tickets, openPrs, running: ["JAS-9", "JAS-8"] }));
    expect(whyWaits(forwards, "JAS-1")).toEqual([
      "It touches `src/b.ts`, which PR 270 changes.",
      "It touches `src/a.ts`, which PR 271 changes.",
      "It touches `src/c.ts`, which JAS-8's builder is changing.",
      "It touches `src/b.ts`, which JAS-9's builder is changing.",
    ]);
    expect(pickTickets(queue({ tickets, openPrs: [...openPrs].reverse(), running: ["JAS-8", "JAS-9"] }))).toEqual(forwards);
  });

  it("considers a ticket listed twice only once", () => {
    expect(pickTickets(queue({ tickets: [ticket("JAS-1"), ticket("JAS-1")] })).start).toEqual(["JAS-1"]);
  });
});

describe("pickTickets: files", () => {
  it("holds back a ticket that touches a file an open PR changes", () => {
    const picks = pickTickets(
      queue({ tickets: [ticket("JAS-1", { description: touching("src/a.ts") })], openPrs: [{ number: 270, ticket: "JAS-9", files: ["src/a.ts"] }] }),
    );
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-1")).toEqual(["It touches `src/a.ts`, which PR 270 changes."]);
  });

  it("holds back a ticket that touches a file a ticket picked this round will change", () => {
    const tickets = [ticket("JAS-1", { description: touching("src/a.ts") }), ticket("JAS-2", { description: touching("src/b.ts", "src/a.ts") })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.start).toEqual(["JAS-1"]);
    expect(whyWaits(picks, "JAS-2")).toEqual(["It touches `src/a.ts`, which JAS-1, picked this round, will change."]);
  });

  // A builder works for minutes before its PR exists (JAS-143's addition to the design).
  it("holds back a ticket that touches a file a running builder's ticket names", () => {
    const tickets = [ticket("JAS-1", { status: "In Progress", description: touching("src/a.ts") }), ticket("JAS-2", { description: touching("src/a.ts") })];
    const picks = pickTickets(queue({ tickets, running: ["JAS-1"] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual(["It touches `src/a.ts`, which JAS-1's builder is changing."]);
  });

  it("names each file and who holds it", () => {
    const tickets = [ticket("JAS-1", { description: touching("src/a.ts", "src/b.ts", "src/c.ts") })];
    const openPrs = [
      { number: 270, ticket: null, files: ["src/a.ts", "src/b.ts"] },
      { number: 271, ticket: null, files: ["src/c.ts"] },
    ];
    expect(whyWaits(pickTickets(queue({ tickets, openPrs })), "JAS-1")).toEqual([
      "It touches `src/a.ts` and `src/b.ts`, which PR 270 changes.",
      "It touches `src/c.ts`, which PR 271 changes.",
    ]);
  });

  it("starts a lower-Priority ticket when a higher one has to wait for a file", () => {
    const tickets = [ticket("JAS-1", { priority: "High", description: touching("src/a.ts") }), ticket("JAS-2", { priority: "Low" })];
    const picks = pickTickets(queue({ tickets, openPrs: [{ number: 270, ticket: null, files: ["src/a.ts"] }] }));
    expect(picks.start).toEqual(["JAS-2"]);
    expect(picks.waits.map((wait) => wait.id)).toEqual(["JAS-1"]);
  });

  it("holds JAS-146 back while JAS-143's builder runs, since both change scripts/risky-paths.ts", () => {
    const tickets = [
      ticket("JAS-143", { status: "In Progress", priority: "High", description: JAS_143 }),
      ticket("JAS-146", { status: "Ready", priority: "Medium", description: JAS_146 }),
      ticket("JAS-144", { status: "Ready", priority: "High", description: JAS_144, blockedBy: ["JAS-143"] }),
    ];
    const picks = pickTickets(queue({ tickets, running: ["JAS-143"] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-144")).toEqual(["It waits for JAS-143, which has a builder running."]);
    expect(whyWaits(picks, "JAS-146")).toEqual([
      "It touches `scripts/risky-paths.ts` and `scripts/risky-paths.test.ts`, which JAS-143's builder is changing.",
    ]);
  });

  // Windows ignores case, as in scripts/risky-paths.ts.
  it("compares paths ignoring case", () => {
    const picks = pickTickets(
      queue({ tickets: [ticket("JAS-1", { description: touching("src/DB/schema.ts") })], openPrs: [{ number: 270, ticket: null, files: ["src/db/schema.ts"] }] }),
    );
    expect(picks.start).toEqual([]);
  });

  // JAS-144's real Touches line names CLAUDE.md and ARCHITECTURE.md.
  it("compares a running builder's files ignoring case too", () => {
    const tickets = [ticket("JAS-1", { status: "In Progress", description: touching("CLAUDE.md") }), ticket("JAS-2", { description: touching("CLAUDE.md") })];
    expect(pickTickets(queue({ tickets, running: ["JAS-1"] })).start).toEqual([]);
  });

  // A folder written without a slash can't be told from a file, so it holds
  // everything inside it rather than nothing.
  it("treats a path as holding everything inside it", () => {
    const openPrs = [{ number: 270, ticket: null, files: ["src/lib/analyzer/ganks.ts"] }];
    const picks = pickTickets(queue({ tickets: [ticket("JAS-1", { description: touching("src/lib/analyzer") })], openPrs }));
    expect(whyWaits(picks, "JAS-1")).toEqual(["It touches `src/lib/analyzer`, which PR 270 changes."]);

    const tickets = [ticket("JAS-1", { status: "In Progress", description: touching("src/lib") }), ticket("JAS-2", { description: touching("src/lib/x.ts") })];
    expect(pickTickets(queue({ tickets, running: ["JAS-1"] })).start).toEqual([]);
  });

  it("doesn't treat src/lib/analyzer.ts as inside src/lib/analyzer", () => {
    const openPrs = [{ number: 270, ticket: null, files: ["src/lib/analyzer.ts"] }];
    expect(pickTickets(queue({ tickets: [ticket("JAS-1", { description: touching("src/lib/analyzer") })], openPrs })).start).toEqual(["JAS-1"]);
  });

  // A ticket that JAS-145 puts back on the queue continues on its own PR.
  it("doesn't hold a ticket back for the files of its own PR", () => {
    const picks = pickTickets(
      queue({ tickets: [ticket("JAS-1", { description: touching("src/a.ts") })], openPrs: [{ number: 270, ticket: "JAS-1", files: ["src/a.ts"] }] }),
    );
    expect(picks.start).toEqual(["JAS-1"]);
  });

  it("doesn't start a second builder on a ticket that has one running", () => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-1")], running: ["JAS-1"] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-1")).toEqual(["A builder is already running on it."]);
  });

  // Its builder could be changing any file, so nothing is safe to start.
  it("starts nothing while a running builder's ticket has no readable Touches line", () => {
    const tickets = [ticket("JAS-1", { status: "In Progress", description: "**Tier.** Tiny." }), ticket("JAS-2")];
    const picks = pickTickets(queue({ tickets, running: ["JAS-1"] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual([
      "Nothing starts while JAS-1 has a builder running, because its description has no **Touches.** line, so that builder could be changing any file.",
    ]);
  });

  it("starts nothing while a running builder's ticket wasn't read", () => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-2")], running: ["JAS-1"] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual([
      "Nothing starts while JAS-1 has a builder running, because the queue couldn't read it, so that builder could be changing any file.",
    ]);
  });

  // Both, so fixing one doesn't reveal the other in a later comment.
  it("lists Vercel too when a running builder's ticket wasn't read", () => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-2")], running: ["JAS-1"], vercelRefusing: true }));
    expect(whyWaits(picks, "JAS-2")).toEqual([
      "Nothing starts while JAS-1 has a builder running, because the queue couldn't read it, so that builder could be changing any file.",
      "Vercel is refusing deploys, so nothing starts.",
    ]);
  });
});

describe("pickTickets: the ceiling", () => {
  it("is 4", () => {
    expect(CEILING).toBe(4);
  });

  it("stops at the ceiling", () => {
    const tickets = ["JAS-1", "JAS-2", "JAS-3", "JAS-4", "JAS-5", "JAS-6"].map((id) => ticket(id));
    const picks = pickTickets(queue({ tickets }));
    expect(picks.start).toEqual(["JAS-1", "JAS-2", "JAS-3", "JAS-4"]);
    expect(whyWaits(picks, "JAS-5")).toEqual(["4 builders are running or starting, and the ceiling is 4."]);
    expect(whyWaits(picks, "JAS-6")).toEqual(["4 builders are running or starting, and the ceiling is 4."]);
  });

  it("counts running builders toward it", () => {
    const running = ["JAS-11", "JAS-12", "JAS-13"].map((id) => ticket(id, { status: "In Progress" }));
    const tickets = [...running, ticket("JAS-1"), ticket("JAS-2")];
    const picks = pickTickets(queue({ tickets, running: ["JAS-11", "JAS-12", "JAS-13"] }));
    expect(picks.start).toEqual(["JAS-1"]);
    expect(whyWaits(picks, "JAS-2")).toEqual(["4 builders are running or starting, and the ceiling is 4."]);
  });

  it("starts nothing with 4 builders running", () => {
    const running = ["JAS-11", "JAS-12", "JAS-13", "JAS-14"];
    const tickets = [...running.map((id) => ticket(id, { status: "In Progress" })), ticket("JAS-1")];
    expect(pickTickets(queue({ tickets, running })).start).toEqual([]);
  });

  // A builder started by hand can put the count over the ceiling.
  it("says how many are running when that's over the ceiling", () => {
    const running = ["JAS-11", "JAS-12", "JAS-13", "JAS-14", "JAS-15"];
    const tickets = [...running.map((id) => ticket(id, { status: "In Progress" })), ticket("JAS-1")];
    expect(whyWaits(pickTickets(queue({ tickets, running })), "JAS-1")).toEqual(["5 builders are running or starting, and the ceiling is 4."]);
  });

  // No builder is running on it, but its files stay held until Jasper merges it.
  it("gives no slot to a finished PR only Jasper can merge, but keeps its files held", () => {
    const tickets = [
      ticket("JAS-1", { description: touching("scripts/risky-paths.ts") }),
      ...["JAS-2", "JAS-3", "JAS-4", "JAS-5"].map((id) => ticket(id)),
    ];
    const openPrs = [{ number: 270, ticket: "JAS-9", files: ["scripts/risky-paths.ts"] }];
    const picks = pickTickets(queue({ tickets, openPrs }));
    expect(picks.start).toEqual(["JAS-2", "JAS-3", "JAS-4", "JAS-5"]);
    expect(whyWaits(picks, "JAS-1")).toEqual(["It touches `scripts/risky-paths.ts`, which PR 270 changes."]);
  });

  // So a ceiling reason always means the ticket would start with a free slot.
  it("names a file clash before the ceiling", () => {
    const tickets = [...["JAS-1", "JAS-2", "JAS-3", "JAS-4"].map((id) => ticket(id)), ticket("JAS-5", { description: touching("src/JAS-1.ts") })];
    expect(whyWaits(pickTickets(queue({ tickets })), "JAS-5")).toEqual(["It touches `src/JAS-1.ts`, which JAS-1, picked this round, will change."]);
  });
});

describe("pickTickets: blockers", () => {
  it("moves a Todo blocker to Ready, rates it High, and starts it in the same round", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo", priority: "Low" })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.start).toEqual(["JAS-1"]);
    expect(picks.promote).toEqual([{ id: "JAS-1", priority: "High" }]);
    expect(whyWaits(picks, "JAS-2")).toEqual(["It waits for JAS-1, which moves to Ready now."]);
  });

  // Jasper's Priority rule (JAS-29): a ticket that blocks others is High.
  it("rates a Ready blocker High, so it goes before Medium work", () => {
    const tickets = [
      ticket("JAS-50", { priority: "Urgent", blockedBy: ["JAS-51"] }),
      ticket("JAS-51", { priority: "Low" }),
      ...["JAS-1", "JAS-2", "JAS-3", "JAS-4"].map((id) => ticket(id)),
    ];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.promote).toEqual([{ id: "JAS-51", priority: "High" }]);
    expect(picks.start).toEqual(["JAS-51", "JAS-1", "JAS-2", "JAS-3"]);
    expect(whyWaits(picks, "JAS-50")).toEqual(["It waits for JAS-51, which is Ready."]);
  });

  it("leaves a Ready blocker that's already High as it is", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { priority: "High" })];
    expect(pickTickets(queue({ tickets })).promote).toEqual([]);
  });

  // So a ticket nobody can start yet doesn't pull work into the queue.
  it.each<[string, Partial<Ticket>, string]>([
    ["no Priority", { priority: null }, "It has no Priority."],
    ["no Touches line", { description: CRITERIA }, "It can't start, because its description has no **Touches.** line."],
    ["sub-tickets", { hasSubTickets: true }, "It can't start, because it has sub-tickets, so it's a plan that no PR builds."],
  ])("moves no blocker for a ticket that can't start, here for %s", (_, overrides, own) => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"], ...overrides }), ticket("JAS-1", { status: "Todo" })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.promote).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual([own, "It waits for JAS-1, which is Todo."]);
  });

  // The Priority it gets as it moves counts, so the chain goes on past it.
  it("moves a chain past a Todo blocker that had no Priority", () => {
    const tickets = [
      ticket("JAS-3", { blockedBy: ["JAS-2"] }),
      ticket("JAS-2", { status: "Todo", priority: null, blockedBy: ["JAS-1"] }),
      ticket("JAS-1", { status: "Todo" }),
    ];
    expect(pickTickets(queue({ tickets })).promote.map((moved) => moved.id)).toEqual(["JAS-2", "JAS-1"]);
  });

  // Two Todo tickets that block each other mustn't loop forever.
  it("ends on two Todo blockers that block each other, and starts neither", () => {
    const tickets = [
      ticket("JAS-3", { blockedBy: ["JAS-1"] }),
      ticket("JAS-1", { status: "Todo", blockedBy: ["JAS-2"] }),
      ticket("JAS-2", { status: "Todo", blockedBy: ["JAS-1"] }),
    ];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-1")).toEqual(["It waits for JAS-2, which moves to Ready now."]);
    expect(whyWaits(picks, "JAS-2")).toEqual(["It waits for JAS-1, which moves to Ready now."]);
  });

  it("moves a chain of Todo blockers in one round and starts the first", () => {
    const tickets = [
      ticket("JAS-3", { blockedBy: ["JAS-2"] }),
      ticket("JAS-2", { status: "Todo", blockedBy: ["JAS-1"] }),
      ticket("JAS-1", { status: "Todo" }),
    ];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.promote).toEqual([
      { id: "JAS-2", priority: "High" },
      { id: "JAS-1", priority: "High" },
    ]);
    expect(picks.start).toEqual(["JAS-1"]);
    expect(whyWaits(picks, "JAS-2")).toEqual(["It waits for JAS-1, which moves to Ready now."]);
    expect(whyWaits(picks, "JAS-3")).toEqual(["It waits for JAS-2, which moves to Ready now."]);
  });

  it("moves a blocker but doesn't start it while its own blocker wasn't read", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo", blockedBy: ["JAS-0"] })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-1")).toEqual(["It waits for JAS-0, which the queue couldn't read."]);
  });

  it("gives one reason for a blocker listed twice", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1", "JAS-1"] }), ticket("JAS-1", { status: "In Review" })];
    expect(whyWaits(pickTickets(queue({ tickets })), "JAS-2")).toEqual(["It waits for JAS-1, which is In Review."]);
  });

  it("keeps an Urgent blocker Urgent", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo", priority: "Urgent" })];
    expect(pickTickets(queue({ tickets })).promote).toEqual([{ id: "JAS-1", priority: "Urgent" }]);
  });

  it("rates a Todo blocker with no Priority High", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo", priority: null })];
    expect(pickTickets(queue({ tickets })).promote).toEqual([{ id: "JAS-1", priority: "High" }]);
  });

  it("moves a Backlog blocker that has a Priority and a Touches line", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Backlog", priority: "Medium" })];
    expect(pickTickets(queue({ tickets })).promote).toEqual([{ id: "JAS-1", priority: "High" }]);
  });

  it.each([
    [{ priority: null }, "it has no Priority"],
    [{ description: CRITERIA }, "its description has no **Touches.** line"],
    [{ description: touching("src/JAS-1.ts") }, "it has no Acceptance criteria section"],
    [
      { priority: null, description: "An idea." },
      "it has no Priority, it has no Acceptance criteria section and its description has no **Touches.** line",
    ],
  ])("makes the ticket wait for a Backlog blocker that isn't written up, saying what's missing (%o)", (blocker, missing) => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Backlog", ...blocker })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.promote).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual([`It waits for JAS-1, which can't move to Ready, because ${missing}.`]);
  });

  // Decision record 0027: a ticket needs a Touches line to move to Ready.
  it("doesn't move a Todo blocker with no Touches line", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo", description: `${CRITERIA}\n\n**Tier.** Normal.` })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.promote).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual([
      "It waits for JAS-1, which can't move to Ready, because its description has no **Touches.** line.",
    ]);
  });

  // Decision record 0027: and the Feature or fix sections, read here as its Acceptance criteria.
  it("doesn't move a Todo blocker with no Acceptance criteria section", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo", description: touching("src/JAS-1.ts") })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.promote).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual(["It waits for JAS-1, which can't move to Ready, because it has no Acceptance criteria section."]);
  });

  // A real ticket starts with **Player problem.**, so the label is found on any line.
  it.each(["## Acceptance criteria", "**Acceptance criteria.**", "**Acceptance criteria:**", "Acceptance criteria:"])(
    "reads an Acceptance criteria section labelled %s",
    (label) => {
      const description = `**Player problem.** None.\n\n${label}\n\n- [ ] It works.\n\n${touching("src/JAS-1.ts")}`;
      const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo", description })];
      expect(pickTickets(queue({ tickets })).promote).toEqual([{ id: "JAS-1", priority: "High" }]);
    },
  );

  // Only a line that starts with the label counts, not a sentence that mentions it.
  it("doesn't count a sentence that mentions acceptance criteria", () => {
    const description = `**Player problem.** None. The acceptance criteria: to be written.\n\n${touching("src/JAS-1.ts")}`;
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo", description })];
    expect(pickTickets(queue({ tickets })).promote).toEqual([]);
  });

  // Jasper's own two kinds are about who moves a ticket, so one he put in Ready himself starts.
  it("starts a Postmortem: ticket Jasper moved to Ready himself", () => {
    const tickets = [ticket("JAS-1", { title: "Postmortem: Merge Danger lines rated lower than the diff" })];
    expect(pickTickets(queue({ tickets })).start).toEqual(["JAS-1"]);
  });

  // No PR builds these, and a builder's branch would close the ticket on merge.
  it.each<[string, Partial<Ticket>, string]>([
    ["a wayfinder ticket", { labels: ["wayfinder:map"] }, "it's a wayfinder ticket, which no PR builds"],
    ["a parent ticket", { hasSubTickets: true }, "it has sub-tickets, so it's a plan that no PR builds"],
  ])("doesn't start %s that reached Ready", (_, overrides, why) => {
    const picks = pickTickets(queue({ tickets: [ticket("JAS-1", overrides)] }));
    expect(picks.start).toEqual([]);
    expect(whyWaits(picks, "JAS-1")).toEqual([`It can't start, because ${why}.`]);
  });

  // Decision record 0027 keeps these for Jasper, and the queue moves tickets as Claude Code.
  it.each<[string, Partial<Ticket>, string]>([
    ["a Postmortem: ticket", { title: "Postmortem: Tier line's reason names a second tier word" }, "only Jasper moves Postmortem: and Wellness: tickets"],
    ["a Wellness: ticket", { title: "Wellness: remove two unused variables" }, "only Jasper moves Postmortem: and Wellness: tickets"],
    ["a ticket assigned to Jasper", { assignedToJasper: true }, "it's assigned to Jasper, so only he moves it"],
  ])("doesn't move %s", (_, blocker, why) => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo", ...blocker })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.promote).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual([`It waits for JAS-1, which can't move to Ready, because ${why}.`]);
  });

  // No PR builds these, wherever they sit, so they're neither moved nor rated up.
  it.each<[string, Status, Partial<Ticket>, string]>([
    ["a wayfinder ticket in Todo", "Todo", { labels: ["wayfinder:task"] }, "it's a wayfinder ticket, which no PR builds"],
    ["a parent ticket in Todo", "Todo", { hasSubTickets: true }, "it has sub-tickets, so it's a plan that no PR builds"],
    ["a wayfinder map in Ready", "Ready", { labels: ["wayfinder:map"], priority: "Low" }, "it's a wayfinder ticket, which no PR builds"],
    ["a parent ticket in Ready", "Ready", { hasSubTickets: true, priority: "Low" }, "it has sub-tickets, so it's a plan that no PR builds"],
  ])("neither moves nor rates up %s", (_, status, blocker, why) => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status, ...blocker })];
    const picks = pickTickets(queue({ tickets }));
    expect(picks.promote).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual([`It waits for JAS-1, which won't be built, because ${why}.`]);
  });

  it("moves a blocker two tickets share once", () => {
    const tickets = [
      ticket("JAS-2", { blockedBy: ["JAS-1"] }),
      ticket("JAS-3", { blockedBy: ["JAS-1"] }),
      ticket("JAS-1", { status: "Todo" }),
    ];
    expect(pickTickets(queue({ tickets })).promote).toEqual([{ id: "JAS-1", priority: "High" }]);
  });

  // A builder can take a Todo ticket when Jasper asks.
  it("doesn't move a blocker that has a builder running", () => {
    const tickets = [ticket("JAS-2", { blockedBy: ["JAS-1"] }), ticket("JAS-1", { status: "Todo" })];
    const picks = pickTickets(queue({ tickets, running: ["JAS-1"] }));
    expect(picks.promote).toEqual([]);
    expect(whyWaits(picks, "JAS-2")).toEqual(["It waits for JAS-1, which has a builder running."]);
  });
});

describe("pickTickets: Vercel", () => {
  it("starts nothing while Vercel is refusing deploys, but still moves blockers", () => {
    const tickets = [ticket("JAS-1"), ticket("JAS-3", { blockedBy: ["JAS-2"] }), ticket("JAS-2", { status: "Todo" })];
    const picks = pickTickets(queue({ tickets, vercelRefusing: true }));
    expect(picks.start).toEqual([]);
    expect(picks.promote).toEqual([{ id: "JAS-2", priority: "High" }]);
    expect(whyWaits(picks, "JAS-1")).toEqual(["Vercel is refusing deploys, so nothing starts."]);
    expect(whyWaits(picks, "JAS-3")).toEqual(["It waits for JAS-2, which moves to Ready now."]);
  });
});

// Jasper's examples from JAS-29, 2026-11-01.
describe("pickTickets: Jasper's three examples", () => {
  // Twenty tickets in four groups of five, oldest first by number; each
  // group's tickets all change one shared file.
  const twenty = Array.from({ length: 20 }, (_, i) =>
    ticket(`JAS-${i + 1}`, {
      createdAt: new Date(Date.UTC(2026, 10, 1, i)).toISOString(),
      description: touching(`src/shared-${i % 4}.ts`),
    }),
  );

  it("starts 4 of four separate tickets with 16 clashing", () => {
    const picks = pickTickets(queue({ tickets: twenty }));
    expect(picks.start).toEqual(["JAS-1", "JAS-2", "JAS-3", "JAS-4"]);
    expect(picks.waits).toHaveLength(16);
    for (const wait of picks.waits) expect(wait.why[0]).toMatch(/^It touches `src\/shared-\d\.ts`, which JAS-[1-4], picked this round, will change\.$/);
  });

  // The files decide, not the ceiling: here slots are left over.
  it("starts 2 of ten tickets that share two files, with 2 slots free", () => {
    const ten = twenty.slice(0, 10).map((t, i) => ({ ...t, description: touching(`src/shared-${i % 2}.ts`) }));
    const picks = pickTickets(queue({ tickets: ten }));
    expect(picks.start).toEqual(["JAS-1", "JAS-2"]);
    expect(picks.waits).toHaveLength(8);
  });

  it("starts a prerequisite that's still in Todo in the same round", () => {
    const prerequisite = ticket("JAS-1", { status: "Todo", priority: "Low" });
    const nine = Array.from({ length: 9 }, (_, i) => ticket(`JAS-${i + 2}`, { blockedBy: ["JAS-1"] }));
    const picks = pickTickets(queue({ tickets: [prerequisite, ...nine] }));
    expect(picks.promote).toEqual([{ id: "JAS-1", priority: "High" }]);
    expect(picks.start).toEqual(["JAS-1"]);
  });

  it("starts 1 prerequisite with nine waiting, then the nine after it merges, 4 at a time", () => {
    const prerequisite = ticket("JAS-1", { priority: "High" });
    const nine = Array.from({ length: 9 }, (_, i) => ticket(`JAS-${i + 2}`, { blockedBy: ["JAS-1"] }));
    let tickets = [prerequisite, ...nine];

    const first = pickTickets(queue({ tickets }));
    expect(first.start).toEqual(["JAS-1"]);
    expect(first.waits.map((wait) => wait.why)).toEqual(nine.map(() => ["It waits for JAS-1, which is Ready."]));

    tickets = tickets.map((t): Ticket => (t.id === "JAS-1" ? { ...t, status: "In Progress" } : t));
    expect(pickTickets(queue({ tickets, running: ["JAS-1"] })).start).toEqual([]);

    tickets = merged(tickets, ["JAS-1"]);
    const afterMerge = pickTickets(queue({ tickets }));
    expect(afterMerge.start).toEqual(["JAS-2", "JAS-3", "JAS-4", "JAS-5"]);

    tickets = merged(tickets, afterMerge.start);
    const next = pickTickets(queue({ tickets }));
    expect(next.start).toEqual(["JAS-6", "JAS-7", "JAS-8", "JAS-9"]);

    tickets = merged(tickets, next.start);
    expect(pickTickets(queue({ tickets })).start).toEqual(["JAS-10"]);
  });

  it("starts 0 while Vercel is refusing", () => {
    const picks = pickTickets(queue({ tickets: twenty, vercelRefusing: true }));
    expect(picks.start).toEqual([]);
    expect(picks.waits).toHaveLength(20);
  });
});
