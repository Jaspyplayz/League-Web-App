// The picking half of /run-queue (JAS-143, decision record 0026): which Ready
// tickets get a builder this round, which blockers move to Ready, and why
// every other Ready ticket waits. Everything here is pure, like
// scripts/can-merge-gates.ts, so each rule is tested without Linear, GitHub
// or Vercel, and the same tickets always give the same picks. The Action
// (JAS-144) reads the real data, passes it in, and does what comes back.

/**
 * The most builders running at once. It's a safety limit, not a target: each
 * builder's pushes use Vercel's 100 deploys a day, shared with petri, so it
 * goes up only once real runs show that's safe (0026).
 */
export const CEILING = 4;

export type Status = "Backlog" | "Todo" | "Ready" | "In Progress" | "In Review" | "Done" | "Canceled" | "Duplicate";
export type Priority = "Urgent" | "High" | "Medium" | "Low";

export type Ticket = {
  /** Such as "JAS-143". */
  id: string;
  title: string;
  status: Status;
  /** null is Linear's "No priority". */
  priority: Priority | null;
  /** When the ticket was made, as an ISO 8601 date and time. */
  createdAt: string;
  description: string;
  /** The IDs of the tickets that block this one. */
  blockedBy: string[];
  labels: string[];
  assignedToJasper: boolean;
  hasSubTickets: boolean;
};

export type OpenPr = {
  number: number;
  /** The ticket its claude/jas-<n>-... branch builds, or null for any other branch. */
  ticket: string | null;
  /** Every file it changes. */
  files: string[];
};

export type QueueState = {
  /** The Ready tickets, every ticket that blocks one, and every ticket with a builder running. */
  tickets: Ticket[];
  openPrs: OpenPr[];
  /** The tickets with a builder running now. */
  running: string[];
  vercelRefusing: boolean;
  ceiling: number;
};

export type Picks = {
  /** The tickets to start a builder on, in the order they were picked. */
  start: string[];
  /** Blockers to move to Ready, with the Priority to give each. */
  promote: { id: string; priority: "Urgent" | "High" }[];
  /** Every other Ready ticket, with each reason it waits, for its comment. */
  waits: { id: string; why: string[] }[];
};

export type Touches = { files: string[] } | { why: string };

// Tickets write "**Touches.**", like the template's other labels. Decision
// record 0027 and docs/agents/issue-tracker.md say "Touches:", so that counts too.
const TOUCHES_LINE = /^\s*(?:\*\*touches[.:]\*\*|touches:)(.*)$/i;

/**
 * The files on a ticket's Touches line, each in backticks. Words outside the
 * backticks are skipped, since a ticket can add a note after its list. Exact
 * paths only: a folder or a pattern can't be compared file by file, so it
 * makes the ticket wait instead of holding fewer files than it changes.
 */
export function parseTouches(description: string): Touches {
  const lines = description.split(/\r?\n/).filter((line) => TOUCHES_LINE.test(line));
  if (lines.length === 0) return { why: "its description has no **Touches.** line" };
  // Like can-merge's fields: with two, the queue can't tell which one is meant.
  if (lines.length > 1) return { why: `its description has ${lines.length} Touches lines` };
  const afterLabel = lines[0].replace(TOUCHES_LINE, "$1");
  const files = [...afterLabel.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
  if (files.length === 0) return { why: "its Touches line names no files in backticks" };
  for (const file of files) {
    const problem = notAFile(file);
    if (problem) return { why: `\`${file}\` on its Touches line ${problem}` };
  }
  return { files };
}

function notAFile(path: string): string | undefined {
  if (path === "" || /[\s\\]/.test(path)) return "isn't a file path";
  if (path.includes("*")) return "is a pattern, not a file";
  if (path.endsWith("/")) return "is a folder, not a file";
  if (/^\.{0,2}\//.test(path)) return "doesn't start at the repo root";
  return undefined;
}

const QUEUE_ORDER: Record<Priority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const FINISHED: readonly Status[] = ["Done", "Canceled", "Duplicate"];

/** Files someone already has, and who: an open PR, a running builder, or a ticket picked this round. */
type Holder = { ticket: string | null; files: Set<string>; says: string };

// Windows ignores case, as in scripts/risky-paths.ts, so src/DB/x.ts is src/db/x.ts.
const lowerCase = (files: readonly string[]) => new Set(files.map((file) => file.toLowerCase()));

export function pickTickets(state: QueueState): Picks {
  const tickets = new Map(state.tickets.map((ticket) => [ticket.id, ticket]));
  const running = new Set(state.running);
  const holders: Holder[] = state.openPrs.map((pr) => ({ ticket: pr.ticket, files: lowerCase(pr.files), says: `PR ${pr.number} changes` }));

  // A builder works for minutes before its PR exists, so its ticket's Touches
  // line holds those files. One that can't be read could be changing any
  // file, so nothing is safe to start beside it.
  const stopAll: string[] = [];
  for (const id of running) {
    const ticket = tickets.get(id);
    const touches: Touches = ticket ? parseTouches(ticket.description) : { why: "the queue couldn't read it" };
    if ("why" in touches) {
      stopAll.push(`Nothing starts while ${id} has a builder running, because ${touches.why}, so that builder could be changing any file.`);
    } else {
      holders.push({ ticket: id, files: lowerCase(touches.files), says: `${id}'s builder is changing` });
    }
  }
  if (stopAll.length === 0 && state.vercelRefusing) stopAll.push("Vercel is refusing deploys, so nothing starts.");

  const picks: Picks = { start: [], promote: [], waits: [] };
  for (const ticket of inQueueOrder([...tickets.values()])) {
    if (running.has(ticket.id)) {
      picks.waits.push({ id: ticket.id, why: ["A builder is already running on it."] });
      continue;
    }

    // What the ticket itself is missing, all listed so one fix covers them.
    const touches = parseTouches(ticket.description);
    const why: string[] = [];
    if (ticket.priority === null) why.push("It has no Priority.");
    if ("why" in touches) why.push(`It can't start, because ${touches.why}.`);
    for (const id of ticket.blockedBy) {
      const blocker = checkBlocker(id, tickets, running);
      if (blocker.kind === "moves" && !picks.promote.some((promoted) => promoted.id === id)) {
        picks.promote.push({ id, priority: blocker.priority });
      }
      if (blocker.kind !== "finished") why.push(blocker.why);
    }

    // Then what holds it back this round. A file clash comes before the
    // ceiling, so a ceiling reason means it would start with a free slot.
    if (why.length === 0 && "files" in touches) {
      const clashes = clashesWith(ticket.id, touches.files, holders);
      const busy = running.size + picks.start.length;
      if (stopAll.length > 0) why.push(...stopAll);
      else if (clashes.length > 0) why.push(...clashes);
      else if (busy >= state.ceiling) why.push(`${busy} builders are running or starting, the ceiling.`);
      else {
        picks.start.push(ticket.id);
        holders.push({ ticket: ticket.id, files: lowerCase(touches.files), says: `${ticket.id}, picked this round, will change` });
        continue;
      }
    }
    picks.waits.push({ id: ticket.id, why });
  }
  return picks;
}

// Highest Priority first, then oldest, then the lowest ticket number. A
// ticket with no Priority goes last, though it waits anyway.
function inQueueOrder(tickets: Ticket[]): Ticket[] {
  const rank = (ticket: Ticket) => (ticket.priority === null ? 4 : QUEUE_ORDER[ticket.priority]);
  return tickets
    .filter((ticket) => ticket.status === "Ready")
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id, "en", { numeric: true }),
    );
}

