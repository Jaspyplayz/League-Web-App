// The half of the ticket queue that reads Linear and GitHub and carries out a
// round (JAS-144, decision record 0026). scripts/run-queue-pick.ts decides
// which tickets start; this turns Linear's and GitHub's answers into what the
// picker reads, plans the round around its picks, and carries the plan out.
// It never fetches anything itself: scripts/run-queue.ts passes in the calls
// to Linear, GitHub and the cloud task, so the tests run all of it on saved
// answers (scripts/run-queue-fixtures/) and fakes.

import { z } from "zod";
import { OpenPulls, READY_LABEL, readyToMerge, type OpenPull } from "./can-merge-action-steps";
import { field } from "./can-merge-gates";
import { CEILING, pickTickets, type OpenPr, type Status, type Ticket } from "./run-queue-pick";

/** How long the queue's start comment holds a ticket. It matches JAS-29's stall rule; JAS-145 handles the stall. */
export const START_HOLDS_FOR_MS = 2 * 60 * 60 * 1000;
/**
 * How long nothing starts after Vercel refuses a deploy, or the cloud task's
 * hourly fire limit (HTTP 429) refuses a start. After a Vercel refusal, one
 * ticket then starts as a test.
 */
export const REFUSAL_HOLDS_FOR_MS = 60 * 60 * 1000;
/**
 * How long automatic runs start nothing after any other refused start, such
 * as a revoked token, which only Jasper can fix. A run by name tries sooner.
 */
export const JASPER_REFUSAL_HOLDS_FOR_MS = 24 * 60 * 60 * 1000;

const PROJECT = "Turnpoint";
const MAX_BLOCKER_ROUNDS = 10;
const FINISHED: readonly Status[] = ["Done", "Canceled", "Duplicate"];
// A builder moves its ticket to In Progress, then In Review, and from then on
// the status says whether it's still working, so a builder that finished in
// 40 minutes frees its slot. Before that, the queue's start comment holds it.
const BEFORE_BUILDER: readonly Status[] = ["Backlog", "Todo", "Ready"];
const TICKET_ID = /^JAS-\d+$/;

// Linear refuses a query over 10,000 complexity points, and each ticket's 20
// labels and 20 relations multiply its cost, so one answer holds 25 tickets.
const TICKETS_PER_PAGE = 25;

// The GraphQL documents the queue sends, checked against Linear's published schema.
const QUEUE_ISSUE =
  "fragment QueueIssue on Issue { id identifier title description createdAt priority state { name } project { name } assignee { id } labels(first: 20) { pageInfo { hasNextPage } nodes { name } } children(first: 1) { nodes { id } } inverseRelations(first: 20) { pageInfo { hasNextPage } nodes { type issue { id identifier } } } }";
export const QUEUE_QUERY = `query Queue($after: String) { viewer { id } issues(first: ${TICKETS_PER_PAGE}, after: $after, filter: { team: { key: { eq: "JAS" } }, project: { name: { eq: "Turnpoint" } }, state: { name: { in: ["Ready", "In Progress", "In Review"] } } }) { pageInfo { hasNextPage endCursor } nodes { ...QueueIssue } } }
${QUEUE_ISSUE}`;
export const ISSUES_QUERY = `query Issues($ids: [ID!]) { issues(first: ${TICKETS_PER_PAGE}, filter: { id: { in: $ids } }) { nodes { ...QueueIssue } } }
${QUEUE_ISSUE}`;
export const COMMENTS_QUERY =
  "query Comments($id: String!, $after: String) { issue(id: $id) { comments(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id body createdAt } } } }";
export const STATES_QUERY = `query States { teams(filter: { key: { eq: "JAS" } }) { nodes { states { nodes { id name } } } } }`;
export const COMMENT_CREATE =
  "mutation CommentCreate($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id } } }";
export const COMMENT_UPDATE =
  "mutation CommentUpdate($id: String!, $body: String!) { commentUpdate(id: $id, input: { body: $body }) { success } }";
export const ISSUE_MOVE =
  "mutation IssueMove($id: String!, $stateId: String!, $priority: Int!) { issueUpdate(id: $id, input: { stateId: $stateId, priority: $priority }) { success } }";
export const ISSUE_RATE = "mutation IssueRate($id: String!, $priority: Int!) { issueUpdate(id: $id, input: { priority: $priority }) { success } }";

const STATUSES = ["Backlog", "Todo", "Ready", "In Progress", "In Review", "Done", "Canceled", "Duplicate"] as const satisfies readonly Status[];
const HasNextPage = z.object({ hasNextPage: z.boolean() });

// One ticket, as the QueueIssue fragment asks for it.
export const LinearIssue = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  priority: z.number().int().min(0).max(4),
  // A status the picker doesn't know stops the run here, before it's misread.
  state: z.object({ name: z.enum(STATUSES) }),
  project: z.object({ name: z.string() }).nullable(),
  assignee: z.object({ id: z.string() }).nullable(),
  labels: z.object({ pageInfo: HasNextPage, nodes: z.array(z.object({ name: z.string() })) }),
  children: z.object({ nodes: z.array(z.object({ id: z.string() })) }),
  // Relations other tickets made to this one. A "blocks" one names a blocker.
  inverseRelations: z.object({
    pageInfo: HasNextPage,
    nodes: z.array(z.object({ type: z.string(), issue: z.object({ id: z.string(), identifier: z.string() }) })),
  }),
});
export type LinearIssue = z.infer<typeof LinearIssue>;

