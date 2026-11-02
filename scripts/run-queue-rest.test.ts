import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { OpenPull } from "./can-merge-action-steps";
import {
  COMMENT_CREATE,
  COMMENTS_QUERY,
  CommitStatus,
  fireAnswer,
  fireRequest,
  ISSUE_MOVE,
  ISSUE_RATE,
  ISSUES_QUERY,
  LinearIssue,
  linearWrites,
  planRound,
  QUEUE_QUERY,
  readSnapshot,
  REFUSED_LINE,
  runRound,
  runningTickets,
  START_LINE,
  STATES_QUERY,
  ticketOfBranch,
  toOpenPrs,
  toTicket,
  vercelState,
  WAIT_LINE,
  WAITED_LINE,
  type Effects,
  type FireAnswer,
  type LinearCall,
  type LinearComment,
  type Plan,
  type Snapshot,
} from "./run-queue-rest";

const REPO = "Jaspyplayz/League-Web-App";
const JASPER = "00000000-0000-4000-8000-00000000000a";
const RUN = "https://github.com/Jaspyplayz/League-Web-App/actions/runs/1";
const AT_0630 = new Date("2026-11-02T06:30:00Z");
const AT_0730 = new Date("2026-11-02T07:30:00Z");
const HEAD = "4d2a4fefeaef178f0565d274999c22b752383437";

// A Windows checkout ends lines with \r\n, and the patterns below match \n,
// so read every file the way CI on Linux sees it.
function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

const saved = (name: string): unknown => JSON.parse(source(`scripts/run-queue-fixtures/${name}`));

