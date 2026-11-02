// The picking half of /run-queue (JAS-143, decision record 0026): which Ready
// tickets get a builder this round, which blockers move to Ready, and why
// every other Ready ticket waits. Everything here is pure, like
// scripts/can-merge-gates.ts, so each rule is tested without Linear, GitHub
// or Vercel, and the same tickets always give the same picks. The Action
// (JAS-144) reads the real data, passes it in, and does what comes back.

/**
 * The most builders running at once. It's a safety limit, not a target or a
 * setting: each builder's pushes use Vercel's 100 deploys a day, shared with
 * petri, so it goes up in code only once real runs show that's safe (0026).
 */
export const CEILING = 4;
/** How many times the queue starts one ticket before it stops and waits for Jasper (0026). */
export const TRIES = 2;
/** The reason a ticket out of tries waits. */
export const OUT_OF_TRIES = `It can't start, because the queue has already tried it ${TRIES} times, which is the limit. Deleting one of the queue's start comments on it gives it another try, if Jasper wants one.`;

export type Status = "Backlog" | "Todo" | "Ready" | "In Progress" | "In Review" | "Done" | "Canceled" | "Duplicate";
export type Priority = "Urgent" | "High" | "Medium" | "Low";

// Ticket IDs are written the way Linear writes them, such as "JAS-143".
export type Ticket = {
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
  /** Every file it changes, with both paths of a rename. */
  files: string[];
};

export type QueueState = {
  /**
   * The Ready tickets, every ticket that blocks one (and the tickets that
   * block those, so a chain of blockers can move in one round), and every
   * ticket with a builder running.
   */
  tickets: Ticket[];
  openPrs: OpenPr[];
  /**
   * The tickets with a builder working on them now, started by the queue or
   * by hand, including any an earlier run started moments ago.
   */
  running: string[];
  /** The tickets the queue has already started TRIES times. */
  outOfTries: string[];
  vercelRefusing: boolean;
};

export type Picks = {
  /** The tickets to start a builder on, in the order they were picked. */
  start: string[];
  /**
   * Blockers that hold up a ticket, each to move to Ready if it isn't there
   * yet and to get this Priority. Apply these before starting builders, since
   * a blocker in this list can also be in `start`.
   */
  promote: { id: string; priority: "Urgent" | "High" }[];
  /** Every other Ready ticket, with each reason it waits, for its comment. */
  waits: { id: string; why: string[] }[];
};

export type Touches = { files: string[] } | { why: string };