export const LinearComment = z.object({ id: z.string(), body: z.string(), createdAt: z.iso.datetime() });
export type LinearComment = z.infer<typeof LinearComment>;

const PageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const QueueAnswer = z.object({
  viewer: z.object({ id: z.string() }),
  issues: z.object({ pageInfo: PageInfo, nodes: z.array(LinearIssue) }),
});
const IssuesAnswer = z.object({ issues: z.object({ nodes: z.array(LinearIssue) }) });
const CommentsAnswer = z.object({
  issue: z.object({ comments: z.object({ pageInfo: PageInfo, nodes: z.array(LinearComment) }) }),
});
const StatesAnswer = z.object({
  teams: z.object({ nodes: z.array(z.object({ states: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string() })) }) })) }),
});
const Success = z.object({ success: z.boolean() });
const CommentCreated = z.object({ commentCreate: Success.extend({ comment: z.object({ id: z.string() }).nullable() }) });

// GET repos/{owner}/{repo}/pulls/{n}/files. A renamed file also has its old path.
export const PullFile = z.object({ filename: z.string(), previous_filename: z.string().optional() });
export type PullFile = z.infer<typeof PullFile>;

// One entry of GET repos/{owner}/{repo}/commits/{sha}/status: the latest
// status of each name on that commit. Vercel's is named "Vercel".
export const CommitStatus = z.object({
  context: z.string(),
  state: z.string(),
  description: z.string().nullable(),
  updated_at: z.iso.datetime(),
});
export type CommitStatus = z.infer<typeof CommitStatus>;

/** Everything one round reads from Linear and GitHub. */
export type Snapshot = {
  /** Linear's viewer: Jasper, who owns the API key. */
  viewerId: string;
  /** Team JAS's Ready status, where a promoted blocker moves. */
  readyStateId: string;
  /** The Queue query's answer, plus every blocker fetched by ID, each once. */
  issues: LinearIssue[];
  /** Every comment on each Turnpoint ticket that isn't finished, by ticket ID. */
  comments: Record<string, LinearComment[]>;
  pulls: OpenPull[];
  files: Record<number, PullFile[]>;
  /** The statuses on main's head and on each open PR's head. */
  statuses: CommitStatus[];
};

/** Sends one GraphQL request to Linear and returns its whole JSON answer. */
export type LinearCall = (query: string, variables: Record<string, unknown>) => Promise<unknown>;
/** `gh api --paginate --slurp <path>`: every page of GitHub's answer, in one array. */
export type GitHubCall = (path: string) => unknown;

// A Linear answer with errors throws, so the run goes red instead of going on
// with half an answer. Linear's message is outside text, so it's kept to one line.
function linearData<T extends z.ZodType>(name: string, schema: T, answer: unknown): z.output<T> {
  const { data, errors } = z.object({ data: z.unknown().optional(), errors: z.array(z.object({ message: z.string() })).optional() }).parse(answer);
  if (errors && errors.length > 0) {
    throw new Error(`Linear refused the ${name} request: ${oneLine(errors.map((error) => error.message).join("; "), 300)}`);
  }
  return schema.parse(data);
}

// The cursor for the next page, or null after the last one.
function nextCursor(page: z.infer<typeof PageInfo>): string | null {
  if (!page.hasNextPage) return null;
  if (!page.endCursor) throw new Error("Linear said there's another page but gave no cursor for it.");
  return page.endCursor;
}

const blockersOf = (issue: LinearIssue) => issue.inverseRelations.nodes.filter((relation) => relation.type === "blocks").map((relation) => relation.issue);
const inTurnpoint = (issue: LinearIssue) => issue.project?.name === PROJECT;