// A workflow's lines without blank lines or comments, so a test pins what runs.
function workflowLines(path: string): string[] {
  return source(path)
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
    .map((line) => line.replace(/\s+#.*$/, ""));
}

const uuidOf = (id: string) => `uuid-${id}`;
const writtenUp = (id: string) => `**Acceptance criteria**\n\n- [ ] It works.\n\n**Touches.** \`src/${id}.ts\``;

type IssueInput = {
  status?: string;
  priority?: number;
  description?: string | null;
  blockedBy?: string[];
  project?: string | null;
  assignee?: string;
  subTickets?: number;
  createdAt?: string;
};

// A ticket in the shape Linear's GraphQL API answers, run through the same
// parsing as a real answer. By default it's Ready, Medium, written up, and
// touches a file of its own.
function issue(id: string, input: IssueInput = {}): LinearIssue {
  return LinearIssue.parse({
    id: uuidOf(id),
    identifier: id,
    title: `Ticket ${id}`,
    description: input.description === undefined ? writtenUp(id) : input.description,
    createdAt: input.createdAt ?? "2026-11-01T12:00:00.000Z",
    priority: input.priority ?? 3,
    state: { name: input.status ?? "Ready" },
    project: input.project === null ? null : { name: input.project ?? "Turnpoint" },
    assignee: input.assignee ? { id: input.assignee } : null,
    labels: { pageInfo: { hasNextPage: false }, nodes: [] },
    children: { nodes: Array.from({ length: input.subTickets ?? 0 }, (_, i) => ({ id: `child-${i}` })) },
    inverseRelations: {
      pageInfo: { hasNextPage: false },
      nodes: (input.blockedBy ?? []).map((blocker) => ({ type: "blocks", issue: { id: uuidOf(blocker), identifier: blocker } })),
    },
  });
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return { viewerId: JASPER, readyStateId: "ready-state", issues: [], comments: {}, pulls: [], files: {}, statuses: [], ...overrides };
}

function comment(id: string, body: string, createdAt: string): LinearComment {
  return { id, body, createdAt };
}

function pull(number: number, ref: string, body: string | null = "**Ready to merge:** no"): OpenPull {
  return { number, body, head: { ref, sha: HEAD, repo: { full_name: REPO } } };
}

function vercel(state: string, description: string, updatedAt: string): CommitStatus {
  return { context: "Vercel", state, description, updated_at: updatedAt };
}
const refusal = (updatedAt: string) => vercel("failure", "Deployment rate limited — retry in 24 hours.", updatedAt);

// Effects that record what reached Linear and the cloud task, in order.
function recorder(fire: (id: string) => FireAnswer = (id) => ({ kind: "started", sessionUrl: `https://claude.ai/code/session_${id}` })) {
  const calls: string[] = [];
  const lines: string[] = [];
  let comments = 0;
  const effects: Effects = {
    promote: async (uuid, priority, moveToReady) => void calls.push(`promote ${uuid} ${priority}${moveToReady ? " to Ready" : ""}`),
    createComment: async (uuid, body) => {
      calls.push(`createComment ${uuid}: ${body.split("\n")[0]}`);
      return `comment-${++comments}`;
    },
    updateComment: async (id, body) => void calls.push(`updateComment ${id}: ${body.split("\n")[0]}`),
    fire: async (id) => {
      calls.push(`fire ${id}`);
      return fire(id);
    },
    log: (line) => lines.push(line),
    summary: (line) => lines.push(line),
  };
  return { effects, calls, lines };
}

// Effects for a dry run: anything but a log line fails the test.
function dryEffects() {
  const lines: string[] = [];
  const refuse = (): never => {
    throw new Error("a dry run reached Linear or the cloud task");
  };
  const effects: Effects = { promote: refuse, createComment: refuse, updateComment: refuse, fire: refuse, log: (line) => lines.push(line), summary: (line) => lines.push(line) };
  return { effects, lines };
}

// Effects that keep each ticket's comments the way Linear does, so a test
// can run one round after another. The cloud task gives the answers given,
// then starts every builder.
function linearStore(clock: () => Date, answers: FireAnswer[] = []) {
  const comments: Record<string, LinearComment[]> = {};
  const fired: string[] = [];
  let made = 0;
  const effects: Effects = {
    promote: async () => {},
    createComment: async (uuid, body) => {
      const id = `c${++made}`;
      (comments[uuid] ??= []).push({ id, body, createdAt: clock().toISOString() });
      return id;
    },
    updateComment: async (id, body) => {
      const found = Object.values(comments).flat().find((posted) => posted.id === id);
      if (!found) throw new Error(`the test's Linear has no comment ${id}`);
      found.body = body;
    },
    fire: async (id) => {
      fired.push(id);
      return answers.shift() ?? { kind: "started", sessionUrl: `https://claude.ai/code/session_${id}` };
    },
    log: () => {},
    summary: () => {},
  };
  const read = (issues: LinearIssue[], extra: Partial<Snapshot> = {}) =>
    snapshot({
      issues,
      comments: Object.fromEntries(issues.map((ticket) => [ticket.identifier, (comments[ticket.id] ?? []).map((posted) => ({ ...posted }))])),
      ...extra,
    });
  const all = () => Object.values(comments).flat();
  return { effects, fired, read, all };
}

// Linear's answers to the queue's reads, from the tickets given. Blockers
// come back only from the by-ID query, as they do from Linear, and each
// answer holds no more tickets than the query's `first` asks for.
function fakeLinear(queue: unknown[], { blockers = [], comments = {} }: { blockers?: LinearIssue[]; comments?: Record<string, LinearComment[]> } = {}) {
  const asked: string[] = [];
  const call: LinearCall = async (query, variables) => {
    const first = Number(query.match(/issues\(first: (\d+)/)?.[1]);
    if (query === QUEUE_QUERY) {
      const after = variables.after as string | null;
      asked.push(after ? `Queue after ${after}` : "Queue");
      const start = Number(after ?? 0);
      const more = start + first < queue.length;
      return {
        data: {
          viewer: { id: JASPER },
          issues: { pageInfo: { hasNextPage: more, endCursor: more ? String(start + first) : null }, nodes: queue.slice(start, start + first) },
        },
      };
    }
    if (query === ISSUES_QUERY) {
      const ids = variables.ids as string[];
      asked.push(`Issues ${ids.join(" ")}`);
      return { data: { issues: { nodes: blockers.filter((blocker) => ids.includes(blocker.id)).slice(0, first) } } };
    }
    if (query === COMMENTS_QUERY) {
      const nodes = comments[variables.id as string] ?? [];
      return { data: { issue: { comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } };
    }
    if (query === STATES_QUERY) {
      return { data: { teams: { nodes: [{ states: { nodes: [{ id: "todo-state", name: "Todo" }, { id: "ready-state", name: "Ready" }] } }] } } };
    }
    throw new Error("the test's Linear has no answer for that query");
  };
  return { call, asked };
}

// GitHub's saved answers from 06:23 UTC on 2026-11-02, each wrapped as one
// page, the way `gh api --paginate --slurp` gives them.
const savedStatuses = saved("statuses-2026-11-02.json") as Record<string, { sha: string; status: unknown }>;
function savedGitHub(path: string): unknown {
  if (path === `repos/${REPO}/pulls?state=open&per_page=100`) return [saved("pulls-open.json")];
  const files = path.match(/^repos\/[^/]+\/[^/]+\/pulls\/(\d+)\/files\?per_page=100$/);
  if (files) return [saved(`files-${files[1]}.json`)];
  if (path === `repos/${REPO}/commits/main`) return [{ sha: savedStatuses.main.sha }];
  const sha = path.match(/^repos\/[^/]+\/[^/]+\/commits\/([0-9a-f]{40})\/status\?per_page=100$/)?.[1];
  const status = Object.values(savedStatuses).find((entry) => entry.sha === sha);
  if (status) return [status.status];
  throw new Error(`no saved GitHub answer for ${path}`);
}

// GitHub with no open PRs, for tests about Linear.
function quietGitHub(path: string): unknown {
  if (path.endsWith("/commits/main")) return [{ sha: HEAD }];
  if (path.includes("/status")) return [{ statuses: [] }];
  return [[]];
}

async function todaysSnapshot(): Promise<Snapshot> {
  const queue = saved("linear-queue.json") as { data: { issues: { nodes: unknown[] } } };
  return readSnapshot(REPO, fakeLinear(queue.data.issues.nodes).call, savedGitHub);
}

const allStatuses = () => Object.values(savedStatuses).flatMap((entry) => CommitStatus.array().parse((entry.status as { statuses: unknown }).statuses));

describe("the saved answers from 2026-11-02", () => {
  it("map each open PR to the ticket its branch builds, with its files", () => {
    const pulls = saved("pulls-open.json") as OpenPull[];
    const files = Object.fromEntries(pulls.map((p) => [p.number, saved(`files-${p.number}.json`)])) as Parameters<typeof toOpenPrs>[1];
    const prs = toOpenPrs(pulls, files);
    expect(prs.map((pr) => [pr.number, pr.ticket])).toEqual([
      [295, "JAS-40"],
      [294, "JAS-43"],
      [293, "JAS-200"],
      [291, "JAS-159"],
      [287, "JAS-136"],
      [283, "JAS-39"],
      [276, "JAS-146"],
    ]);
    expect(prs.find((pr) => pr.number === 291)?.files).toEqual([
      "docs/adr/0030-rate-limit-checks-run-in-batches.md",
      "src/lib/riot/rate-limit-store.test.ts",
      "src/lib/riot/rate-limit-store.ts",
    ]);
  });

  it("say Vercel is refusing at 06:30 UTC, and is ready for one test at 07:30", () => {
    expect(vercelState(allStatuses(), AT_0630)).toEqual({ kind: "refusing", since: "2026-11-02T06:20:43Z" });
    expect(vercelState(allStatuses(), AT_0730)).toEqual({ kind: "testing", since: "2026-11-02T06:20:43Z" });
  });

  it("count the six tickets with a builder working, and say why for each", async () => {
    expect(runningTickets(await todaysSnapshot(), AT_0630)).toEqual([
      { id: "JAS-40", why: "it's In Review, and PR 295 isn't marked ready or left for Jasper" },
      { id: "JAS-43", why: "it's In Review, and PR 294 isn't marked ready or left for Jasper" },
      { id: "JAS-136", why: "it's In Review, and PR 287 isn't marked ready or left for Jasper" },
      { id: "JAS-144", why: "it's In Progress" },
      { id: "JAS-165", why: "it's In Progress" },
      { id: "JAS-190", why: "it's In Progress" },
    ]);
  });

  it("leave out a stranger's PR from a fork, even on a builder's branch name", async () => {
    const fork = { number: 999, body: "**Ready to merge:** no", head: { ref: "claude/jas-901-x", sha: "f".repeat(40), repo: { full_name: "stranger/League-Web-App" } } };
    const deletedFork = { ...fork, number: 998, head: { ...fork.head, repo: null } };
    const github = (path: string): unknown => {
      if (path === `repos/${REPO}/pulls?state=open&per_page=100`) return [[...(saved("pulls-open.json") as unknown[]), fork, deletedFork]];
      if (/\/pulls\/99[89]\/files/.test(path)) return [[{ filename: "src/JAS-901.ts" }]];
      if (path.includes(fork.head.sha)) return [{ statuses: [] }];
      return savedGitHub(path);
    };
    const queue = (saved("linear-queue.json") as { data: { issues: { nodes: unknown[] } } }).data.issues.nodes;
    const read = await readSnapshot(REPO, fakeLinear([...queue, issue("JAS-901", { status: "In Review" })]).call, github);
    expect(read.pulls.map((pull) => pull.number)).toEqual([295, 294, 293, 291, 287, 283, 276]);
    expect(runningTickets(read, AT_0630).map((ticket) => ticket.id)).not.toContain("JAS-901");
  });

  it("give a dry run at 06:30 that starts nothing and says why", async () => {
    const plan = planRound(await todaysSnapshot(), AT_0630, RUN);
    expect(plan.start).toEqual([]);
    expect(plan.promote).toEqual([]);
    const { effects, lines } = dryEffects();
    expect(await runRound(plan, { dryRun: true }, effects)).toEqual({ failed: false });
    expect(lines).toEqual([
      "Dry run: this says what the queue would do, and changes nothing.",
      "Vercel refused a deploy at 2026-11-02 06:20 UTC, under an hour ago, so nothing starts this round.",
      "6 tickets have a builder running:",
      "- JAS-40: it's In Review, and PR 295 isn't marked ready or left for Jasper.",
      "- JAS-43: it's In Review, and PR 294 isn't marked ready or left for Jasper.",
      "- JAS-136: it's In Review, and PR 287 isn't marked ready or left for Jasper.",
      "- JAS-144: it's In Progress.",
      "- JAS-165: it's In Progress.",
      "- JAS-190: it's In Progress.",
      "No ticket starts this round, since no ticket is Ready.",
    ]);
  });

  it("make a written-up Ready ticket wait at 06:30, for Vercel and for the builders with no Touches line", async () => {
    const today = await todaysSnapshot();
    const plan = planRound({ ...today, issues: [...today.issues, issue("JAS-900")] }, AT_0630, RUN);
    expect(plan.start).toEqual([]);
    expect(plan.waits).toEqual([
      {
        id: "JAS-900",
        why: [
          "Nothing starts while JAS-40 has a builder running, because its description has no **Touches.** line, so that builder could be changing any file.",
          "Nothing starts while JAS-43 has a builder running, because its description has no **Touches.** line, so that builder could be changing any file.",
          "Nothing starts while JAS-136 has a builder running, because its description has no **Touches.** line, so that builder could be changing any file.",
          "Nothing starts while JAS-190 has a builder running, because its Touches line names no files in backticks, so that builder could be changing any file.",
          "Vercel is refusing deploys, so nothing starts.",
        ],
        comment: expect.objectContaining({ kind: "create", issueUuid: "uuid-JAS-900" }),
      },
    ]);
  });
});

describe("vercelState", () => {
  it("ignores a pending status, since Vercel hasn't answered yet", () => {
    const statuses = [refusal("2026-11-02T06:00:00Z"), vercel("pending", "Vercel is deploying your app", "2026-11-02T08:00:00Z")];
    expect(vercelState(statuses, AT_0630)).toEqual({ kind: "refusing", since: "2026-11-02T06:00:00Z" });
  });

  it("isn't cleared by a deploy that finished within an hour of the refusal, like PR 276's", () => {
    const statuses = [refusal("2026-11-02T06:00:00Z"), vercel("success", "Deployment has completed", "2026-11-02T06:50:00Z")];
    expect(vercelState(statuses, AT_0730).kind).toBe("testing");
  });

  it("is cleared by a deploy that finished more than an hour after the newest refusal", () => {
    const statuses = [refusal("2026-11-02T05:00:00Z"), vercel("success", "Deployment has completed", "2026-11-02T06:10:00Z")];
    expect(vercelState(statuses, AT_0630)).toEqual({ kind: "ok" });
  });

  it("is ok with no refusal, and reads only Vercel's statuses", () => {
    expect(vercelState([], AT_0630)).toEqual({ kind: "ok" });
    expect(vercelState([{ ...refusal("2026-11-02T06:20:00Z"), context: "CI" }], AT_0630)).toEqual({ kind: "ok" });
  });
});

describe("reading Linear's answers", () => {
  it("turns a ticket into the picker's ticket", () => {
    const ticket = toTicket(issue("JAS-7", { priority: 0, description: null, blockedBy: ["JAS-5"], assignee: JASPER, subTickets: 1 }), JASPER);
    expect(ticket).toMatchObject({ id: "JAS-7", priority: null, description: "", blockedBy: ["JAS-5"], assignedToJasper: true, hasSubTickets: true });
    expect([1, 2, 3, 4].map((priority) => toTicket(issue("JAS-7", { priority }), JASPER).priority)).toEqual(["Urgent", "High", "Medium", "Low"]);
  });

  it("stops at a status the picker doesn't know, instead of misreading it", () => {
    expect(() => issue("JAS-7", { status: "In QA" })).toThrow();
  });

  it("reads the ticket a builder's branch names, in any case", () => {
    expect(ticketOfBranch("claude/jas-144-script-wip")).toBe("JAS-144");
    expect(ticketOfBranch("Claude/JAS-7-x")).toBe("JAS-7");
    expect(ticketOfBranch("claude/fix-the-thing")).toBeNull();
    expect(ticketOfBranch("main")).toBeNull();
  });

  it("gives a renamed file both its paths", () => {
    const prs = toOpenPrs([pull(1, "claude/jas-1-x")], { 1: [{ filename: "src/new.ts", previous_filename: "src/old.ts" }] });
    expect(prs[0].files).toEqual(["src/new.ts", "src/old.ts"]);
  });

  it("fetches a chain of blockers by ID, each once", async () => {
    const linear = fakeLinear([issue("JAS-1", { blockedBy: ["JAS-2"] })], {
      blockers: [issue("JAS-2", { status: "Todo", blockedBy: ["JAS-3", "JAS-9"] }), issue("JAS-3", { status: "Backlog" })],
    });
    const read = await readSnapshot(REPO, linear.call, quietGitHub);
    expect(read.issues.map((ticket) => ticket.identifier)).toEqual(["JAS-1", "JAS-2", "JAS-3"]);
    // JAS-9 never comes back, and isn't asked for again.
    expect(linear.asked).toEqual(["Queue", "Issues uuid-JAS-2", "Issues uuid-JAS-3 uuid-JAS-9"]);
  });

  it("asks Linear for 25 tickets at a time, under its complexity limit, and reads every page", async () => {
    const numbers = Array.from({ length: 30 }, (_, i) => i + 1);
    const blockers = numbers.map((n) => issue(`JAS-${n + 100}`, { status: "Todo" }));
    const linear = fakeLinear(
      numbers.map((n) => issue(`JAS-${n}`, { blockedBy: [`JAS-${n + 100}`] })),
      { blockers },
    );
    const read = await readSnapshot(REPO, linear.call, quietGitHub);
    expect(read.issues).toHaveLength(60);
    const ids = blockers.map((blocker) => blocker.id);
    expect(linear.asked).toEqual(["Queue", "Queue after 25", `Issues ${ids.slice(0, 25).join(" ")}`, `Issues ${ids.slice(25).join(" ")}`]);
  });

  it("stops at a ticket with more labels or relations than it reads, since a missed one could be a blocker", async () => {
    const moreLabels = { ...issue("JAS-1"), labels: { pageInfo: { hasNextPage: true }, nodes: [] } };
    await expect(readSnapshot(REPO, fakeLinear([moreLabels]).call, quietGitHub)).rejects.toThrow("JAS-1 has more than 20 labels, which the queue doesn't read");
    const moreRelations = { ...issue("JAS-3", { status: "Todo" }), inverseRelations: { pageInfo: { hasNextPage: true }, nodes: [] } };
    const linear = fakeLinear([issue("JAS-2", { blockedBy: ["JAS-3"] })], { blockers: [moreRelations as LinearIssue] });
    await expect(readSnapshot(REPO, linear.call, quietGitHub)).rejects.toThrow("JAS-3 has more than 20 relations, which the queue doesn't read");
  });

  it("throws on a Linear answer with errors", async () => {
    const linear: LinearCall = async () => ({ errors: [{ message: "Authentication required" }] });
    await expect(readSnapshot(REPO, linear, quietGitHub)).rejects.toThrow("Linear refused the Queue request: Authentication required");
  });
});

describe("a ticket can't start twice", () => {
  const STARTED_30_MIN_AGO = "2026-11-02T06:00:00.000Z";
  const STARTED_3_HOURS_AGO = "2026-11-02T03:30:00.000Z";

  it("holds a ticket with a start comment under 2 hours old", () => {
    const read = snapshot({ issues: [issue("JAS-1")], comments: { "JAS-1": [comment("c1", `${START_LINE}\n\n${RUN}`, STARTED_30_MIN_AGO)] } });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.running).toEqual([{ id: "JAS-1", why: "the queue started a builder on it at 2026-11-02 06:00 UTC, under 2 hours ago" }]);
    expect(plan.start).toEqual([]);
    expect(plan.waits).toEqual([{ id: "JAS-1", why: ["A builder is already running on it."], comment: { kind: "none" } }]);
  });

  it("lets go of it after 2 hours", () => {
    const read = snapshot({ issues: [issue("JAS-1")], comments: { "JAS-1": [comment("c1", START_LINE, STARTED_3_HOURS_AGO)] } });
    expect(planRound(read, AT_0630, RUN).start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
  });

  it("holds a Ready ticket whose builder opened a PR but couldn't move it in Linear, after its start comment's 2 hours", () => {
    const read = snapshot({
      issues: [issue("JAS-5")],
      pulls: [pull(9, "claude/jas-5-x", "**Ready to merge:** no")],
      files: { 9: [{ filename: "src/JAS-5.ts" }] },
      comments: { "JAS-5": [comment("c1", START_LINE, "2026-11-02T03:00:00.000Z")] },
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.start).toEqual([]);
    expect(plan.running).toEqual([{ id: "JAS-5", why: "its PR 9 is open and isn't marked ready or left for Jasper" }]);
  });

  it("holds a Ready ticket whose PR is marked ready or left for Jasper, since a second builder would build it again", () => {
    for (const body of ["**Ready to merge:** yes at 4d2a4fe", "**Ready to merge:** no: Jasper merges this one by hand."]) {
      const read = snapshot({ issues: [issue("JAS-5")], pulls: [pull(9, "claude/jas-5-x", body)], files: { 9: [{ filename: "src/JAS-5.ts" }] } });
      const plan = planRound(read, AT_0630, RUN);
      expect(plan.start).toEqual([]);
      expect(plan.running).toEqual([{ id: "JAS-5", why: "its builder already opened PR 9, though Linear still has it Ready" }]);
    }
  });

  it("lets a refused start's comment go after an hour, instead of holding the ticket for 2 like a start comment", () => {
    const read = snapshot({ issues: [issue("JAS-1")], comments: { "JAS-1": [comment("c1", `${REFUSED_LINE}\n\nThe cloud task answered HTTP 429.`, "2026-11-02T05:00:00.000Z")] } });
    expect(planRound(read, AT_0630, RUN).start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
  });
});

describe("a refused start", () => {
  it("starts nothing on any ticket for an hour, so a lasting refusal doesn't add a refused comment each run", async () => {
    let now = new Date("2026-11-02T06:00:00Z");
    const store = linearStore(() => now, [{ kind: "refused", status: 429, why: "rate_limit_error: slow down" }]);
    const tickets = [issue("JAS-1"), issue("JAS-2")];
    const round = async () => {
      const plan = planRound(store.read(tickets), now, RUN);
      await runRound(plan, { dryRun: false }, store.effects);
      return plan;
    };

    await round();
    expect(store.fired).toEqual(["JAS-1"]);

    now = new Date("2026-11-02T06:10:00Z");
    const held = await round();
    expect(store.fired).toEqual(["JAS-1"]);
    expect(store.all().filter((posted) => posted.body.startsWith(START_LINE))).toEqual([]);
    const why = "The cloud task refused a start at 2026-11-02 06:00 UTC, so nothing starts until 2026-11-02 07:00 UTC.";
    expect(held.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-1", [why]],
      ["JAS-2", [why]],
    ]);

    now = new Date("2026-11-02T07:01:00Z");
    await round();
    expect(store.fired).toEqual(["JAS-1", "JAS-1", "JAS-2"]);
  });
});

describe("In Review", () => {
  const inReview = (body: string | null) =>
    runningTickets(snapshot({ issues: [issue("JAS-5", { status: "In Review" })], pulls: [pull(9, "claude/jas-5-x", body)] }), AT_0630);

  it("counts as running until its PR says ready at its head, or that Jasper merges it", () => {
    expect(inReview("**Ready to merge:** no")).toEqual([{ id: "JAS-5", why: "it's In Review, and PR 9 isn't marked ready or left for Jasper" }]);
    expect(inReview(null)).toHaveLength(1);
    expect(inReview("**Ready to merge:** yes at 1234567")).toHaveLength(1);
    expect(inReview("**Ready to merge:** yes at 4d2a4fe")).toEqual([]);
    expect(inReview("**Ready to merge:** no: Jasper merges this one by hand.")).toEqual([]);
  });

  it("doesn't count with no open PR, since its PR merged or closed", () => {
    expect(runningTickets(snapshot({ issues: [issue("JAS-5", { status: "In Review" })] }), AT_0630)).toEqual([]);
  });

  it("frees the slot of a builder that finished within 2 hours of the queue's start comment", () => {
    const started = { "JAS-5": [comment("c1", START_LINE, "2026-11-02T05:50:00.000Z")] };
    const finished = snapshot({ issues: [issue("JAS-5", { status: "In Review" })], pulls: [pull(9, "claude/jas-5-x", "**Ready to merge:** yes at 4d2a4fe")], comments: started });
    expect(runningTickets(finished, AT_0630)).toEqual([]);
    expect(runningTickets({ ...finished, pulls: [] }, AT_0630)).toEqual([]);
    // Before its builder moves it, the start comment still holds it.
    for (const status of ["Ready", "Todo", "Backlog"]) {
      expect(runningTickets(snapshot({ issues: [issue("JAS-5", { status })], comments: started }), AT_0630).map((ticket) => ticket.id)).toEqual(["JAS-5"]);
    }
  });
});

describe("a dry run", () => {
  it("says what it would start and why each other ticket waits, and touches nothing", async () => {
    const read = snapshot({ issues: [issue("JAS-1"), issue("JAS-2", { priority: 0 })] });
    const { effects, lines } = dryEffects();
    await runRound(planRound(read, AT_0630, RUN), { dryRun: true }, effects);
    expect(lines).toContain("Would start a builder on JAS-1.");
    expect(lines.slice(-2)).toEqual(["JAS-2 waits, and its comment would be created:", "- It has no Priority."]);
  });
});

describe("starting builders", () => {
  const two = () => planRound(snapshot({ issues: [issue("JAS-1"), issue("JAS-2")] }), AT_0630, RUN);

  it("comments on each picked ticket, then fires once with its ID", async () => {
    const { effects, calls } = recorder();
    expect(await runRound(two(), { dryRun: false }, effects)).toEqual({ failed: false });
    expect(calls).toEqual([`createComment uuid-JAS-1: ${START_LINE}`, "fire JAS-1", `createComment uuid-JAS-2: ${START_LINE}`, "fire JAS-2"]);
  });

  it("sends only the ticket's ID, and no token", () => {
    const request = fireRequest("trig_01Abc", "JAS-7");
    expect(request.url).toBe("https://api.anthropic.com/v1/claude_code/routines/trig_01Abc/fire");
    expect(JSON.parse(request.body)).toEqual({ text: "JAS-7" });
    expect(Object.keys(request.headers).map((name) => name.toLowerCase())).not.toContain("authorization");
  });

  it("refuses to send anything but a ticket ID", async () => {
    const plan: Plan = { ...two(), start: [{ id: "JAS-1\nrm", uuid: "u", body: START_LINE }] };
    const { effects, calls } = recorder();
    await expect(runRound(plan, { dryRun: false }, effects)).rejects.toThrow("isn't a ticket ID");
    expect(calls).toEqual([]);
  });

  it("reads the cloud task's answers", () => {
    expect(fireAnswer(200, JSON.stringify({ type: "routine_fire", claude_code_session_id: "s", claude_code_session_url: "https://claude.ai/code/s" }))).toEqual({
      kind: "started",
      sessionUrl: "https://claude.ai/code/s",
    });
    expect(fireAnswer(429, JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "Too many\nfires" } }))).toEqual({
      kind: "refused",
      status: 429,
      why: "rate_limit_error: Too many fires",
    });
    expect(fireAnswer(200, "<html>")).toMatchObject({ kind: "no answer" });
  });

  it("after a refused fire, edits that start comment, starts nothing else, and fails the run for a bad token", async () => {
    const { effects, calls, lines } = recorder(() => ({ kind: "refused", status: 401, why: "authentication_error: invalid token" }));
    expect(await runRound(two(), { dryRun: false }, effects)).toEqual({ failed: true });
    expect(calls).toEqual([`createComment uuid-JAS-1: ${START_LINE}`, "fire JAS-1", `updateComment comment-1: ${REFUSED_LINE}`]);
    expect(lines).toContain("JAS-2 didn't start, since the cloud task refused JAS-1.");
    expect(lines.some((line) => line.startsWith("::error title=Builder start refused::"))).toBe(true);
  });

  it("after a 429, warns and doesn't fail the run", async () => {
    const { effects, calls, lines } = recorder(() => ({ kind: "refused", status: 429, why: "rate_limit_error: slow down" }));
    expect(await runRound(two(), { dryRun: false }, effects)).toEqual({ failed: false });
    expect(calls).not.toContain("fire JAS-2");
    expect(lines.some((line) => line.startsWith("::warning title=Builder start refused::"))).toBe(true);
  });

  it("with no answer, keeps the start comment, so it holds the ticket, and starts nothing else", async () => {
    const { effects, calls, lines } = recorder(() => ({ kind: "no answer", why: "The operation was aborted due to timeout" }));
    expect(await runRound(two(), { dryRun: false }, effects)).toEqual({ failed: false });
    expect(calls).toEqual([`createComment uuid-JAS-1: ${START_LINE}`, "fire JAS-1"]);
    expect(lines).toContain("JAS-2 didn't start, since the cloud task didn't answer for JAS-1.");
  });

  it("says what each refusal means, as the fire docs list them, and fails the run unless it's the hourly limit", async () => {
    const why = "invalid_request_error: This routine is paused";
    const cases: [number, string, string, boolean][] = [
      [401, "error", "its token or task ID is wrong, or the account has no access", true],
      [403, "error", "its token or task ID is wrong, or the account has no access", true],
      [404, "error", "its token or task ID is wrong, or the account has no access", true],
      [429, "warning", "an hourly fire limit (30 a task, 100 an account) was reached", false],
      [400, "error", `the cloud task refused it: ${why}`, true],
    ];
    for (const [status, level, reason, failed] of cases) {
      const { effects, lines } = recorder(() => ({ kind: "refused", status, why }));
      expect(await runRound(two(), { dryRun: false }, effects)).toEqual({ failed });
      const annotation = lines.find((line) => line.startsWith("::"));
      expect(annotation).toMatch(new RegExp(`^::${level} title=Builder start refused::`));
      expect(annotation).toContain(`JAS-1 didn't start (HTTP ${status}): ${reason}.`);
      expect(lines.join("\n")).not.toMatch(/usage/i);
    }
  });

  it("says a refusal before editing the start comment, so a Linear failure there can't hide it", async () => {
    const { effects, lines } = recorder(() => ({ kind: "refused", status: 401, why: "authentication_error: invalid token" }));
    const linearDown = { ...effects, updateComment: async () => Promise.reject(new Error("Linear is down")) };
    await expect(runRound(two(), { dryRun: false }, linearDown)).rejects.toThrow("Linear is down");
    expect(lines.some((line) => line.startsWith("::error title=Builder start refused::JAS-1 didn't start (HTTP 401)"))).toBe(true);
    expect(lines).toContain("JAS-1 didn't start (HTTP 401): its token or task ID is wrong, or the account has no access.");
  });

  it("after a 5xx, keeps the start comment, since the docs don't say no session started", async () => {
    const serverError = JSON.stringify({ type: "error", error: { type: "api_error", message: "Internal server error" } });
    expect(fireAnswer(500, serverError)).toEqual({ kind: "no answer", why: "HTTP 500: api_error: Internal server error" });
    expect(fireAnswer(503, "<html>Service\nUnavailable</html>")).toEqual({ kind: "no answer", why: "HTTP 503: <html>Service Unavailable</html>" });
    const { effects, calls } = recorder(() => fireAnswer(503, "upstream connect error"));
    expect(await runRound(two(), { dryRun: false }, effects)).toEqual({ failed: false });
    expect(calls).toEqual([`createComment uuid-JAS-1: ${START_LINE}`, "fire JAS-1"]);
  });

  it("keeps the cloud task's message on one line in the log", async () => {
    const { effects, lines } = recorder(() => ({ kind: "refused", status: 400, why: "x\n::error::injected" }));
    await runRound(two(), { dryRun: false }, effects);
    expect(lines.filter((line) => line.includes("injected")).every((line) => !line.startsWith("::error::"))).toBe(true);
    expect(lines.every((line) => !line.includes("\n"))).toBe(true);
  });
});

describe("blockers and wait comments", () => {
  const blocked = (blockerDescription: string) =>
    snapshot({ issues: [issue("JAS-1", { blockedBy: ["JAS-2"] }), issue("JAS-2", { status: "Todo", priority: 0, description: blockerDescription })] });

  it("moves a written-up Todo blocker to Ready and High with one comment, before any start", async () => {
    const plan = planRound(blocked(writtenUp("JAS-2")), AT_0630, RUN);
    expect(plan.promote).toEqual([
      { id: "JAS-2", uuid: "uuid-JAS-2", priority: "High", moveToReady: true, body: "Ticket queue: moved this ticket to Ready and rated it High.\n\nIt blocks JAS-1, which is Ready." },
    ]);
    const { effects, calls } = recorder();
    await runRound(plan, { dryRun: false }, effects);
    expect(calls).toEqual([
      "promote uuid-JAS-2 2 to Ready",
      "createComment uuid-JAS-2: Ticket queue: moved this ticket to Ready and rated it High.",
      `createComment uuid-JAS-2: ${START_LINE}`,
      "fire JAS-2",
      `createComment uuid-JAS-1: ${WAIT_LINE}`,
    ]);
  });

  it("writes a ticket's wait comment once, leaves it while the reasons stay, and edits it when they change", () => {
    const first = planRound(blocked("Not written up yet."), AT_0630, RUN);
    const wait = first.waits.find((entry) => entry.id === "JAS-1");
    if (wait?.comment.kind !== "create") throw new Error("the first round should create the wait comment");
    expect(wait.comment.body.split("\n")).toEqual([
      WAIT_LINE,
      "",
      "- It waits for JAS-2, which can't move to Ready, because it has no Acceptance criteria section and its description has no **Touches.** line.",
      "",
      "The queue edits this comment when the reasons change, instead of adding another.",
    ]);

    const posted = comment("c1", wait.comment.body, "2026-11-02T06:31:00.000Z");
    const again = planRound({ ...blocked("Not written up yet."), comments: { "JAS-1": [posted] } }, AT_0730, RUN);
    expect(again.waits.find((entry) => entry.id === "JAS-1")?.comment).toEqual({ kind: "same" });
    // Linear can write a list back with "* " instead of "- ".
    const asLinearShowsIt = { ...posted, body: posted.body.replace("\n- ", "\n* ") };
    expect(planRound({ ...blocked("Not written up yet."), comments: { "JAS-1": [asLinearShowsIt] } }, AT_0730, RUN).waits[0].comment).toEqual({ kind: "same" });

    const changed = planRound({ ...blocked(writtenUp("JAS-2")), comments: { "JAS-1": [posted] } }, AT_0730, RUN);
    expect(changed.waits.find((entry) => entry.id === "JAS-1")?.comment).toMatchObject({ kind: "update", commentId: "c1" });
  });

  it("edits a ticket's oldest wait comment when it has two", () => {
    const comments = {
      "JAS-1": [comment("newer", `${WAIT_LINE}\n\n- An old reason.`, "2026-11-02T06:10:00.000Z"), comment("older", `${WAIT_LINE}\n\n- An old reason.`, "2026-11-02T06:00:00.000Z")],
    };
    const plan = planRound(snapshot({ issues: [issue("JAS-1", { priority: 0 })], comments }), AT_0630, RUN);
    expect(plan.waits[0].comment).toMatchObject({ kind: "update", commentId: "older" });
  });

  it("edits a started ticket's wait comment to say a builder started, and a later wait gets a new one", async () => {
    let now = new Date("2026-11-02T06:30:00Z");
    const store = linearStore(() => now);
    const round = (extra: Partial<Snapshot>) => runRound(planRound(store.read([issue("JAS-1")], extra), now, RUN), { dryRun: false }, store.effects);

    await round({ statuses: [refusal("2026-11-02T06:20:00Z")] });
    now = new Date("2026-11-02T07:30:00Z");
    await round({});
    expect(store.all().map((posted) => [posted.id, posted.body])).toEqual([
      ["c1", `${WAITED_LINE}\n\nThe queue started its cloud session at 2026-11-02 07:30 UTC.`],
      ["c2", expect.stringMatching(new RegExp(`^${START_LINE}`))],
    ]);

    now = new Date("2026-11-02T10:00:00Z");
    await round({ statuses: [refusal("2026-11-02T09:50:00Z")] });
    expect(store.all().map((posted) => [posted.id, posted.body.split("\n")[0]])).toEqual([
      ["c1", WAITED_LINE],
      ["c2", START_LINE],
      ["c3", WAIT_LINE],
    ]);
  });

  it("leaves the wait comment alone when the start is refused or gets no answer", async () => {
    const read = snapshot({ issues: [issue("JAS-1")], comments: { "JAS-1": [comment("w1", `${WAIT_LINE}\n\n- An old reason.`, "2026-11-02T05:00:00.000Z")] } });
    const answers: FireAnswer[] = [
      { kind: "refused", status: 429, why: "rate_limit_error: slow down" },
      { kind: "no answer", why: "The operation was aborted due to timeout" },
    ];
    for (const answer of answers) {
      const { effects, calls } = recorder(() => answer);
      await runRound(planRound(read, AT_0630, RUN), { dryRun: false }, effects);
      expect(calls.filter((call) => call.includes("w1"))).toEqual([]);
    }
    const { effects, calls } = recorder();
    await runRound(planRound(read, AT_0630, RUN), { dryRun: false }, effects);
    expect(calls.filter((call) => call.includes("w1"))).toEqual([`updateComment w1: ${WAITED_LINE}`]);
  });

  it("never moves, starts or comments on a blocker in another project", () => {
    const read = snapshot({
      issues: [issue("JAS-1", { blockedBy: ["JAS-2", "JAS-3"] }), issue("JAS-2", { status: "Todo", project: "Petri" }), issue("JAS-3", { project: null })],
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.promote).toEqual([]);
    expect(plan.start).toEqual([]);
    expect(plan.waits.map((wait) => wait.id)).toEqual(["JAS-1"]);
    expect(plan.waits[0].why).toEqual([
      "It waits for JAS-2, which is in another project, so the queue doesn't move it.",
      "It waits for JAS-3, which is Ready.",
    ]);
    expect(plan.notes).toEqual([
      "JAS-2 isn't in project Turnpoint, so the queue doesn't move, start or comment on it.",
      "JAS-3 isn't in project Turnpoint, so the queue doesn't move, start or comment on it.",
    ]);
  });
});

describe("Vercel's test mode", () => {
  const three = (comments: Snapshot["comments"] = {}) =>
    snapshot({ issues: [issue("JAS-1"), issue("JAS-2"), issue("JAS-3")], statuses: [refusal("2026-11-02T05:00:00Z")], comments });

  it("starts only the first pick, and says why the rest wait", () => {
    const plan = planRound(three(), AT_0630, RUN);
    expect(plan.vercel).toEqual({ kind: "testing", since: "2026-11-02T05:00:00Z" });
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-2", ["Vercel refused a deploy at 2026-11-02 05:00 UTC, so only JAS-1 starts this round, as a test, until a preview deploys."]],
      ["JAS-3", ["Vercel refused a deploy at 2026-11-02 05:00 UTC, so only JAS-1 starts this round, as a test, until a preview deploys."]],
    ]);
  });

  it("starts no second test while the first test's builder still runs, past its start comment's 2 hours", () => {
    const read = snapshot({
      issues: [issue("JAS-1", { status: "In Progress" }), issue("JAS-2"), issue("JAS-3")],
      statuses: [refusal("2026-11-02T05:00:00Z")],
      comments: { "JAS-1": [comment("c1", START_LINE, "2026-11-02T05:30:00.000Z")] },
    });
    const plan = planRound(read, new Date("2026-11-02T08:00:00Z"), RUN);
    expect(plan.start).toEqual([]);
    const why = "Vercel refused a deploy at 2026-11-02 05:00 UTC, and JAS-1 started at 2026-11-02 05:30 UTC as a test, so nothing else starts until a preview deploys.";
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-2", [why]],
      ["JAS-3", [why]],
    ]);
  });

  it("starts no second test while the first one's start comment holds", () => {
    const testStarted = three({ "JAS-9": [comment("c9", START_LINE, "2026-11-02T06:10:00.000Z")] });
    const plan = planRound({ ...testStarted, issues: [...testStarted.issues, issue("JAS-9", { status: "In Progress" })] }, AT_0630, RUN);
    expect(plan.start).toEqual([]);
    expect(plan.waits.map((wait) => wait.id)).toEqual(["JAS-1", "JAS-2", "JAS-3"]);
  });
});