// Tickets write "**Touches.**", like the template's other labels. Decision
// record 0027 and docs/agents/issue-tracker.md say "Touches:", so that counts
// too, and the Acceptance criteria label is read the same ways.
const TOUCHES_LINE = /^\s*(?:\*\*touches[.:]\*\*|touches:)(.*)$/i;
const STARTS_WITH_PATH = /^(?:[-*+>]\s*|\d+[.)]\s*)?`(?!``)/;
const CRITERIA_LINE = /^\s*(?:\*\*acceptance criteria[.:]?\*\*|acceptance criteria:|#{1,6}\s*acceptance criteria\b)/im;

/**
 * The paths on a ticket's Touches line, each in backticks. Words outside the
 * backticks are skipped, since a ticket can add a note after its list. A path
 * names a file, or a folder that holds everything inside it. Anything else,
 * such as a pattern, can't be compared with a PR's files, so it makes the
 * ticket wait instead of holding fewer files than it changes.
 */
export function parseTouches(description: string): Touches {
  const lines = description.split(/\r?\n/);
  const found = lines.flatMap((line, i) => {
    const match = line.match(TOUCHES_LINE);
    return match ? [{ list: match[1], after: lines.slice(i + 1) }] : [];
  });
  if (found.length === 0) return { why: "its description has no **Touches.** line" };
  // Like can-merge's fields: with two, the queue can't tell which one is meant.
  if (found.length > 1) return { why: `its description has ${found.length} Touches lines` };
  const [{ list, after }] = found;
  // A list carried on past its line would lose the files there: one that
  // ends in "," or ":", a next line that isn't another label, or a next
  // paragraph that starts with a path, also after a bullet (not a code fence).
  const end = list.trim().slice(-1);
  if (end === "," || end === ":") {
    return { why: `its Touches line ends with "${end}", so the list may go on past it; put every path on that line` };
  }
  const next = (after[0] ?? "").trim();
  // A None line's list is over, so the next line can be its reason.
  const reason = saysNone(list) && !STARTS_WITH_PATH.test(next);
  if (next !== "" && !next.startsWith("**") && !reason) return { why: "its Touches line runs onto the next line; keep the list on one line" };
  const nextParagraph = after.find((line) => line.trim() !== "")?.trim() ?? "";
  if (STARTS_WITH_PATH.test(nextParagraph)) {
    return { why: "the paragraph after its Touches line starts with a path, so the list may go on there; start that paragraph with a word" };
  }
  if ((list.match(/`/g) ?? []).length % 2 === 1) return { why: "its Touches line has a backtick with no partner" };
  if (saysNone(list)) return { files: [] };
  const files = [...list.matchAll(/`([^`]*)`/g)].map((match) => match[1].trim());
  if (files.length === 0) return { why: "its Touches line names no files in backticks" };
  if (files.includes("")) return { why: "its Touches line has backticks with nothing in them" };
  for (const file of files) {
    const problem = notAPath(file);
    if (problem) return { why: `\`${file}\` on its Touches line ${problem}` };
  }
  // "docs/adr/" and "docs/adr" both mean the folder.
  return { files: files.map((file) => file.replace(/\/$/, "")) };
}

// A ticket that holds no files blocks nothing, so a mistake here starts it
// beside a builder changing the file it meant, and nothing but the word can be
// on its line. A ticket that changes no files writes None or None., with any
// reason on its own line.
function saysNone(list: string): boolean {
  return /^none\.?$/i.test(list.trim());
}

function notAPath(path: string): string | undefined {
  if (/[\s\\,;:]/.test(path)) return "isn't a file path";
  if (/[*?{}]/.test(path)) return "is a pattern, not a file";
  // A leading "/", "//", or a "." or ".." step would never equal the path a PR lists.
  if (/^\/|\/\/|(^|\/)\.{1,2}(\/|$)/.test(path)) return "isn't a plain path from the repo root";
  return undefined;
}

const QUEUE_ORDER: Record<Priority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const FINISHED: readonly Status[] = ["Done", "Canceled", "Duplicate"];

/** Files someone already has, and who: an open PR, a running builder, or a ticket picked this round. */
type Holder = { ticket: string | null; files: string[]; says: string };