export async function readSnapshot(repo: string, linear: LinearCall, github: GitHubCall): Promise<Snapshot> {
  const issues: LinearIssue[] = [];
  let viewerId = "";
  let after: string | null = null;
  do {
    const page = linearData("Queue", QueueAnswer, await linear(QUEUE_QUERY, { after }));
    viewerId = page.viewer.id;
    issues.push(...page.issues.nodes);
    after = nextCursor(page.issues.pageInfo);
  } while (after);

  // A blocker can be in any status or project, so it's fetched by ID, and so
  // are its own blockers, so a chain can move to Ready in one round. Each ID
  // is asked for once: one Linear doesn't return (deleted, or archived) is
  // left out, and the picker says it couldn't read it.
  const asked = new Set(issues.map((issue) => issue.id));
  for (let round = 1; ; round++) {
    const missing = [...new Set(issues.flatMap(blockersOf).map((blocker) => blocker.id))].filter((id) => !asked.has(id));
    if (missing.length === 0) break;
    if (round > MAX_BLOCKER_ROUNDS) throw new Error(`A chain of blockers runs more than ${MAX_BLOCKER_ROUNDS} tickets deep, so the queue stopped reading it.`);
    for (let i = 0; i < missing.length; i += TICKETS_PER_PAGE) {
      const ids = missing.slice(i, i + TICKETS_PER_PAGE);
      for (const id of ids) asked.add(id);
      const found = linearData("Issues", IssuesAnswer, await linear(ISSUES_QUERY, { ids }));
      issues.push(...found.issues.nodes.filter((issue) => ids.includes(issue.id)));
    }
  }

  // A label or relation past the first 20 goes unread, and a missed blocker
  // or wayfinder: label would start a ticket that shouldn't start.
  for (const issue of issues) {
    if (issue.labels.pageInfo.hasNextPage) throw new Error(`${issue.identifier} has more than 20 labels, which the queue doesn't read.`);
    if (issue.inverseRelations.pageInfo.hasNextPage) throw new Error(`${issue.identifier} has more than 20 relations, which the queue doesn't read.`);
  }

  // Comments matter only on the tickets the queue could start or comment on.
  const comments: Record<string, LinearComment[]> = {};
  for (const issue of issues) {
    if (inTurnpoint(issue) && !FINISHED.includes(issue.state.name)) comments[issue.identifier] = await readComments(linear, issue.id);
  }

  const { teams } = linearData("States", StatesAnswer, await linear(STATES_QUERY, {}));
  const ready = teams.nodes.flatMap((team) => team.states.nodes).filter((state) => state.name === "Ready");
  if (teams.nodes.length !== 1 || ready.length !== 1) throw new Error("Linear should have one team JAS with one Ready status.");

  // Anyone can open a PR from a fork on a claude/jas-<n>- branch, which could
  // mark a ticket running or hold files and stall the queue, so only this
  // repo's own branches count, as in can-merge's pullsOnBranch.
  const pulls = z
    .array(OpenPulls)
    .parse(github(`repos/${repo}/pulls?state=open&per_page=100`))
    .flat()
    .filter((pull) => pull.head.repo?.full_name === repo);
  const files: Record<number, PullFile[]> = {};
  for (const pull of pulls) {
    files[pull.number] = z.array(z.array(PullFile)).parse(github(`repos/${repo}/pulls/${pull.number}/files?per_page=100`)).flat();
  }
  const [main] = z.array(z.object({ sha: z.string() })).min(1).parse(github(`repos/${repo}/commits/main`));
  const statuses = [...new Set([main.sha, ...pulls.map((pull) => pull.head.sha)])].flatMap((sha) =>
    z
      .array(z.object({ statuses: z.array(CommitStatus) }))
      .parse(github(`repos/${repo}/commits/${sha}/status?per_page=100`))
      .flatMap((page) => page.statuses),
  );

  return { viewerId, readyStateId: ready[0].id, issues, comments, pulls, files, statuses };
}

async function readComments(linear: LinearCall, issueId: string): Promise<LinearComment[]> {
  const comments: LinearComment[] = [];
  let after: string | null = null;
  do {
    const { issue } = linearData("Comments", CommentsAnswer, await linear(COMMENTS_QUERY, { id: issueId, after }));
    comments.push(...issue.comments.nodes);
    after = nextCursor(issue.comments.pageInfo);
  } while (after);
  return comments;
}

const PRIORITIES = [null, "Urgent", "High", "Medium", "Low"] as const;

export function toTicket(issue: LinearIssue, viewerId: string): Ticket {
  return {
    id: issue.identifier,
    title: issue.title,
    status: issue.state.name,
    priority: PRIORITIES[issue.priority],
    createdAt: issue.createdAt,
    description: issue.description ?? "",
    blockedBy: blockersOf(issue).map((blocker) => blocker.identifier),
    labels: issue.labels.nodes.map((label) => label.name),
    assignedToJasper: issue.assignee?.id === viewerId,
    hasSubTickets: issue.children.nodes.length > 0,
  };
}

/** The ticket a builder's `claude/jas-<n>-...` branch builds, or null for any other branch. */
export function ticketOfBranch(ref: string): string | null {
  const number = ref.match(/^claude\/jas-(\d+)-/i)?.[1];
  return number ? `JAS-${Number(number)}` : null;
}

export function toOpenPrs(pulls: OpenPull[], files: Record<number, PullFile[]>): OpenPr[] {
  return pulls.map((pull) => {
    const changed = files[pull.number];
    // With no file list, the PR would hold no files, and a clash could start.
    if (!changed) throw new Error(`The queue has no file list for PR ${pull.number}.`);
    return {
      number: pull.number,
      ticket: ticketOfBranch(pull.head.ref),
      files: changed.flatMap((file) => (file.previous_filename ? [file.filename, file.previous_filename] : [file.filename])),
    };
  });
}

// A PR whose builder is done with it: marked ready at its head, or left for
// Jasper to merge (`**Ready to merge:** no: Jasper merges ...`).
function builderDone(pull: OpenPull): boolean {
  if (readyToMerge(pull.body, pull.head.sha).ready) return true;
  const line = field(pull.body ?? "", READY_LABEL);
  return "value" in line && /^no: Jasper merges\b/i.test(line.value);
}

// Each Turnpoint ticket's newest start comment from the queue under 2 hours
// old, since its builder may not have moved it to In Progress yet. A finished
// ticket has no builder left, and a refused start's comment no longer starts
// with START_LINE, so neither holds.
function heldStarts(snapshot: Snapshot, now: Date): Map<string, string> {
  const held = new Map<string, string>();
  for (const issue of snapshot.issues) {
    if (!inTurnpoint(issue) || FINISHED.includes(issue.state.name)) continue;
    for (const comment of snapshot.comments[issue.identifier] ?? []) {
      const at = Date.parse(comment.createdAt);
      if (!isStartComment(comment) || now.getTime() - at >= START_HOLDS_FOR_MS) continue;
      const newest = held.get(issue.identifier);
      if (!newest || at > Date.parse(newest)) held.set(issue.identifier, comment.createdAt);
    }
  }
  return held;
}