describe("linearWrites", () => {
  it("moves a blocker to team JAS's Ready status, and throws when Linear says it didn't work", async () => {
    const sent: unknown[] = [];
    const writes = linearWrites(async (query, variables) => {
      sent.push([query, variables]);
      return { data: { issueUpdate: { success: false } } };
    }, "ready-state");
    await expect(writes.promote("uuid-JAS-2", 2, true)).rejects.toThrow("success: false");
    expect(sent).toEqual([[ISSUE_MOVE, { id: "uuid-JAS-2", stateId: "ready-state", priority: 2 }]]);
  });

  it("rates a blocker that's already Ready without writing its status, so a builder that moved it on isn't moved back", async () => {
    const sent: unknown[] = [];
    const linear: LinearCall = async (query, variables) => {
      if (query === COMMENT_CREATE) return { data: { commentCreate: { success: true, comment: { id: "c1" } } } };
      sent.push([query, variables]);
      return { data: { issueUpdate: { success: true } } };
    };
    const read = snapshot({ issues: [issue("JAS-1", { blockedBy: ["JAS-2", "JAS-3"] }), issue("JAS-2"), issue("JAS-3", { status: "Todo" })] });
    const { effects } = recorder();
    await runRound(planRound(read, AT_0630, RUN), { dryRun: false }, { ...effects, ...linearWrites(linear, "ready-state") });
    expect(sent).toEqual([
      [ISSUE_RATE, { id: "uuid-JAS-2", priority: 2 }],
      [ISSUE_MOVE, { id: "uuid-JAS-3", stateId: "ready-state", priority: 2 }],
    ]);
  });

  it("returns the new comment's ID", async () => {
    const writes = linearWrites(async () => ({ data: { commentCreate: { success: true, comment: { id: "c42" } } } }), "ready-state");
    expect(await writes.createComment("uuid-JAS-1", START_LINE)).toBe("c42");
  });
});