type BlockerCheck =
  | { kind: "finished" }
  | { kind: "moves"; priority: "Urgent" | "High"; why: string }
  | { kind: "waits"; why: string };

// A written-up blocker in Todo or Backlog moves to Ready, so the ticket waits
// only until that one is built.
function checkBlocker(id: string, tickets: Map<string, Ticket>, running: Set<string>): BlockerCheck {
  const blocker = tickets.get(id);
  if (!blocker) return { kind: "waits", why: `It waits for ${id}, which the queue couldn't read.` };
  if (FINISHED.includes(blocker.status)) return { kind: "finished" };
  if (running.has(id)) return { kind: "waits", why: `It waits for ${id}, which has a builder running.` };
  if (blocker.status !== "Todo" && blocker.status !== "Backlog") {
    return { kind: "waits", why: `It waits for ${id}, which is ${blocker.status}.` };
  }
  const missing = whyNotReady(blocker);
  if (missing.length > 0) {
    return { kind: "waits", why: `It waits for ${id}, which can't move to Ready, because ${missing.join(" and ")}.` };
  }
  // A blocker holds others up, so it's rated High, but an Urgent one stays Urgent.
  const priority = blocker.priority === "Urgent" ? "Urgent" : "High";
  return { kind: "moves", priority, why: `It waits for ${id}, which moves to Ready now.` };
}

// Decision record 0027: Claude Code moves a Backlog or Todo ticket to Ready
// once it's written up, except the ones Jasper keeps. The queue moves
// tickets for Claude Code, so it follows the same rules. A Backlog ticket
// also needs its Priority already set, as a sign that someone wrote it up.
function whyNotReady(blocker: Ticket): string[] {
  if (/^\s*(postmortem|wellness):/i.test(blocker.title)) return ["only Jasper moves Postmortem: and Wellness: tickets"];
  if (blocker.assignedToJasper) return ["it's assigned to Jasper, so only he moves it"];
  if (blocker.labels.some((label) => /^wayfinder:/i.test(label))) return ["it's a wayfinder ticket, which no PR builds"];
  if (blocker.hasSubTickets) return ["it has sub-tickets, so it's a plan that no PR builds"];
  const touches = parseTouches(blocker.description);
  return [
    ...(blocker.status === "Backlog" && blocker.priority === null ? ["it has no Priority"] : []),
    ...("why" in touches ? [touches.why] : []),
  ];
}

// One sentence per holder whose files the ticket would also change. A PR's
// files don't hold back its own ticket, which continues on that PR.
function clashesWith(id: string, files: string[], holders: Holder[]): string[] {
  return holders.flatMap((holder) => {
    if (holder.ticket === id) return [];
    const shared = files.filter((file) => holder.files.has(file.toLowerCase()));
    if (shared.length === 0) return [];
    return [`It touches ${shared.map((file) => `\`${file}\``).join(" and ")}, which ${holder.says}.`];
  });
}