// "PR 50 and PR 51": the open PRs on a ticket's branches, for a sentence.
function prList(snapshot: Snapshot, id: string): string {
  return listOf(prsOf(snapshot, id).map((pull) => `PR ${pull.number}`));
}

// The open PRs on a ticket's claude/jas-<n>- branches, lowest number first.
function prsOf(snapshot: Snapshot, id: string): OpenPull[] {
  return snapshot.pulls.filter((pull) => ticketOfBranch(pull.head.ref) === id).sort((a, b) => a.number - b.number);
}

/** The Turnpoint tickets with a builder working on them now, and why the queue thinks so. */
export function runningTickets(snapshot: Snapshot, now: Date): { id: string; why: string }[] {
  const started = heldStarts(snapshot, now);
  const running: { id: string; why: string }[] = [];
  for (const issue of snapshot.issues.filter(inTurnpoint)) {
    const id = issue.identifier;
    // A finished ticket has no builder, even with an old PR left open.
    if (FINISHED.includes(issue.state.name)) continue;
    // A builder still working on any of its PRs is still running, in any
    // unfinished status: one whose Linear writes failed leaves it Ready, and the
    // picker doesn't count a ticket's own PR as a clash, so a second builder
    // would start. One with no open PR has merged or closed it, and Linear
    // hasn't caught up.
    const open = prsOf(snapshot, id);
    const working = open.filter((pull) => !builderDone(pull));
    const prs = listOf(working.map((pull) => `PR ${pull.number}`));
    const notDone = `${working.length === 1 ? "isn't" : "aren't"} marked ready or left for Jasper`;
    const startedAt = started.get(id);
    if (issue.state.name === "In Progress") {
      running.push({ id, why: "it's In Progress" });
    } else if (issue.state.name === "In Review" && working.length > 0) {
      running.push({ id, why: `it's In Review, and ${prs} ${notDone}` });
    } else if (working.length > 0) {
      running.push({ id, why: `its ${prs} ${working.length === 1 ? "is" : "are"} open and ${notDone}` });
    } else if (startedAt && open.length === 0 && BEFORE_BUILDER.includes(issue.state.name)) {
      running.push({ id, why: `the queue started a builder on it at ${utc(startedAt)}, under 2 hours ago` });
    }
  }
  return running.sort((a, b) => byTicketNumber(a.id, b.id));
}

export type VercelState = { kind: "ok" } | { kind: "refusing"; since: string } | { kind: "testing"; since: string };

// Vercel's last word on deploys, from the "Vercel" statuses on main and each
// open PR. Vercel only answers when something is pushed, so an old refusal
// can't hold the queue shut forever: after an hour, one ticket starts as a
// test (Jasper's default on JAS-144). "pending" (still deploying) says
// nothing yet. A deploy that was already building when the limit hit can
// still finish after the first refusal, as PR 276's did 30 seconds after one
// on 2026-11-02, so only a deploy that finished more than an hour after the
// newest refusal shows Vercel deploying again.
export function vercelState(statuses: CommitStatus[], now: Date): VercelState {
  const finished = statuses.filter((status) => status.context === "Vercel" && ["success", "failure", "error"].includes(status.state));
  const refusals = finished.filter((status) => /rate limited/i.test(status.description ?? ""));
  if (refusals.length === 0) return { kind: "ok" };
  const since = refusals.map((status) => status.updated_at).reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
  const deployedSince = finished.some(
    (status) => !refusals.includes(status) && Date.parse(status.updated_at) - Date.parse(since) > REFUSAL_HOLDS_FOR_MS,
  );
  if (deployedSince) return { kind: "ok" };
  return now.getTime() - Date.parse(since) < REFUSAL_HOLDS_FOR_MS ? { kind: "refusing", since } : { kind: "testing", since };
}

// The first line of each comment the queue writes. The API key is Jasper's,
// so the queue's comments show as his, and these lines are how it knows its
// own. They're plain text, so Linear's Markdown round trip leaves them alone.
export const START_LINE = "Ticket queue: starting a cloud builder on this ticket.";
export const REFUSED_LINE = "Ticket queue: a builder start was refused.";
export const WAIT_LINE = "Ticket queue: this ticket waits.";
export const WAITED_LINE = "Ticket queue: this ticket waited, then a builder started on it.";

const isStartComment = (comment: LinearComment) => comment.body.trimStart().startsWith(START_LINE);

// The picker's words for a Ready ticket that already has a builder.
const ALREADY_RUNNING = "A builder is already running on it.";

function startBody(runUrl: string): string {
  return `${START_LINE}\n\n${runUrl}\n\nThis isn't a builder's start comment. The builder posts its own within a few minutes, and moves the ticket to In Progress.`;
}

export function refusedBody(status: number, why: string): string {
  return `${REFUSED_LINE}\n\nThe cloud task answered HTTP ${status}: ${why}\n\nThis doesn't count as a try. A later run tries again.`;
}

// The status refusedBody wrote, or undefined if the comment doesn't say. The
// cloud task's words follow it on one line, so the first match is the queue's.
function refusedStatus(body: string): number | undefined {
  const status = body.match(/^\s*The cloud task answered HTTP (\d{3}):/m)?.[1];
  return status === undefined ? undefined : Number(status);
}