// The workflow holds Jasper's Linear key and the cloud task's token, so
// these pin every line that could reach either, or start a run.
describe(".github/workflows/run-queue.yml", () => {
  const code = workflowLines(".github/workflows/run-queue.yml");
  const trimmed = code.map((line) => line.trim());
  const merged = code.slice(code.indexOf("  merged:"), code.indexOf("  queue:"));
  const queue = code.slice(code.indexOf("  queue:"));
  // An `if: >-` and the lines folded into it.
  const condition = (job: string[]) => {
    const at = job.findIndex((line) => line.trim() === "if: >-");
    const rest = job.slice(at + 1);
    const end = rest.findIndex((line) => !line.startsWith("      "));
    return rest.slice(0, end).map((line) => line.trim());
  };

  it("wakes when Agent merge finishes, on a push to main, by name with a dry_run input, and hourly", () => {
    const on = code.indexOf("on:");
    const end = code.findIndex((line, i) => i > on && !line.startsWith(" "));
    expect(trimmed.slice(on + 1, end)).toEqual([
      "workflow_run:",
      "workflows: [Agent merge]",
      "types: [completed]",
      "push:",
      "branches: [main]",
      "workflow_dispatch:",
      "inputs:",
      "dry_run:",
      "description: Print what it would do and change nothing",
      "type: boolean",
      "default: false",
      "schedule:",
      '- cron: "41 * * * *"',
    ]);
  });

  it("runs the queue on a push, by name or on the schedule with no help from the merged job, and only main's copy", () => {
    expect(condition(queue)).toEqual([
      "!cancelled() &&",
      "github.ref == 'refs/heads/main' &&",
      "(github.event_name != 'workflow_run' ||",
      "needs.merged.outputs.moved == 'true')",
    ]);
    expect(queue).toContain("    needs: merged");
    expect(code.filter((line) => /\bif:/.test(line))).toHaveLength(2);
    expect(condition(queue).join(" ")).not.toContain("schedule");
  });

  it("runs the merged job only when Agent merge finished, so a workflow_run starts the queue only when main moved", () => {
    expect(condition(merged)).toEqual(["github.event_name == 'workflow_run' &&", "github.event.workflow_run.conclusion != 'skipped'"]);
    expect(merged.map((line) => line.trim())).toContain("moved: ${{ steps.main.outputs.moved }}");
  });

  it("asks for nothing by default, and only reading on each job", () => {
    expect(code).toContain("permissions: {}");
    expect(code.filter((line) => /permissions:/.test(line))).toHaveLength(3);
    const mergedAt = merged.indexOf("    permissions:");
    expect(merged.slice(mergedAt + 1, mergedAt + 3).map((line) => line.trim())).toEqual(["contents: read", "outputs:"]);
    const queueAt = queue.indexOf("    permissions:");
    expect(queue.slice(queueAt + 1, queueAt + 5).map((line) => line.trim())).toEqual(["contents: read", "pull-requests: read", "statuses: read", "steps:"]);
  });

  it("runs one real run at a time on the queue job, with dry runs on their own line, and never cancels a running one", () => {
    expect(code.filter((line) => /concurrency:/.test(line))).toEqual(["    concurrency:"]);
    const at = queue.indexOf("    concurrency:");
    expect(queue.slice(at + 1, at + 3).map((line) => line.trim())).toEqual([
      "group: ${{ inputs.dry_run && 'run-queue-dry-run' || 'run-queue' }}",
      "cancel-in-progress: false",
    ]);
  });

  it("runs only main's checkout, node, npm ci and the queue script in the queue job", () => {
    expect(queue.filter((line) => /^\s*- (uses|run):/.test(line)).map((line) => line.trim())).toEqual([
      "- uses: actions/checkout@v7",
      "- uses: actions/setup-node@v7",
      "- run: npm ci",
      "- run: npx tsx scripts/run-queue.ts",
    ]);
    expect(queue.filter((line) => /^\s*(ref|repository|path|token|cache|persist-credentials|package-manager-cache):/.test(line)).map((line) => line.trim())).toEqual([
      "ref: main",
      "persist-credentials: false",
      "package-manager-cache: false",
    ]);
  });

  it("names the two secrets only in the last step, and gives a dry run no task token", () => {
    const secrets = code.filter((line) => line.includes("secrets."));
    expect(secrets.map((line) => line.trim())).toEqual([
      "LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}",
      "RUN_QUEUE_TASK_TOKEN: ${{ !inputs.dry_run && secrets.RUN_QUEUE_TASK_TOKEN || '' }}",
    ]);
    const lastStep = code.indexOf("      - run: npx tsx scripts/run-queue.ts");
    expect(secrets.every((line) => code.indexOf(line) > lastStep)).toBe(true);
  });

  it("puts nothing from the event into a run: line, so the merged job passes the event's time through env", () => {
    const script = code.flatMap((line, i) => {
      if (!/^\s*(- )?run:/.test(line)) return [];
      if (!line.trim().endsWith("|")) return [line];
      const indent = line.indexOf("run:");
      const body = code.slice(i + 1);
      const end = body.findIndex((next) => next.search(/\S/) <= indent);
      return [line, ...body.slice(0, end === -1 ? undefined : end)];
    });
    expect(script.filter((line) => /^\s*(- )?run:/.test(line))).toHaveLength(3);
    expect(script.map((line) => line.trim())).toContain('if [[ "$committed" > "$STARTED" ]]; then moved=true; else moved=false; fi');
    expect(script.some((line) => line.includes("${{"))).toBe(false);
    expect(merged.map((line) => line.trim())).toContain("STARTED: ${{ github.event.workflow_run.run_started_at }}");
  });
});

