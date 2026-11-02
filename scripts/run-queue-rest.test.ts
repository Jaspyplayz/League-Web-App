import { spawnSync } from "node:child_process";
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
  dryRunEffects,
  planRound,
  QUEUE_QUERY,
  readSnapshot,
  REFUSED_LINE,
  refusedBody,
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
import { parseTouches } from "./run-queue-pick";

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

// Effects for a dry run: anything but a log or summary line fails the test.
// `summaryLines` holds only what reaches the run's page.
function dryEffects() {
  const summaryLines: string[] = [];
  const refuse = (): never => {
    throw new Error("a dry run reached Linear or the cloud task");
  };
  const effects: Effects = { promote: refuse, createComment: refuse, updateComment: refuse, fire: refuse, log: () => {}, summary: (line) => {
    summaryLines.push(line);
  } };
  return { effects, summaryLines };
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
    const { effects, summaryLines } = dryEffects();
    expect(await runRound(plan, { dryRun: true }, effects)).toEqual({ failed: false });
    expect(summaryLines).toEqual([
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
          "Vercel is refusing deploys, so nothing starts.",
        ],
        comment: expect.objectContaining({ kind: "create", issueUuid: "uuid-JAS-900" }),
      },
    ]);
  });

  it("start a written-up Ready ticket beside the real JAS-190, whose Touches line says None", () => {
    const queue = saved("linear-queue.json") as { data: { issues: { nodes: { identifier: string }[] } } };
    const jas190 = LinearIssue.parse(queue.data.issues.nodes.find((node) => node.identifier === "JAS-190"));
    expect(jas190.description).toContain("**Touches.** None.\n\nThe output is a Linear document and new tickets.");
    const plan = planRound(snapshot({ issues: [jas190, issue("JAS-900")] }), AT_0630, RUN);
    expect(plan.running).toEqual([{ id: "JAS-190", why: "it's In Progress" }]);
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-900"]);
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

  // The first is real, on 2026-11-02. No commit read that day had a status
  // for a failed build, so nothing but a success shows Vercel deploying.
  it.each([
    ["failure", "Canceled from the Vercel Dashboard"],
    ["failure", "Some wording nobody has seen"],
    ["error", "Some wording nobody has seen"],
    ["failure", null],
  ])("counts a finished %s saying %s as a refusal", (state, description) => {
    const status: CommitStatus = { context: "Vercel", state, description, updated_at: "2026-11-02T06:00:00Z" };
    expect(vercelState([status], AT_0630)).toEqual({ kind: "refusing", since: "2026-11-02T06:00:00Z" });
  });

  it("isn't cleared by a failure more than an hour after the refusal, since only a success shows a deploy", () => {
    const statuses = [refusal("2026-11-02T04:00:00Z"), vercel("failure", "Canceled from the Vercel Dashboard", "2026-11-02T05:10:00Z")];
    expect(vercelState(statuses, AT_0630)).toEqual({ kind: "testing", since: "2026-11-02T05:10:00Z" });
  });
});