// A refusal can last, and each run in it would add one more refused comment
// to the same top ticket, and fail the run if only Jasper can fix it. So
// automatic runs start nothing for an hour after the hourly fire limit (HTTP
// 429), which clears by itself, and for a day after any other refusal, or one
// whose status can't be read. A refused comment is the edited start comment,
// so it was made within seconds of the refusal. Returns why nothing starts,
// or undefined once every hold has run out.
function refusalHold(comments: LinearComment[], now: Date): string | undefined {
  const [hold] = comments
    .filter((comment) => comment.body.trimStart().startsWith(REFUSED_LINE))
    .map((comment) => {
      const status = refusedStatus(comment.body);
      const until = Date.parse(comment.createdAt) + (status === 429 ? REFUSAL_HOLDS_FOR_MS : JASPER_REFUSAL_HOLDS_FOR_MS);
      return { at: comment.createdAt, status, until };
    })
    .filter((refusal) => now.getTime() < refusal.until)
    // A start that got through after the refusal, such as Jasper's run by
    // name once he fixed the token, shows the cloud task takes fires again.
    .filter((refusal) => !comments.some((comment) => isStartComment(comment) && Date.parse(comment.createdAt) > Date.parse(refusal.at)))
    .sort((a, b) => b.until - a.until);
  if (!hold) return undefined;
  const answered = hold.status === undefined ? "" : ` with HTTP ${hold.status}`;
  const jasperFixes = hold.status === 429 ? "" : ", which only Jasper can fix";
  const until = utc(new Date(hold.until).toISOString());
  return `The cloud task refused a start at ${utc(hold.at)}${answered}${jasperFixes}, so nothing starts on its own until ${until}. A run by name (/run-queue) tries again sooner.`;
}

function waitedBody(at: Date): string {
  return `${WAITED_LINE}\n\nThe queue started its cloud session at ${utc(at.toISOString())}.`;
}

function waitBody(why: string[]): string {
  return [WAIT_LINE, "", ...why.map((reason) => `- ${reason}`), "", "The queue edits this comment when the reasons change, instead of adding another."].join("\n");
}

function promoteBody(priority: string, moveToReady: boolean, blocks: string[]): string {
  const first = moveToReady ? `Ticket queue: moved this ticket to Ready and rated it ${priority}.` : `Ticket queue: rated this ticket ${priority}.`;
  return `${first}\n\nIt blocks ${listOf(blocks)}, which ${blocks.length === 1 ? "is" : "are"} Ready.`;
}

// Linear keeps a comment as rich text and writes its own Markdown back, which
// may not match what was sent (descriptions read back with "* " lists), so
// list markers and spacing don't count as a change.
function sameText(a: string, b: string): boolean {
  const smooth = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim().replace(/^[-*]\s+/, "- "))
      .filter((line) => line !== "")
      .join("\n");
  return smooth(a) === smooth(b);
}

export type WaitComment =
  | { kind: "create"; issueUuid: string; body: string }
  | { kind: "update"; commentId: string; body: string }
  | { kind: "same" }
  | { kind: "none" };

export type Plan = {
  vercel: VercelState;
  running: { id: string; why: string }[];
  promote: { id: string; uuid: string; priority: "Urgent" | "High"; moveToReady: boolean; body: string }[];
  /** In the order they were picked, each with its wait comment's edit if it has one. */
  start: { id: string; uuid: string; body: string; waited?: { commentId: string; body: string } }[];
  waits: { id: string; why: string[]; comment: WaitComment }[];
  /** Notes for the run's summary, such as a blocker in another project left alone. */
  notes: string[];
};

/**
 * Plans one round. `byName` is a run Jasper started by name (/run-queue or
 * the Actions tab), which doesn't wait out a refused start, since that's him
 * trying again after a fix.
 */