describe("scripts/run-queue.ts", () => {
  const code = source("scripts/run-queue.ts");
  const lines = code.split("\n");

  it("reads the task token and the Linear key in one place each, and sends each only in its Authorization header", () => {
    expect(code.match(/RUN_QUEUE_TASK_TOKEN/g)).toHaveLength(1);
    expect(code.match(/LINEAR_API_KEY/g)).toHaveLength(1);
    expect(lines.filter((line) => line.includes("taskToken")).map((line) => line.trim())).toEqual([
      'const taskToken = dryRun ? "" : required("RUN_QUEUE_TASK_TOKEN");',
      "headers: { ...request.headers, Authorization: `Bearer ${taskToken}` },",
    ]);
    expect(lines.filter((line) => line.includes("linearKey")).map((line) => line.trim())).toEqual([
      'const linearKey = required("LINEAR_API_KEY");',
      'headers: { "content-type": "application/json", Authorization: linearKey },',
    ]);
  });

  it("gives gh only NODE_ENV, PATH, HOME, GH_TOKEN and GH_REPO, so it never holds the Linear key or the task token", () => {
    expect(code.match(/execFileSync\(/g)).toHaveLength(1);
    const github = code.slice(code.indexOf("function github("), code.indexOf("async function fire("));
    const env = github.match(/\benv: \{([^}]*)\}/)?.[1] ?? "";
    expect(env.split(",").map((entry) => entry.trim())).toEqual([
      "NODE_ENV: process.env.NODE_ENV",
      "PATH: process.env.PATH",
      "HOME: process.env.HOME",
      "GH_TOKEN: process.env.GH_TOKEN",
      "GH_REPO: process.env.GH_REPO",
    ]);
  });

  it("writes each step summary line as its own paragraph, and logs it as one line", () => {
    const summary = code.slice(code.indexOf("function summary("), code.indexOf("async function linear("));
    expect(summary).toContain("console.log(line);");
    expect(summary).toContain("appendFileSync(file, `${line}\\n\\n`);");
  });

  it("never logs a secret or the environment", () => {
    const logging = lines.filter((line) => /console\.|log\(|summary\(/.test(line));
    expect(logging.length).toBeGreaterThan(0);
    for (const line of logging) expect(line).not.toMatch(/taskToken|linearKey|process\.env|TOKEN|API_KEY/);
  });
});

describe(".claude/skills/run-queue/SKILL.md", () => {
  const skill = source(".claude/skills/run-queue/SKILL.md");

  it("finds the run it started, the newest one started by name, and waits for it to finish", () => {
    const list = skill.split("\n").filter((line) => line.includes("/runs?"));
    expect(list).toHaveLength(1);
    expect(list[0]).toContain("runs?event=workflow_dispatch&per_page=1");
    expect(skill).toContain("Wait until its status is `completed` before reading the summary.");
  });

  it("doesn't blame a refused start on a usage limit, which the fire docs don't describe", () => {
    expect(skill).not.toMatch(/usage limit/i);
  });
});