// Windows ignores case, as in scripts/risky-paths.ts, so src/DB/x.ts is src/db/x.ts.
const lowerCase = (files: readonly string[]) => files.map((file) => file.toLowerCase());
const byTicketNumber = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function pickTickets(state: QueueState): Picks {
  const tickets = new Map(state.tickets.map((ticket) => [ticket.id, ticket]));
  const running = new Set(state.running);
  const outOfTries = new Set(state.outOfTries);

  // Sorted, so the reasons come out the same whatever order the Action reads them in.
  const holders: Holder[] = [...state.openPrs]
    .sort((a, b) => a.number - b.number)
    .map((pr) => ({ ticket: pr.ticket, files: lowerCase(pr.files), says: `PR ${pr.number} changes` }));

  // A builder works for minutes before its PR exists, so its ticket's Touches
  // line holds those files. One that can't be read could be changing any
  // file, so nothing is safe to start beside it.
  const stopAll: string[] = [];
  for (const id of [...running].sort(byTicketNumber)) {
    const ticket = tickets.get(id);
    const touches: Touches = ticket ? parseTouches(ticket.description) : { why: "the queue couldn't read it" };
    if ("why" in touches) {
      stopAll.push(`Nothing starts while ${id} has a builder running, because ${touches.why}, so that builder could be changing any file.`);
    } else {
      holders.push({ ticket: id, files: lowerCase(touches.files), says: `${id}'s builder is changing` });
    }
  }
  if (state.vercelRefusing) stopAll.push("Vercel is refusing deploys, so nothing starts.");

  // This round's queue: the Ready tickets, and the blockers that move to
  // Ready now, at the Priority they get. A moved blocker can start straight away.
  const ready = [...tickets.values()].filter((ticket) => ticket.status === "Ready");
  const promote = blockersToPromote(ready, tickets, running, outOfTries);
  const round = new Map(ready.map((ticket) => [ticket.id, ticket]));
  for (const [id, priority] of promote) {
    const blocker = tickets.get(id);
    if (blocker) round.set(id, { ...blocker, status: "Ready", priority });
  }

  const picks: Picks = { start: [], promote: [...promote].map(([id, priority]) => ({ id, priority })), waits: [] };
  for (const ticket of inQueueOrder([...round.values()])) {
    if (running.has(ticket.id)) {
      picks.waits.push({ id: ticket.id, why: ["A builder is already running on it."] });
      continue;
    }

    // What the ticket itself is missing, all listed so one fix covers them.
    const touches = parseTouches(ticket.description);
    const plan = noPrBuilds(ticket);
    const why: string[] = [];
    if (plan) why.push(`It can't start, because ${plan}.`);
    if (ticket.priority === null) why.push("It has no Priority.");
    if ("why" in touches) why.push(`It can't start, because ${touches.why}.`);
    // Checked here, not after picking, so it takes no slot and holds no files.
    if (outOfTries.has(ticket.id)) why.push(OUT_OF_TRIES);
    for (const id of new Set(ticket.blockedBy)) {
      const blocker = checkBlocker(id, tickets, running, outOfTries);
      if (blocker.kind === "waits") why.push(blocker.why);
      if (blocker.kind === "buildable") {
        const moves = promote.has(id) && tickets.get(id)?.status !== "Ready";
        why.push(moves ? `It waits for ${id}, which moves to Ready now.` : `It waits for ${id}, which is ${blocker.status}.`);
      }
    }

    // Then what holds it back this round. A file clash comes before the
    // ceiling, so a ceiling reason means it would start with a free slot.
    if (why.length === 0 && "files" in touches) {
      const clashes = clashesWith(ticket.id, touches.files, holders);
      const busy = running.size + picks.start.length;
      if (stopAll.length > 0) why.push(...stopAll);
      else if (clashes.length > 0) why.push(...clashes);
      else if (busy >= CEILING) why.push(`${busy} builders are running or starting, and the ceiling is ${CEILING}.`);
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
  return tickets.sort(
    (a, b) => rank(a) - rank(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt) || byTicketNumber(a.id, b.id),
  );
}

type BlockerCheck =
  | { kind: "finished" }
  // In Ready already, or written up so it can move there.
  | { kind: "buildable"; status: Status; priority: "Urgent" | "High" }
  | { kind: "waits"; why: string };

function checkBlocker(id: string, tickets: Map<string, Ticket>, running: Set<string>, outOfTries: Set<string>): BlockerCheck {
  const blocker = tickets.get(id);
  if (!blocker) return { kind: "waits", why: `It waits for ${id}, which the queue couldn't read.` };
  if (FINISHED.includes(blocker.status)) return { kind: "finished" };
  if (running.has(id)) return { kind: "waits", why: `It waits for ${id}, which has a builder running.` };
  if (outOfTries.has(id)) {
    return { kind: "waits", why: `It waits for ${id}, which the queue has already tried ${TRIES} times, which is the limit, so it won't start again unless Jasper gives it another try.` };
  }
  // A ticket that blocks others is High under Jasper's Priority rule (JAS-29),
  // but an Urgent one stays Urgent.
  const priority = blocker.priority === "Urgent" ? "Urgent" : "High";
  const plan = noPrBuilds(blocker);
  if (plan) return { kind: "waits", why: `It waits for ${id}, which won't be built, because ${plan}.` };
  if (blocker.status === "Ready") return { kind: "buildable", status: blocker.status, priority };
  if (blocker.status !== "Todo" && blocker.status !== "Backlog") {
    return { kind: "waits", why: `It waits for ${id}, which is ${blocker.status}.` };
  }
  const missing = whyNotReady(blocker);
  if (missing.length > 0) {
    const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
    return { kind: "waits", why: `It waits for ${id}, which can't move to Ready, because ${list}.` };
  }
  return { kind: "buildable", status: blocker.status, priority };
}

// The blockers to move to Ready or rate up, and the Priority each gets. Only
// for a ticket that could start once its blockers are done, so a ticket with
// no Priority or Touches line, or one out of tries, doesn't pull others into
// the queue. A moved blocker's own blockers move too, so a chain clears in one
// round.
function blockersToPromote(ready: Ticket[], tickets: Map<string, Ticket>, running: Set<string>, outOfTries: Set<string>): Map<string, "Urgent" | "High"> {
  const promote = new Map<string, "Urgent" | "High">();
  const waiting = inQueueOrder([...ready]).filter((ticket) => !running.has(ticket.id));
  for (let i = 0; i < waiting.length; i++) {
    const ticket = waiting[i];
    if (ticket.priority === null || "why" in parseTouches(ticket.description) || noPrBuilds(ticket) || outOfTries.has(ticket.id)) continue;
    for (const id of new Set(ticket.blockedBy)) {
      const blocker = checkBlocker(id, tickets, running, outOfTries);
      const current = tickets.get(id);
      if (blocker.kind !== "buildable" || !current || promote.has(id)) continue;
      if (current.status === "Ready" && current.priority === blocker.priority) continue;
      promote.set(id, blocker.priority);
      if (current.status !== "Ready") waiting.push({ ...current, priority: blocker.priority });
    }
  }
  return promote;
}

// Decision record 0027: a wayfinder ticket or a to-spec parent never goes to
// Ready, because no PR builds it. One that got there anyway doesn't start,
// since its builder's branch would close it on merge.
function noPrBuilds(ticket: Ticket): string | undefined {
  if (ticket.labels.some((label) => /^wayfinder:/i.test(label))) return "it's a wayfinder ticket, which no PR builds";
  if (ticket.hasSubTickets) return "it has sub-tickets, so it's a plan that no PR builds";
  return undefined;
}

// Decision record 0027: Claude Code moves a Backlog or Todo ticket to Ready
// once it has the Feature or fix sections, a Priority and a Touches line,
// except the ones Jasper keeps. The queue moves tickets for Claude Code, so
// it checks the parts it can read: the Acceptance criteria section stands for
// the template's sections, and a Todo ticket gets its Priority as it moves.
// Jasper's own two kinds are about who moves a ticket, so one he put in Ready
// himself, such as a Postmortem: ticket, starts like any other.
function whyNotReady(blocker: Ticket): string[] {
  if (/^\s*(postmortem|wellness):/i.test(blocker.title)) return ["only Jasper moves Postmortem: and Wellness: tickets"];
  if (blocker.assignedToJasper) return ["it's assigned to Jasper, so only he moves it"];
  const touches = parseTouches(blocker.description);
  return [
    ...(blocker.status === "Backlog" && blocker.priority === null ? ["it has no Priority"] : []),
    ...(CRITERIA_LINE.test(blocker.description) ? [] : ["it has no Acceptance criteria section"]),
    ...("why" in touches ? [touches.why] : []),
  ];
}

// One sentence per holder whose files the ticket would also change. A PR's
// files don't hold back its own ticket, which continues on that PR. A folder
// that got past the parser holds everything inside it, so a mistake errs
// toward a clash.
function clashesWith(id: string, files: string[], holders: Holder[]): string[] {
  const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  return holders.flatMap((holder) => {
    if (holder.ticket === id) return [];
    const shared = files.filter((file) => holder.files.some((held) => overlaps(file.toLowerCase(), held)));
    if (shared.length === 0) return [];
    return [`It touches ${shared.map((file) => `\`${file}\``).join(" and ")}, which ${holder.says}.`];
  });
}