export function planRound(snapshot: Snapshot, now: Date, runUrl: string, { byName = false }: { byName?: boolean } = {}): Plan {
  const issues = new Map(snapshot.issues.map((issue) => [issue.identifier, issue]));
  const issueOf = (id: string) => {
    const issue = issues.get(id);
    if (!issue) throw new Error(`The picker named ${id}, which the queue didn't read.`);
    return issue;
  };
  // A ticket whose builder finished its PR but couldn't move it on in Linear
  // would start a second builder. The picker sees it as In Review instead, so
  // it never starts and takes no slot, as decision record 0026 says a
  // finished PR doesn't, while that PR's files stay held.
  const finishedEarly = snapshot.issues.filter((issue) => {
    const prs = prsOf(snapshot, issue.identifier);
    return inTurnpoint(issue) && BEFORE_BUILDER.includes(issue.state.name) && prs.length > 0 && prs.every(builderDone);
  });
  const tickets = snapshot.issues.map((issue): Ticket => {
    const ticket = toTicket(issue, snapshot.viewerId);
    return finishedEarly.includes(issue) ? { ...ticket, status: "In Review" } : ticket;
  });
  const running = runningTickets(snapshot, now);
  const vercel = vercelState(snapshot.statuses, now);
  const picks = pickTickets({
    tickets,
    openPrs: toOpenPrs(snapshot.pulls, snapshot.files),
    running: running.map((ticket) => ticket.id),
    vercelRefusing: vercel.kind === "refusing",
  });

  // A blocker from another project is read only so the picker can check it.
  // The queue builds Turnpoint, so it never moves, starts or comments on one.
  const foreign = new Set(snapshot.issues.filter((issue) => !inTurnpoint(issue)).map((issue) => issue.identifier));
  const named = [...picks.promote.map((promotion) => promotion.id), ...picks.start, ...picks.waits.map((wait) => wait.id)];
  const notes = [
    ...finishedEarly.map(
      (issue) =>
        `${issue.identifier}'s builder has finished ${prList(snapshot, issue.identifier)}, though Linear still has it ${issue.state.name}, so the queue treats it as In Review.`,
    ),
    ...[...new Set(named.filter((id) => foreign.has(id)))].map((id) => `${id} isn't in project ${PROJECT}, so the queue doesn't move, start or comment on it.`),
  ];
  const promote = picks.promote.filter((promotion) => !foreign.has(promotion.id));
  // The picker's words for a blocker the queue won't move, or one it sees as
  // In Review while Linear still shows it unstarted, put in what's true.
  const unmoved = new Map([
    ...picks.promote
      .filter((promotion) => foreign.has(promotion.id))
      .map(({ id }): [string, string] => [`It waits for ${id}, which moves to Ready now.`, `It waits for ${id}, which is in another project, so the queue doesn't move it.`]),
    ...finishedEarly.map(({ identifier: id }): [string, string] => [
      `It waits for ${id}, which is In Review.`,
      `It waits for ${id}, whose builder has finished ${prList(snapshot, id)}, which ${prsOf(snapshot, id).length === 1 ? "waits" : "wait"} to merge.`,
    ]),
  ]);
  let start = picks.start.filter((id) => !foreign.has(id));
  const waits = picks.waits
    .filter((wait) => !foreign.has(wait.id))
    .map((wait) => ({ id: wait.id, why: wait.why.map((reason) => unmoved.get(reason) ?? reason) }));

  const held = refusalHold(Object.values(snapshot.comments).flat(), now);
  if (held && !byName) {
    waits.push(...start.map((id) => ({ id, why: [held] })));
    start = [];
  }

  // Testing: one ticket starts, and its builder's first push shows whether
  // Vercel deploys again. While any builder runs, however long it takes,
  // nothing else starts, so each round doesn't start one more test. Times
  // can't pick out the test's builder, since its own refused push moves
  // Vercel's newest refusal past its start comment.
  if (vercel.kind === "testing") {
    const [busy] = running;
    const keep = busy ? [] : start.slice(0, 1);
    const why = busy
      ? `Vercel refused a deploy at ${utc(vercel.since)}, and ${busy.id} has a builder running, so nothing else starts until it finishes or a preview deploys.`
      : `Vercel refused a deploy at ${utc(vercel.since)}, so only ${keep[0]} starts this round, as a test, until a preview deploys.`;
    waits.push(...start.slice(keep.length).map((id) => ({ id, why: [why] })));
    start = keep;
  }

  const promoted = new Set(promote.map((promotion) => promotion.id));
  const round = tickets.filter((ticket) => ticket.status === "Ready" || promoted.has(ticket.id));
  return {
    vercel,
    running,
    promote: promote.map(({ id, priority }) => {
      const moveToReady = issueOf(id).state.name !== "Ready";
      const blocks = round.filter((ticket) => ticket.blockedBy.includes(id)).map((ticket) => ticket.id).sort(byTicketNumber);
      return { id, uuid: issueOf(id).id, priority, moveToReady, body: promoteBody(priority, moveToReady, blocks) };
    }),
    start: start.map((id) => {
      const wait = waitCommentOf(snapshot.comments[id] ?? []);
      return { id, uuid: issueOf(id).id, body: startBody(runUrl), waited: wait && { commentId: wait.id, body: waitedBody(now) } };
    }),
    waits: waits.map(({ id, why }) => ({ id, why, comment: waitComment(issueOf(id), why, snapshot.comments[id] ?? []) })),
    notes,
  };
}

// One wait comment per ticket, edited in place, so a ticket that waits for
// days doesn't collect one comment per run.
function waitComment(issue: LinearIssue, why: string[], comments: LinearComment[]): WaitComment {
  if (why.length === 1 && why[0] === ALREADY_RUNNING) return { kind: "none" };
  const body = waitBody(why);
  const existing = waitCommentOf(comments);
  if (!existing) return { kind: "create", issueUuid: issue.id, body };
  return sameText(existing.body, body) ? { kind: "same" } : { kind: "update", commentId: existing.id, body };
}

// The oldest, so the queue keeps editing the same comment even if a second
// one ever appears.
function waitCommentOf(comments: LinearComment[]): LinearComment | undefined {
  return [...comments].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).find((comment) => comment.body.trimStart().startsWith(WAIT_LINE));
}

export type FireAnswer =
  | { kind: "started"; sessionUrl: string }
  /** The cloud task answered with a 4xx, and didn't start a session. */
  | { kind: "refused"; status: number; why: string }
  /** No answer, a 5xx, or one that can't be read: a session may have started. */
  | { kind: "no answer"; why: string };

/** Everything a round does outside this file, passed in so the tests can fake Linear and the cloud task. */
export type Effects = {
  /** Sets a ticket's Priority (1 is Urgent, 2 is High), and moves it to Ready if `moveToReady`. */
  promote(uuid: string, priority: number, moveToReady: boolean): Promise<void>;
  /** Returns the new comment's ID. */
  createComment(issueUuid: string, body: string): Promise<string>;
  updateComment(commentId: string, body: string): Promise<void>;
  fire(ticketId: string): Promise<FireAnswer>;
  log(line: string): void;
  summary(line: string): void;
};