// The real statuses from 2026-11-02: commit 73a9c95's deploy, the last before
// Vercel paused the whole account, then commit 30a181c's, the first answer
// after that, which linked to
// vercel.com/knowledge/why-is-my-account-deployment-blocked.
describe("a blocked Vercel account", () => {
  const BLOCKED_AT = "2026-11-02T13:01:43Z";
  const LAST_DEPLOY = vercel("success", "Deployment has completed", "2026-11-02T12:35:14Z");
  const accountBlocked = vercel("failure", "Account is blocked.", BLOCKED_AT);
  const JUST_AFTER = new Date("2026-11-02T13:10:00Z");
  const DAYS_LATER = new Date("2026-11-09T13:10:00Z");
  const three = (statuses: CommitStatus[] = [LAST_DEPLOY, accountBlocked], extra: Partial<Snapshot> = {}) =>
    snapshot({ issues: [issue("JAS-1"), issue("JAS-2"), issue("JAS-3")], statuses, ...extra });

  it("reads the real status as blocked, not as Vercel working", () => {
    expect(vercelState([LAST_DEPLOY, accountBlocked], JUST_AFTER)).toEqual({ kind: "blocked", since: BLOCKED_AT });
  });

  it("stays blocked however long it lasts, with no hour that runs out", () => {
    expect(vercelState([accountBlocked], DAYS_LATER)).toEqual({ kind: "blocked", since: BLOCKED_AT });
  });

  it("names the newest block, and a later refusal or a status still deploying doesn't clear it", () => {
    const statuses = [accountBlocked, vercel("failure", "Account is blocked.", "2026-11-02T13:13:03Z"), refusal("2026-11-02T14:00:00Z"), vercel("pending", "Vercel is deploying your app", "2026-11-02T15:00:00Z")];
    expect(vercelState(statuses, DAYS_LATER)).toEqual({ kind: "blocked", since: "2026-11-02T13:13:03Z" });
  });

  it("is cleared by a success more than an hour after the block", () => {
    expect(vercelState([accountBlocked, vercel("success", "Deployment has completed", "2026-11-02T15:00:00Z")], DAYS_LATER)).toEqual({ kind: "ok" });
  });

  // PR 276's deploy finished 30 seconds after a refusal. One doing the same
  // after a block ends the block, and goes on as any refusal does, so at most
  // one test starts until a deploy finishes more than an hour later.
  it("treats a success within the hour as ending the block but not as Vercel working", () => {
    const statuses = [accountBlocked, vercel("success", "Deployment has completed", "2026-11-02T13:02:13Z")];
    expect(vercelState(statuses, JUST_AFTER)).toEqual({ kind: "refusing", since: BLOCKED_AT });
    expect(vercelState(statuses, DAYS_LATER)).toEqual({ kind: "testing", since: BLOCKED_AT });
  });

  it.each([
    ["minutes", JUST_AFTER],
    ["days", DAYS_LATER],
  ])("starts nothing on an automatic run %s after the block, not even a test, and says why", (_, now) => {
    const plan = planRound(three(), now, RUN);
    expect(plan.start).toEqual([]);
    const why = "Vercel blocked the account at 2026-11-02 13:01 UTC, which only Jasper can fix, so nothing starts on its own until a deploy succeeds. A run by name (/run-queue) starts one test.";
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-1", [why]],
      ["JAS-2", [why]],
      ["JAS-3", [why]],
    ]);
  });

  it("starts one test on a run by name, even beside a running builder", () => {
    const read = three(undefined, { issues: [issue("JAS-1"), issue("JAS-2"), issue("JAS-9", { status: "In Progress" })] });
    const plan = planRound(read, DAYS_LATER, RUN, { byName: true });
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-2", ["Vercel blocked the account at 2026-11-02 13:01 UTC, so only JAS-1 starts this round, as a test, until a preview deploys."]],
    ]);
  });

  it("takes a ticket with files as a run by name's test, ahead of a higher one with none", () => {
    const read = three(undefined, { issues: [issue("JAS-1", { priority: 2, description: "**Touches.** None." }), issue("JAS-2")] });
    const plan = planRound(read, DAYS_LATER, RUN, { byName: true });
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-2"]);
    expect(plan.waits.map((wait) => wait.id)).toEqual(["JAS-1"]);
  });

  it("starts a ticket with no files on a run by name when no other is waiting", () => {
    const read = three(undefined, { issues: [issue("JAS-1", { description: "**Touches.** None." })] });
    expect(planRound(read, DAYS_LATER, RUN, { byName: true }).start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
  });

  it("warns in the log and says so on the run's page, and starts nothing", async () => {
    const { effects, calls, lines } = recorder();
    await runRound(planRound(three(), JUST_AFTER, RUN), { dryRun: false }, effects);
    expect(calls.filter((call) => call.startsWith("fire"))).toEqual([]);
    expect(lines.filter((line) => line.startsWith("::warning"))).toEqual([
      "::warning title=Vercel account blocked::Vercel blocked the account at 2026-11-02 13:01 UTC, which only Jasper can fix. Nothing starts on its own until a deploy succeeds, and a run by name starts one test.",
    ]);
    expect(lines).toContain("Vercel blocked the account at 2026-11-02 13:01 UTC, which only Jasper can fix, so nothing starts on its own until a deploy succeeds.");
  });

  it("gives no warning when the account isn't blocked", async () => {
    const { effects, lines } = recorder();
    await runRound(planRound(three([LAST_DEPLOY]), JUST_AFTER, RUN), { dryRun: false }, effects);
    expect(lines.filter((line) => line.startsWith("::warning"))).toEqual([]);
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

  it("never starts a Ready ticket whose PR is marked ready or left for Jasper, and gives it no builder slot", () => {
    for (const body of ["**Ready to merge:** yes at 4d2a4fe", "**Ready to merge:** no: Jasper merges this one by hand."]) {
      const read = snapshot({ issues: [issue("JAS-5")], pulls: [pull(9, "claude/jas-5-x", body)], files: { 9: [{ filename: "src/JAS-5.ts" }] } });
      const plan = planRound(read, AT_0630, RUN);
      expect(plan.start).toEqual([]);
      expect(plan.running).toEqual([]);
      expect(plan.notes).toEqual(["JAS-5's builder has finished PR 9, though Linear still has it Ready, so the queue treats it as In Review."]);
    }
  });

  it("never moves or starts a Todo blocker whose PR is finished, and says why in Linear's words", () => {
    const read = snapshot({
      issues: [issue("JAS-1", { blockedBy: ["JAS-9"] }), issue("JAS-9", { status: "Todo" })],
      pulls: [pull(50, "claude/jas-9-x", "**Ready to merge:** no: Jasper merges this one by hand.")],
      files: { 50: [{ filename: "src/JAS-9.ts" }] },
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.promote).toEqual([]);
    expect(plan.start).toEqual([]);
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([["JAS-1", ["It waits for JAS-9, whose builder has finished PR 50, which waits to merge."]]]);
  });

  it("names each finished PR of a blocker, and says they wait to merge", () => {
    const read = snapshot({
      issues: [issue("JAS-1", { blockedBy: ["JAS-9"] }), issue("JAS-9", { status: "Todo" })],
      pulls: [pull(50, "claude/jas-9-x", "**Ready to merge:** no: Jasper merges this one by hand."), pull(51, "claude/jas-9-y", "**Ready to merge:** no: Jasper merges this one by hand.")],
      files: { 50: [{ filename: "src/JAS-9.ts" }], 51: [{ filename: "src/JAS-9.ts" }] },
    });
    expect(planRound(read, AT_0630, RUN).waits.map((wait) => wait.why)).toEqual([["It waits for JAS-9, whose builder has finished PR 50 and PR 51, which wait to merge."]]);
  });

  it("gives no slot to a ticket the queue started under 2 hours ago once its builder finished", () => {
    const read = snapshot({
      issues: [issue("JAS-1"), issue("JAS-2"), issue("JAS-3"), issue("JAS-4"), issue("JAS-5")],
      comments: { "JAS-5": [comment("c5", `${START_LINE}\n\n${RUN}`, STARTED_30_MIN_AGO)] },
      pulls: [pull(9, "claude/jas-5-x", "**Ready to merge:** no: Jasper merges this one by hand.")],
      files: { 9: [{ filename: "src/JAS-5.ts" }] },
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.running).toEqual([]);
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-1", "JAS-2", "JAS-3", "JAS-4"]);
  });

  it("still counts a builder running while one of its PRs is open and not finished", () => {
    const read = snapshot({
      issues: [issue("JAS-5")],
      pulls: [pull(9, "claude/jas-5-x", "**Ready to merge:** no: Jasper merges this one by hand."), pull(10, "claude/jas-5-y")],
      files: { 9: [{ filename: "src/JAS-5.ts" }], 10: [{ filename: "src/JAS-5.ts" }] },
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.running).toEqual([{ id: "JAS-5", why: "its PR 10 is open and isn't marked ready or left for Jasper" }]);
    expect(plan.notes).toEqual([]);
  });

  it("says in the run's summary why a Ready ticket with a finished PR doesn't start", async () => {
    const read = snapshot({ issues: [issue("JAS-5")], pulls: [pull(9, "claude/jas-5-x", "**Ready to merge:** yes at 4d2a4fe")], files: { 9: [{ filename: "src/JAS-5.ts" }] } });
    const { effects, summaryLines } = dryEffects();
    await runRound(planRound(read, AT_0630, RUN), { dryRun: true }, effects);
    expect(summaryLines).toContain("Note: JAS-5's builder has finished PR 9, though Linear still has it Ready, so the queue treats it as In Review.");
    expect(summaryLines).toContain("No ticket starts this round.");
    expect(summaryLines.join("\n")).not.toContain("no ticket is Ready");
  });

  it("says each waiting Ready ticket's reasons follow, not that no ticket is Ready", async () => {
    const { effects, summaryLines } = dryEffects();
    await runRound(planRound(snapshot({ issues: [issue("JAS-2", { priority: 0 })] }), AT_0630, RUN), { dryRun: true }, effects);
    expect(summaryLines).toContain("No ticket starts this round. Each Ready ticket's reasons are below.");
    expect(summaryLines.join("\n")).not.toContain("no ticket is Ready");
  });

  it("counts no builder on a finished ticket, even with an old PR still open", () => {
    const read = snapshot({
      issues: [issue("JAS-1", { blockedBy: ["JAS-9"] }), issue("JAS-9", { status: "Canceled", description: "No Touches line." })],
      pulls: [pull(50, "claude/jas-9-old")],
      files: { 50: [{ filename: "src/old.ts" }] },
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.running).toEqual([]);
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
  });

  it("lets a refused start's comment go after an hour, instead of holding the ticket for 2 like a start comment", () => {
    const read = snapshot({ issues: [issue("JAS-1")], comments: { "JAS-1": [comment("c1", refusedBody(429, "rate_limit_error: slow down"), "2026-11-02T05:00:00.000Z")] } });
    expect(planRound(read, AT_0630, RUN).start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
  });
});

describe("a refused start", () => {
  // Two Ready tickets and a cloud task that refuses the first fire with this
  // answer, then starts every builder. Each round reads what the last one wrote.
  function refusedOnce(answer: FireAnswer) {
    let now = new Date("2026-11-02T06:00:00Z");
    const store = linearStore(() => now, [answer]);
    const round = async (at: string, byName = false) => {
      now = new Date(at);
      const plan = planRound(store.read([issue("JAS-1"), issue("JAS-2")]), now, RUN, { byName });
      return { plan, ...(await runRound(plan, { dryRun: false }, store.effects)) };
    };
    return { store, round };
  }

  it("after the hourly fire limit, starts nothing on its own for an hour, so a lasting limit doesn't add a refused comment each run", async () => {
    const { store, round } = refusedOnce({ kind: "refused", status: 429, why: "rate_limit_error: slow down" });
    await round("2026-11-02T06:00:00Z");
    expect(store.fired).toEqual(["JAS-1"]);

    const held = await round("2026-11-02T06:10:00Z");
    expect(store.fired).toEqual(["JAS-1"]);
    expect(store.all().filter((posted) => posted.body.startsWith(START_LINE))).toEqual([]);
    const why =
      "The cloud task refused a start at 2026-11-02 06:00 UTC with HTTP 429, so nothing starts on its own until 2026-11-02 07:00 UTC. A run by name (/run-queue) tries again sooner.";
    expect(held.plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-1", [why]],
      ["JAS-2", [why]],
    ]);

    await round("2026-11-02T07:01:00Z");
    expect(store.fired).toEqual(["JAS-1", "JAS-1", "JAS-2"]);
  });

  it("after a refusal only Jasper can fix, starts nothing on its own for a day instead of failing a run each hour, and a run by name tries again", async () => {
    const { store, round } = refusedOnce({ kind: "refused", status: 401, why: "authentication_error: invalid token" });
    expect((await round("2026-11-02T06:00:00Z")).failed).toBe(true);
    expect(store.fired).toEqual(["JAS-1"]);

    const held = await round("2026-11-02T08:00:00Z");
    expect(held.failed).toBe(false);
    expect(store.fired).toEqual(["JAS-1"]);
    // No new start or refused comment, only each held ticket's one wait comment.
    expect(store.all().map((posted) => posted.body.split("\n")[0])).toEqual([REFUSED_LINE, WAIT_LINE, WAIT_LINE]);
    const why =
      "The cloud task refused a start at 2026-11-02 06:00 UTC with HTTP 401, which only Jasper can fix, so nothing starts on its own until 2026-11-03 06:00 UTC. A run by name (/run-queue) tries again sooner.";
    expect(held.plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-1", [why]],
      ["JAS-2", [why]],
    ]);

    await round("2026-11-02T08:00:00Z", true);
    expect(store.fired).toEqual(["JAS-1", "JAS-1", "JAS-2"]);
  });

  it("ends a refusal's hold once a later start got through, so automatic runs resume after Jasper's fix", () => {
    const read = snapshot({
      issues: [issue("JAS-1"), issue("JAS-2"), issue("JAS-3")],
      comments: {
        "JAS-1": [comment("c1", refusedBody(401, "authentication_error: invalid token"), "2026-11-02T05:00:00.000Z")],
        "JAS-2": [comment("c2", `${START_LINE}\n\n${RUN}`, "2026-11-02T06:00:00.000Z")],
      },
    });
    expect(planRound(read, AT_0630, RUN).start.map((ticket) => ticket.id)).toEqual(["JAS-1", "JAS-3"]);
  });

  it("holds automatic runs for a day after a refused comment whose HTTP status it can't read", () => {
    const read = snapshot({ issues: [issue("JAS-1")], comments: { "JAS-1": [comment("c1", `${REFUSED_LINE}\n\nSomething else.`, "2026-11-02T05:00:00.000Z")] } });
    expect(planRound(read, AT_0630, RUN).start).toEqual([]);
    expect(planRound(read, new Date("2026-11-03T05:01:00Z"), RUN).start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
  });
});

describe("a ticket's two tries", () => {
  const OUT_OF_TRIES =
    "It can't start, because the queue has already tried it 2 times, which is the limit. Deleting one of the queue's start comments on it gives it another try, if Jasper wants one.";

  // One Ready ticket whose builders never move it, so each start comment's
  // hold runs out. Each round reads what the last one wrote.
  function staysReady(answers: FireAnswer[] = []) {
    let now = new Date("2026-11-02T06:00:00Z");
    const store = linearStore(() => now, answers);
    const round = async (at: string, extra: Partial<Snapshot> = {}, byName = false) => {
      now = new Date(at);
      const plan = planRound(store.read([issue("JAS-1")], extra), now, RUN, { byName });
      await runRound(plan, { dryRun: false }, store.effects);
      return plan;
    };
    return { store, round };
  }

  it("starts a ticket that stays Ready twice, then never again, with one comment however many rounds follow", async () => {
    const { store, round } = staysReady();
    await round("2026-11-02T06:00:00Z");
    expect((await round("2026-11-02T07:00:00Z")).running.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
    await round("2026-11-02T08:01:00Z");
    expect(store.fired).toEqual(["JAS-1", "JAS-1"]);
    // Its second builder is still inside the start comment's 2 hours.
    expect((await round("2026-11-02T09:00:00Z")).waits).toEqual([{ id: "JAS-1", why: ["A builder is already running on it."], comment: { kind: "none" } }]);

    const out = await round("2026-11-02T10:02:00Z");
    expect(out.running).toEqual([]);
    expect(out.start).toEqual([]);
    expect(out.waits).toEqual([{ id: "JAS-1", why: [OUT_OF_TRIES], comment: expect.objectContaining({ kind: "create" }) }]);

    // Nothing in a later round changes why it waits: not Vercel, nor a run by name.
    const refused = [refusal("2026-11-02T14:00:00Z")];
    const later: [string, Partial<Snapshot>, boolean][] = [
      ["2026-11-02T12:03:00Z", {}, false],
      ["2026-11-02T14:04:00Z", { statuses: refused }, false],
      ["2026-11-02T16:05:00Z", { statuses: refused }, false],
      ["2026-11-02T18:06:00Z", {}, true],
      ["2026-11-02T20:07:00Z", {}, false],
    ];
    for (const [at, extra, byName] of later) {
      const plan = await round(at, extra, byName);
      expect(plan.start).toEqual([]);
      expect(plan.waits).toEqual([{ id: "JAS-1", why: [OUT_OF_TRIES], comment: { kind: "same" } }]);
    }
    expect(store.fired).toEqual(["JAS-1", "JAS-1"]);
    expect(store.all().map((posted) => posted.body.split("\n")[0])).toEqual([START_LINE, START_LINE, WAIT_LINE]);
  });

  it("doesn't count a refused start, and counts one with no answer, since a builder may have started", async () => {
    const { store, round } = staysReady([
      { kind: "refused", status: 429, why: "rate_limit_error: slow down" },
      { kind: "no answer", why: "The operation was aborted due to timeout" },
    ]);
    await round("2026-11-02T06:00:00Z");
    await round("2026-11-02T07:01:00Z");
    await round("2026-11-02T09:02:00Z");
    expect(store.fired).toEqual(["JAS-1", "JAS-1", "JAS-1"]);
    expect((await round("2026-11-02T11:03:00Z")).waits.map((wait) => wait.why)).toEqual([[OUT_OF_TRIES]]);
    expect(store.fired).toHaveLength(3);
  });

  it("gives the ticket another try once someone deletes a start comment", () => {
    const old = (id: string) => comment(id, START_LINE, "2026-11-01T06:00:00.000Z");
    const read = (comments: LinearComment[]) => snapshot({ issues: [issue("JAS-1")], comments: { "JAS-1": comments } });
    expect(planRound(read([old("c1"), old("c2")]), AT_0630, RUN).start).toEqual([]);
    expect(planRound(read([old("c2")]), AT_0630, RUN).start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
  });

  it("lets the next ticket start instead, and says why in the run's summary", async () => {
    const old = comment("c1", START_LINE, "2026-11-01T06:00:00.000Z");
    const read = snapshot({ issues: [issue("JAS-1"), issue("JAS-2")], comments: { "JAS-1": [old, { ...old, id: "c2" }] } });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-2"]);
    const { effects, summaryLines } = dryEffects();
    await runRound(plan, { dryRun: true }, effects);
    expect(summaryLines).toContain("JAS-1 waits, and its comment would be created:");
    expect(summaryLines).toContain(`- ${OUT_OF_TRIES}`);
  });

  it("warns in the log about a ticket out of tries, and not about one that waits for another reason", async () => {
    const old = comment("c1", START_LINE, "2026-11-01T06:00:00.000Z");
    const read = snapshot({ issues: [issue("JAS-1"), issue("JAS-2", { priority: 0 })], comments: { "JAS-1": [old, { ...old, id: "c2" }] } });
    const { effects, lines } = recorder();
    await runRound(planRound(read, AT_0630, RUN), { dryRun: false }, effects);
    expect(lines.filter((line) => line.startsWith("::warning"))).toEqual([
      "::warning title=Ticket out of tries::The queue has started JAS-1 2 times, so it won't start it again unless Jasper deletes one of its start comments.",
    ]);
  });

  it("doesn't move an out-of-tries blocker back to Ready for the ticket it blocks", () => {
    const old = comment("c1", START_LINE, "2026-11-01T06:00:00.000Z");
    const read = snapshot({
      issues: [issue("JAS-1", { blockedBy: ["JAS-9"] }), issue("JAS-9", { status: "Todo" })],
      comments: { "JAS-9": [old, { ...old, id: "c2" }] },
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.promote).toEqual([]);
    expect(plan.start).toEqual([]);
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-1", ["It waits for JAS-9, which the queue has already tried 2 times, which is the limit, so it won't start again unless Jasper gives it another try."]],
    ]);
  });

  it("tries the next ticket as Vercel's test, not the one out of tries", () => {
    const old = comment("c1", START_LINE, "2026-11-01T06:00:00.000Z");
    const read = snapshot({ issues: [issue("JAS-1"), issue("JAS-2")], statuses: [refusal("2026-11-02T05:00:00Z")], comments: { "JAS-1": [old, { ...old, id: "c2" }] } });
    expect(planRound(read, AT_0630, RUN).start.map((ticket) => ticket.id)).toEqual(["JAS-2"]);
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

describe("In Progress", () => {
  const inProgress = (...bodies: string[]) => {
    const pulls = bodies.map((body, i) => pull(9 + i, `claude/jas-5-${i}`, body));
    return runningTickets(snapshot({ issues: [issue("JAS-5", { status: "In Progress" })], pulls }), AT_0630);
  };
  const JASPER_MERGES = "**Ready to merge:** no: Jasper merges this one by hand.";

  it("counts as running with no PR yet, or while any of its PRs isn't finished", () => {
    expect(inProgress()).toEqual([{ id: "JAS-5", why: "it's In Progress" }]);
    expect(inProgress("**Ready to merge:** no")).toEqual([{ id: "JAS-5", why: "it's In Progress" }]);
    expect(inProgress(JASPER_MERGES, "**Ready to merge:** no")).toEqual([{ id: "JAS-5", why: "it's In Progress" }]);
  });

  it("doesn't count once every PR is marked ready at its head or left for Jasper", () => {
    expect(inProgress("**Ready to merge:** yes at 4d2a4fe")).toEqual([]);
    expect(inProgress(JASPER_MERGES)).toEqual([]);
    expect(inProgress(JASPER_MERGES, "**Ready to merge:** yes at 4d2a4fe")).toEqual([]);
  });

  it("gives a finished PR's slot to another ticket, while that PR's files stay held", () => {
    const read = snapshot({
      issues: [
        issue("JAS-1"),
        issue("JAS-2"),
        issue("JAS-3"),
        issue("JAS-4"),
        issue("JAS-5", { status: "In Progress" }),
        issue("JAS-6", { description: "**Touches.** `src/JAS-5.ts`" }),
      ],
      pulls: [pull(9, "claude/jas-5-x", JASPER_MERGES)],
      files: { 9: [{ filename: "src/JAS-5.ts" }] },
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.running).toEqual([]);
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-1", "JAS-2", "JAS-3", "JAS-4"]);
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([["JAS-6", ["It touches `src/JAS-5.ts`, which PR 9 changes."]]]);
  });
});

describe("a dry run", () => {
  it("says it would move a written-up blocker to Ready, and writes nothing", async () => {
    const read = snapshot({ issues: [issue("JAS-1", { blockedBy: ["JAS-9"] }), issue("JAS-9", { status: "Todo" })] });
    const { effects, summaryLines } = dryEffects();
    expect(await runRound(planRound(read, AT_0630, RUN), { dryRun: true }, effects)).toEqual({ failed: false });
    expect(summaryLines).toContain("Would move JAS-9 to Ready and rate it High, with a comment.");
  });

  it("gets writes and a fire that throw, so a mistake can't change Linear or start a builder", async () => {
    const writes = dryRunEffects();
    const refused = "A dry run tried to change Linear or start a builder, so the queue stopped.";
    await expect(writes.promote("uuid-JAS-9", 2, true)).rejects.toThrow(refused);
    await expect(writes.createComment("uuid-JAS-9", "x")).rejects.toThrow(refused);
    await expect(writes.updateComment("c1", "x")).rejects.toThrow(refused);
    await expect(writes.fire("JAS-9")).rejects.toThrow(refused);
  });

  it("says what it would start and why each other ticket waits, and touches nothing", async () => {
    const read = snapshot({ issues: [issue("JAS-1"), issue("JAS-2", { priority: 0 })] });
    const { effects, summaryLines } = dryEffects();
    await runRound(planRound(read, AT_0630, RUN), { dryRun: true }, effects);
    expect(summaryLines).toContain("Would start a builder on JAS-1.");
    expect(summaryLines.slice(-2)).toEqual(["JAS-2 waits, and its comment would be created:", "- It has no Priority."]);
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

  // Nothing runs at the hour by itself, since GitHub may not run the schedule.
  it("after a 429, doesn't promise a run an hour from now", async () => {
    const { effects, lines } = recorder(() => ({ kind: "refused", status: 429, why: "rate_limit_error: slow down" }));
    await runRound(two(), { dryRun: false }, effects);
    const warning = lines.find((line) => line.startsWith("::warning title=Builder start refused::"));
    expect(warning).toContain("The first run after an hour tries again, whenever something wakes the queue.");
    expect(warning).not.toContain("A run an hour from now");
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
    const why = "Vercel refused a deploy at 2026-11-02 05:00 UTC, and JAS-1 has a builder running, so nothing else starts until it finishes or a preview deploys. If that builder has died, a run by name (/run-queue) starts one test.";
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-2", [why]],
      ["JAS-3", [why]],
    ]);
  });

  // A builder that died leaves its ticket In Progress, which holds new tests for
  // good, so a person needs a way past it. Only one test starts, as ever.
  it("lets a run by name past a running builder to start one test", () => {
    const read = snapshot({ issues: [issue("JAS-1", { status: "In Progress" }), issue("JAS-2"), issue("JAS-3")], statuses: [refusal("2026-11-02T05:00:00Z")] });
    expect(planRound(read, AT_0630, RUN).start).toEqual([]);
    const plan = planRound(read, AT_0630, RUN, { byName: true });
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-2"]);
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-3", ["Vercel refused a deploy at 2026-11-02 05:00 UTC, so only JAS-2 starts this round, as a test, until a preview deploys."]],
    ]);
  });

  it("starts no second test while the first one's start comment holds", () => {
    const testStarted = three({ "JAS-9": [comment("c9", START_LINE, "2026-11-02T06:10:00.000Z")] });
    const plan = planRound({ ...testStarted, issues: [...testStarted.issues, issue("JAS-9", { status: "In Progress" })] }, AT_0630, RUN);
    expect(plan.start).toEqual([]);
    expect(plan.waits.map((wait) => wait.id)).toEqual(["JAS-1", "JAS-2", "JAS-3"]);
  });

  // The test's own push is refused at 07:15, which moves Vercel's newest
  // refusal past its start comment from 07:05.
  it("starts no second test when the first test's own push is refused", () => {
    const read = snapshot({
      issues: [issue("JAS-1", { status: "In Progress" }), issue("JAS-2")],
      statuses: [refusal("2026-11-02T06:00:00Z"), refusal("2026-11-02T07:15:00Z")],
      comments: { "JAS-1": [comment("c1", START_LINE, "2026-11-02T07:05:00.000Z")] },
    });
    const plan = planRound(read, new Date("2026-11-02T08:20:00Z"), RUN);
    expect(plan.vercel).toEqual({ kind: "testing", since: "2026-11-02T07:15:00Z" });
    expect(plan.start).toEqual([]);
    expect(plan.waits.map((wait) => wait.why)).toEqual([
      ["Vercel refused a deploy at 2026-11-02 07:15 UTC, and JAS-1 has a builder running, so nothing else starts until it finishes or a preview deploys. If that builder has died, a run by name (/run-queue) starts one test."],
    ]);
  });

  it("warns in the log when a running builder holds the test, but not on a run by name or with nothing to start", async () => {
    const statuses = [refusal("2026-11-02T05:00:00Z")];
    const stalled = snapshot({ issues: [issue("JAS-1", { status: "In Progress" }), issue("JAS-2")], statuses });
    const warnings = async (read: Snapshot, byName = false) => {
      const { effects, lines } = recorder();
      await runRound(planRound(read, AT_0630, RUN, { byName }), { dryRun: false }, effects);
      return lines.filter((line) => line.startsWith("::warning"));
    };
    expect(await warnings(stalled)).toEqual([
      "::warning title=Queue held in test mode::Vercel refused a deploy at 2026-11-02 05:00 UTC, and JAS-1 has a builder running, so nothing else starts until it finishes or a preview deploys. If that builder has died, a run by name (/run-queue) starts one test.",
    ]);
    expect(await warnings(stalled, true)).toEqual([]);
    expect(await warnings(snapshot({ issues: [issue("JAS-1", { status: "In Progress" })], statuses }))).toEqual([]);
  });

  it.each<[string, Partial<Snapshot>, string]>([
    [
      "a running builder in test mode",
      { issues: [issue("JAS-1", { status: "In Progress" }), issue("JAS-2")], statuses: [refusal("2026-11-02T05:00:00Z")] },
      "Vercel refused a deploy at 2026-11-02 05:00 UTC, and JAS-1 has a builder running, so nothing else starts until it finishes or a preview deploys. If that builder has died, a run by name (/run-queue) starts one test.",
    ],
    [
      "a blocked account",
      { issues: [issue("JAS-2")], statuses: [vercel("failure", "Account is blocked.", "2026-11-02T05:00:00Z")] },
      "Vercel blocked the account at 2026-11-02 05:00 UTC, which only Jasper can fix, so nothing starts on its own until a deploy succeeds. A run by name (/run-queue) starts one test.",
    ],
    [
      "a refused start",
      { issues: [issue("JAS-2")], comments: { "JAS-2": [comment("c1", refusedBody(429, "slow down"), "2026-11-02T06:00:00.000Z")] } },
      "The cloud task refused a start at 2026-11-02 06:00 UTC with HTTP 429, so nothing starts on its own until 2026-11-02 07:00 UTC. A run by name (/run-queue) tries again sooner.",
    ],
  ])("tells a dry run by name that an automatic run would start nothing, with %s", async (_, read, why) => {
    const plan = planRound(snapshot(read), AT_0630, RUN, { byName: true });
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-2"]);
    const { effects, summaryLines } = dryEffects();
    await runRound(plan, { dryRun: true }, effects);
    expect(summaryLines).toContain(`An automatic run would start nothing. ${why}`);
  });

  it("says nothing about automatic runs with no hold, with no ticket to start, or on a real run by name", async () => {
    const said = (lines: string[]) => lines.filter((line) => line.startsWith("An automatic run"));
    const dry = async (read: Snapshot) => {
      const { effects, summaryLines } = dryEffects();
      await runRound(planRound(read, AT_0630, RUN, { byName: true }), { dryRun: true }, effects);
      return said(summaryLines);
    };
    expect(await dry(snapshot({ issues: [issue("JAS-2")] }))).toEqual([]);
    expect(await dry(snapshot({ issues: [issue("JAS-1", { status: "In Progress" })], statuses: [refusal("2026-11-02T05:00:00Z")] }))).toEqual([]);
    const { effects, lines } = recorder();
    const stalled = snapshot({ issues: [issue("JAS-1", { status: "In Progress" }), issue("JAS-2")], statuses: [refusal("2026-11-02T05:00:00Z")] });
    await runRound(planRound(stalled, AT_0630, RUN, { byName: true }), { dryRun: false }, effects);
    expect(said(lines)).toEqual([]);
  });

  // A builder with no files never pushes, so no preview comes.
  it("takes a ticket with files as the test, ahead of a higher one with none", () => {
    const read = snapshot({
      issues: [issue("JAS-1", { priority: 2, description: "**Touches.** None." }), issue("JAS-2"), issue("JAS-3")],
      statuses: [refusal("2026-11-02T05:00:00Z")],
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-2"]);
    const why = "Vercel refused a deploy at 2026-11-02 05:00 UTC, so only JAS-2 starts this round, as a test, until a preview deploys.";
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-1", [why]],
      ["JAS-3", [why]],
    ]);
  });

  it("starts a ticket with no files when no other is waiting, and says it shows nothing", () => {
    const read = snapshot({
      issues: [issue("JAS-1", { description: "**Touches.** None." }), issue("JAS-2", { description: "**Touches.** None." })],
      statuses: [refusal("2026-11-02T05:00:00Z")],
    });
    const plan = planRound(read, AT_0630, RUN);
    expect(plan.start.map((ticket) => ticket.id)).toEqual(["JAS-1"]);
    expect(plan.waits.map((wait) => [wait.id, wait.why])).toEqual([
      ["JAS-2", ["Vercel refused a deploy at 2026-11-02 05:00 UTC, so only JAS-1 starts this round. It changes no files, so it deploys nothing and can't show whether Vercel deploys again."]],
    ]);
  });

  it("starts no test beside a builder someone started by hand", () => {
    const read = snapshot({ issues: [issue("JAS-1", { status: "In Progress" }), issue("JAS-2")], statuses: [refusal("2026-11-02T05:00:00Z")] });
    expect(planRound(read, AT_0630, RUN).start).toEqual([]);
  });

  it("starts the next test once the first test's builder has finished", () => {
    const read = snapshot({ issues: [issue("JAS-1", { status: "In Review" }), issue("JAS-2")], statuses: [refusal("2026-11-02T05:00:00Z")] });
    expect(planRound(read, AT_0630, RUN).start.map((ticket) => ticket.id)).toEqual(["JAS-2"]);
  });

  it("keeps to one builder through a day of refused pushes, however many rounds run", async () => {
    let now = new Date("2026-11-02T06:00:00Z");
    const store = linearStore(() => now);
    const statuses = [refusal(now.toISOString())];
    const ids = ["JAS-1", "JAS-2", "JAS-3", "JAS-4", "JAS-5", "JAS-6"];
    for (let round = 1; round <= 96; round++) {
      now = new Date(now.getTime() + 15 * 60 * 1000);
      const started = store.fired.length;
      // Every builder is still working, so its ticket stays In Progress.
      const issues = ids.map((id) => issue(id, { status: store.fired.includes(id) ? "In Progress" : "Ready" }));
      await runRound(planRound(store.read(issues, { statuses }), now, RUN), { dryRun: false }, store.effects);
      // A builder's push comes 10 minutes after it starts, and Vercel refuses it.
      if (store.fired.length > started) statuses.push(refusal(new Date(now.getTime() + 10 * 60 * 1000).toISOString()));
    }
    expect(store.fired).toEqual(["JAS-1"]);
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
      "needs.merged.outputs.wake == 'true')",
    ]);
    expect(queue).toContain("    needs: merged");
    expect(code.filter((line) => /\bif:/.test(line))).toHaveLength(2);
    expect(condition(queue).join(" ")).not.toContain("schedule");
  });

  it("runs the merged job only when Agent merge finished, so a workflow_run starts the queue only when that job says so", () => {
    expect(condition(merged)).toEqual(["github.event_name == 'workflow_run' &&", "github.event.workflow_run.conclusion != 'skipped'"]);
    expect(merged.map((line) => line.trim())).toContain("wake: ${{ steps.main.outputs.wake }}");
  });

  // A Windows computer may have no bash, or one that can't run this. CI has one.
  const hasBash = /^\d{4}-/.test(spawnSync("bash", ["-c", "date -u -d '15 minutes ago' +%FT%TZ"], { encoding: "utf8" }).stdout ?? "");

  describe.runIf(hasBash)("the merged job's script", () => {
    const MAIN = `repos/${REPO}/commits/main`;
    const LAST_RUN = `repos/${REPO}/deployments?environment=run-queue&per_page=1`;
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const MAIN_IS_OLD = minutesAgo(300);

    // Runs the job's own lines under bash -e, as GitHub does, with a gh that
    // answers as GitHub would and says on stderr which path it was asked for.
    // Agent merge started 2 minutes ago.
    function mergedJob(committed: string, lastRun: string) {
      const body = merged.slice(merged.findIndex((line) => line.trim() === "run: |") + 1);
      const gh = `gh() { echo "$2" >&2; case "$2" in */deployments*) echo "${lastRun}";; *) echo "${committed}";; esac; }`;
      const setup = `GH_REPO=${REPO}; STARTED=${minutesAgo(2)}; GITHUB_OUTPUT=$(mktemp)`;
      const { stdout, stderr } = spawnSync("bash", ["-e", "-c", [gh, setup, ...body, 'cat "$GITHUB_OUTPUT"'].join("\n")], { encoding: "utf8" });
      return { wake: stdout.match(/^wake=(.*)$/m)?.[1], asked: stderr.trim().split("\n") };
    }

    it("wakes the queue when main moved after Agent merge started, for one call", () => {
      expect(mergedJob(minutesAgo(1), minutesAgo(1))).toEqual({ wake: "true", asked: [MAIN] });
    });

    it("wakes the queue when main didn't move and its last real run is over 15 minutes old", () => {
      expect(mergedJob(MAIN_IS_OLD, minutesAgo(16))).toEqual({ wake: "true", asked: [MAIN, LAST_RUN] });
    });

    it("leaves the queue alone when main didn't move and it ran under 15 minutes ago", () => {
      expect(mergedJob(MAIN_IS_OLD, minutesAgo(14))).toEqual({ wake: "false", asked: [MAIN, LAST_RUN] });
    });

    // A push or a run by name makes the first deployment. If the queue job
    // never made one, waking on none would run the queue on every wake.
    it("leaves the queue alone when no real run has made a deployment yet", () => {
      expect(mergedJob(MAIN_IS_OLD, "")).toEqual({ wake: "false", asked: [MAIN, LAST_RUN] });
    });
  });

  // npm 11 runs a file from package.json's directories.bin ahead of
  // node_modules/.bin, which the install guard above doesn't look for.
  it("never runs npx, which could run a file package.json names", () => {
    expect(code.filter((line) => /\bnpx\b/.test(line))).toEqual([]);
  });

  it("reads the queue's last run from the environment the queue job runs in", () => {
    expect(queue).toContain("    environment: run-queue");
    expect(merged.join("\n")).toContain("deployments?environment=run-queue&per_page=1");
  });

  it("asks for nothing by default, and only reading on each job", () => {
    expect(code).toContain("permissions: {}");
    expect(code.filter((line) => /permissions:/.test(line))).toHaveLength(3);
    const mergedAt = merged.indexOf("    permissions:");
    expect(merged.slice(mergedAt + 1, mergedAt + 4).map((line) => line.trim())).toEqual(["contents: read", "deployments: read", "outputs:"]);
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
      "- run: rm -rf .npmrc npm-shrinkwrap.json && npm ci --ignore-scripts",
      "- run: ./node_modules/.bin/tsx scripts/run-queue.ts",
    ]);
    expect(queue.filter((line) => /^\s*(ref|repository|path|token|cache|persist-credentials|package-manager-cache):/.test(line)).map((line) => line.trim())).toEqual([
      "ref: main",
      "persist-credentials: false",
      "package-manager-cache: false",
    ]);
  });

  // Claude can merge package.json, .npmrc and tsconfig.json after the panel, and
  // this job holds both secrets, so it needs Agent merge's guards (decision
  // record 0032). A merged config file could otherwise run code beside them.
  it("refuses the files that would change what the queue loads, with Agent merge's own check", () => {
    const guard = (path: string) => {
      const text = source(path);
      const start = text.indexOf("node -e '");
      expect(start).toBeGreaterThan(-1);
      return text.slice(start, text.indexOf("          '\n", start));
    };
    expect(guard(".github/workflows/run-queue.yml")).toBe(guard(".github/workflows/agent-merge.yml"));
    const steps = queue.map((line) => line.trim());
    const refuse = steps.indexOf("- name: Refuse files that would change what the queue loads");
    expect(refuse).toBeGreaterThan(-1);
    expect(refuse).toBeLessThan(steps.indexOf("- run: rm -rf .npmrc npm-shrinkwrap.json && npm ci --ignore-scripts"));
    expect(steps).toContain("TSX_TSCONFIG_PATH: scripts/can-merge.tsconfig.json");
  });

  it("runs the queue job in the run-queue environment, which holds the two secrets, and the merged job in none", () => {
    expect(queue).toContain("    environment: run-queue");
    expect(merged.filter((line) => /\benvironment:/.test(line))).toEqual([]);
  });

  it("names the two secrets only in the last step, and gives a dry run no task token", () => {
    const secrets = code.filter((line) => line.includes("secrets."));
    expect(secrets.map((line) => line.trim())).toEqual([
      "LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}",
      "RUN_QUEUE_TASK_TOKEN: ${{ !inputs.dry_run && secrets.RUN_QUEUE_TASK_TOKEN || '' }}",
    ]);
    const lastStep = code.indexOf("      - run: ./node_modules/.bin/tsx scripts/run-queue.ts");
    expect(lastStep).toBeGreaterThan(-1);
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
    expect(script.filter((line) => /^\s*(- )?run:/.test(line))).toHaveLength(4);
    expect(script.map((line) => line.trim())).toContain('if [[ "$committed" > "$STARTED" ]]; then');
    expect(script.some((line) => line.includes("${{"))).toBe(false);
    expect(merged.map((line) => line.trim())).toContain("STARTED: ${{ github.event.workflow_run.run_started_at }}");
  });
});

describe("scripts/run-queue.ts", () => {
  const code = source("scripts/run-queue.ts");
  const lines = code.split("\n");

  it("hands a dry run writes and a fire that throw, not Linear's or the cloud task's", () => {
    expect(code).toContain("const writes = dryRun ? dryRunEffects() : { ...linearWrites(linear, snapshot.readyStateId), fire };");
    expect(code.match(/linearWrites\(/g)).toHaveLength(1);
  });

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

  it("tells the round when Jasper started the run by name, so his try after a fix doesn't wait out a refusal", () => {
    expect(code).toContain("GITHUB_EVENT_NAME: eventName");
    expect(lines.filter((line) => line.includes("planRound(")).map((line) => line.trim())).toEqual([
      'const plan = planRound(snapshot, new Date(), runUrl, { byName: eventName === "workflow_dispatch" });',
    ]);
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

  it("says, with the workflow and the decision record, that a schedule that doesn't fire leaves the timed waits to the next wake or a person", () => {
    const workflow = source(".github/workflows/run-queue.yml");
    const record = source("docs/adr/0026-a-script-picks-tickets-and-an-action-starts-builders.md");
    for (const text of [skill, workflow, record]) expect(text).toContain("next wake or a person");
  });
});

describe(".github/ISSUE_TEMPLATE/feature.md", () => {
  // Backticks on this line would make a ticket nobody filled in hold those
  // words as files, and start.
  it("says a ticket that changes no files writes None, and its own line can't start a ticket", () => {
    const touches = source(".github/ISSUE_TEMPLATE/feature.md").split("\n").find((line) => line.startsWith("**Touches.**")) ?? "";
    expect(touches).toContain("writes None");
    expect(parseTouches(touches)).toEqual({ why: "its Touches line names no files in backticks" });
  });

  it("gives the None rule in the same words as the code and the docs", () => {
    const rule = "A ticket that changes no files writes None or None., with any reason on its own line and no backtick or / in it.";
    const flat = (path: string) => source(path).replace(/\n\s*\/\/ /g, " ");
    for (const path of ["scripts/run-queue-pick.ts", ".github/ISSUE_TEMPLATE/feature.md", ".claude/skills/run-queue/SKILL.md", "GLOSSARY.md", "docs/agents/issue-tracker.md"]) {
      expect(flat(path), path).toContain(rule);
    }
  });
});