function vercelLine(vercel: VercelState): string {
  if (vercel.kind === "ok") return `Vercel isn't refusing deploys, so up to ${CEILING} builders can run.`;
  if (vercel.kind === "refusing") return `Vercel refused a deploy at ${utc(vercel.since)}, under an hour ago, so nothing starts this round.`;
  return `Vercel refused a deploy at ${utc(vercel.since)}, over an hour ago, so one ticket at most starts, as a test.`;
}

function waitLines(wait: Plan["waits"][number], dryRun: boolean): string[] {
  const comment = {
    create: dryRun ? "its comment would be created" : "its comment was created",
    update: dryRun ? "its comment would be updated" : "its comment was updated",
    same: "its comment already says this, so it's left alone",
    none: "it gets no comment, since a builder is running on it",
  }[wait.comment.kind];
  return [`${wait.id} waits, and ${comment}:`, ...wait.why.map((reason) => `- ${reason}`)];
}

/**
 * Carries out a plan: promotions, then starts, then wait comments. A dry run
 * only says what it would do. `failed` turns the run red, for a refusal only
 * Jasper can fix. A throw from Linear goes up and turns it red too.
 */
export async function runRound(plan: Plan, { dryRun }: { dryRun: boolean }, effects: Effects): Promise<{ failed: boolean }> {
  // Every line starts with this script's own words, and anything from Linear,
  // GitHub or the cloud task stays on that line, so it can't start a line of
  // its own, such as a "::" workflow command.
  const log = (line: string) => effects.log(oneLine(line));
  const summary = (line: string) => effects.summary(oneLine(line));

  // The ID is the whole message a builder gets, so anything else stops the
  // run before it does anything.
  const notAnId = plan.start.find(({ id }) => !TICKET_ID.test(id));
  if (notAnId) throw new Error(`${oneLine(notAnId.id, 40)} isn't a ticket ID like JAS-123, so the queue sends nothing.`);

  if (dryRun) summary("Dry run: this says what the queue would do, and changes nothing.");
  summary(vercelLine(plan.vercel));
  if (plan.running.length === 0) summary("No ticket has a builder running.");
  else summary(`${plan.running.length === 1 ? "1 ticket has" : `${plan.running.length} tickets have`} a builder running:`);
  for (const { id, why } of plan.running) summary(`- ${id}: ${why}.`);
  for (const note of plan.notes) summary(`Note: ${note}`);

  for (const { id, uuid, priority, moveToReady, body } of plan.promote) {
    if (dryRun) {
      summary(moveToReady ? `Would move ${id} to Ready and rate it ${priority}, with a comment.` : `Would rate ${id} ${priority}, with a comment.`);
      continue;
    }
    await effects.promote(uuid, priority === "Urgent" ? 1 : 2, moveToReady);
    await effects.createComment(uuid, body);
    summary(moveToReady ? `Moved ${id} to Ready and rated it ${priority}, with a comment.` : `Rated ${id} ${priority}, with a comment.`);
  }

  if (plan.start.length === 0) {
    if (plan.waits.length > 0) summary("No ticket starts this round. Each Ready ticket's reasons are below.");
    else summary(plan.notes.length === 0 ? "No ticket starts this round, since no ticket is Ready." : "No ticket starts this round.");
  }
  let failed = false;
  let stop = ""; // why nothing else starts this round, once something has gone wrong
  for (const ticket of plan.start) {
    if (dryRun) {
      summary(`Would start a builder on ${ticket.id}.`);
      continue;
    }
    if (stop) {
      summary(`${ticket.id} didn't start, since ${stop}.`);
      continue;
    }
    // The comment comes first, so the next run sees the ticket as taken even
    // if this run dies before the fire's answer arrives.
    const commentId = await effects.createComment(ticket.uuid, ticket.body);
    const answer = await effects.fire(ticket.id);
    if (answer.kind === "started") {
      summary(`Started a builder on ${ticket.id}: ${answer.sessionUrl}`);
      // A wait comment left as it was would tell the builder its ticket waits.
      if (ticket.waited) await effects.updateComment(ticket.waited.commentId, ticket.waited.body);
    } else if (answer.kind === "refused") {
      // Said before the comment is edited, so a Linear failure there can't hide it.
      const { reason, jasperFixes } = refusalReason(answer.status, answer.why);
      log(`The cloud task refused ${ticket.id}: HTTP ${answer.status}, ${answer.why}`);
      const next = jasperFixes ? "Only Jasper can fix that" : "A run an hour from now tries again";
      log(`::${jasperFixes ? "error" : "warning"} title=Builder start refused::${ticket.id} didn't start (HTTP ${answer.status}): ${reason}. ${next}.`);
      summary(`${ticket.id} didn't start (HTTP ${answer.status}): ${reason}.`);
      if (jasperFixes) failed = true;
      stop = `the cloud task refused ${ticket.id}`;
      // Edited, not left, so it no longer holds the ticket, and it holds
      // automatic runs instead (refusalHold).
      await effects.updateComment(commentId, refusedBody(answer.status, answer.why));
      summary(`${ticket.id}'s start comment now says so, and nothing starts on its own for ${jasperFixes ? "a day" : "an hour"}.`);
    } else {
      // A builder may have started, so the start comment stays, and its
      // 2-hour hold keeps a later run from starting a second one.
      log(`No answer from the cloud task for ${ticket.id}: ${answer.why}`);
      log(`::warning title=No answer from the cloud task::A builder may have started on ${ticket.id}, so its start comment holds it for 2 hours. Nothing else starts this round.`);
      summary(`${ticket.id} may have started: the cloud task didn't answer. Its start comment holds it for 2 hours.`);
      stop = `the cloud task didn't answer for ${ticket.id}`;
    }
  }

  for (const wait of plan.waits) {
    if (!dryRun && wait.comment.kind === "create") await effects.createComment(wait.comment.issueUuid, wait.comment.body);
    if (!dryRun && wait.comment.kind === "update") await effects.updateComment(wait.comment.commentId, wait.comment.body);
    for (const line of waitLines(wait, dryRun)) summary(line);
  }
  return { failed };
}

// What a refused fire means, from the errors the fire docs list. Only the
// hourly limit clears by itself; Jasper fixes the rest.
function refusalReason(status: number, why: string): { reason: string; jasperFixes: boolean } {
  if (status === 401 || status === 403 || status === 404) return { reason: "its token or task ID is wrong, or the account has no access", jasperFixes: true };
  if (status === 429) return { reason: "an hourly fire limit (30 a task, 100 an account) was reached", jasperFixes: false };
  return { reason: `the cloud task refused it: ${why}`, jasperFixes: true };
}

const FireStarted = z.object({ type: z.literal("routine_fire"), claude_code_session_url: z.string() });
const FireError = z.object({ type: z.literal("error"), error: z.object({ type: z.string(), message: z.string() }) });

/** Reads the cloud task's answer to a fire (platform.claude.com/docs/en/api/claude-code/routines-fire). */
export function fireAnswer(status: number, body: string): FireAnswer {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    json = undefined;
  }
  if (status >= 200 && status < 300) {
    const started = FireStarted.safeParse(json);
    if (started.success) return { kind: "started", sessionUrl: started.data.claude_code_session_url };
    // A success that isn't the documented answer may still have started a
    // session, so the ticket stays held, as with no answer at all.
    return { kind: "no answer", why: `HTTP ${status}, but not the routine_fire answer the docs describe` };
  }
  const error = FireError.safeParse(json);
  const why = oneLine(error.success ? `${error.data.error.type}: ${error.data.error.message}` : body, 300) || "no message";
  // A fire has no idempotency key, and the docs don't say a 5xx started no
  // session, so only a 4xx releases the ticket. Anything else may have
  // started one, and the start comment keeps holding it.
  if (status >= 400 && status < 500) return { kind: "refused", status, why };
  return { kind: "no answer", why: `HTTP ${status}: ${why}` };
}

/** The fire request for one ticket, without the token, which scripts/run-queue.ts adds. */
export function fireRequest(taskId: string, ticketId: string): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: `https://api.anthropic.com/v1/claude_code/routines/${taskId}/fire`,
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "content-type": "application/json",
    },
    // Only the ID: the builder reads the ticket from Linear and checks it's still Ready.
    body: JSON.stringify({ text: ticketId }),
  };
}

/**
 * What a dry run gets in place of the Linear writes and the fire: each one
 * throws. runRound already skips them in a dry run, so this is a second
 * guard: a mistake there stops the run instead of changing Linear or
 * starting a builder.
 */
export function dryRunEffects(): Pick<Effects, "promote" | "createComment" | "updateComment" | "fire"> {
  const refuse = async (): Promise<never> => {
    throw new Error("A dry run tried to change Linear or start a builder, so the queue stopped.");
  };
  return { promote: refuse, createComment: refuse, updateComment: refuse, fire: refuse };
}

/** The round's writes to Linear. Each throws unless Linear says it worked. */
export function linearWrites(linear: LinearCall, readyStateId: string): Pick<Effects, "promote" | "createComment" | "updateComment"> {
  return {
    // A blocker already Ready gets only its Priority, so one a builder moved
    // on since the queue read it isn't moved back to Ready.
    async promote(uuid, priority, moveToReady) {
      const answer = moveToReady
        ? await linear(ISSUE_MOVE, { id: uuid, stateId: readyStateId, priority })
        : await linear(ISSUE_RATE, { id: uuid, priority });
      const { issueUpdate } = linearData("IssueUpdate", z.object({ issueUpdate: Success }), answer);
      if (!issueUpdate.success) throw new Error("Linear didn't update the ticket (issueUpdate answered success: false).");
    },
    async createComment(issueUuid, body) {
      const { commentCreate } = linearData("CommentCreate", CommentCreated, await linear(COMMENT_CREATE, { issueId: issueUuid, body }));
      if (!commentCreate.success || !commentCreate.comment) throw new Error("Linear didn't add the comment (CommentCreate answered success: false).");
      return commentCreate.comment.id;
    },
    async updateComment(commentId, body) {
      const answer = linearData("CommentUpdate", z.object({ commentUpdate: Success }), await linear(COMMENT_UPDATE, { id: commentId, body }));
      if (!answer.commentUpdate.success) throw new Error("Linear didn't edit the comment (CommentUpdate answered success: false).");
    },
  };
}

/** Outside text on one line, cut to `max` characters. */
export function oneLine(text: string, max = Infinity): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

// "2026-11-02 06:20 UTC": the minute is enough, and every reader sees the same clock.
function utc(iso: string): string {
  const time = new Date(iso).toISOString();
  return `${time.slice(0, 10)} ${time.slice(11, 16)} UTC`;
}

function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const byTicketNumber = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
