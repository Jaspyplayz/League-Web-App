// The parts of the codebase wellness check (docs/wellness.md) that need no
// judgment: reading the last run from the page's Runs table, writing the next
// row, and sorting TypeScript's unused-code errors from real ones. Kept apart
// from scripts/wellness.ts so it can be tested without running the build.

// The Runs table's header in docs/wellness.md. A test checks the page still
// has it, so the page and formatRow can't drift apart.
export const RUNS_HEADER = "| Date | Ran in | Checked up to | Tickets | `npm test` | `npm run build` | Notes |";

export type LastRun = {
  date: string;
  /** Where the run happened. Times depend on the machine, so a run is only compared with one from the same place. */
  ranIn: "cloud" | "local";
  /** The commit on main the run checked up to; the next run diffs from it. */
  commit: string;
  /** null when that run's tests or build failed. */
  testSeconds: number | null;
  buildSeconds: number | null;
};

export type RunRow = LastRun & { tickets: string[]; notes: string };

export type TscResult = {
  unused: { file: string; line: number; message: string }[];
  /** Errors that aren't about unused code, such as a wrong type. */
  otherErrors: number;
};

// TypeScript's codes for "declared but never read" and its variants (a whole
// import, every destructured name, every type parameter).
const UNUSED_CODES = new Set(["6133", "6138", "6192", "6196", "6198", "6199", "6205"]);

/**
 * The last row of the Runs table, or null before the first run. Given a place,
 * the last row from that place, since times are only compared like with like.
 */
export function lastRun(markdown: string, place?: LastRun["ranIn"]): LastRun | null {
  const lines = markdown.split(/\r?\n/);
  const header = lines.indexOf(RUNS_HEADER);
  if (header === -1) throw new Error("docs/wellness.md has no Runs table with the expected header");

  // Skip the header and the |---| line under it.
  const rows = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(line);
  }
  return rows.map(parseRow).filter((run) => !place || run.ranIn === place).at(-1) ?? null;
}

/** The Runs table row for a finished run. */
export function formatRow(row: RunRow): string {
  const time = (s: number | null) => (s === null ? "failed" : `${Math.round(s)} s`);
  const tickets = row.tickets.length > 0 ? row.tickets.join(", ") : "none";
  const notes = row.notes.replaceAll("|", "\\|");
  return `| ${row.date} | ${row.ranIn} | \`${row.commit}\` | ${tickets} | ${time(row.testSeconds)} | ${time(row.buildSeconds)} | ${notes} |`;
}

/** Splits `tsc --noUnusedLocals --noUnusedParameters` output into unused code and everything else. */
export function parseTsc(output: string): TscResult {
  const result: TscResult = { unused: [], otherErrors: 0 };
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+)\((\d+),\d+\): error TS(\d+): (.*)$/.exec(line.trim());
    if (!match) continue;
    const [, file, lineNumber, code, message] = match;
    // The skills in .claude/ are copies kept unchanged, so their unused code isn't this repo's to fix.
    if (file.startsWith(".claude/")) continue;
    if (UNUSED_CODES.has(code)) result.unused.push({ file, line: Number(lineNumber), message });
    else result.otherErrors += 1;
  }
  return result;
}

function parseRow(row: string): LastRun {
  const [date, ranIn, commit, , test, build] = cells(row);
  if (ranIn !== "cloud" && ranIn !== "local") {
    throw new Error(`A Runs row's "Ran in" must be cloud or local: ${ranIn}`);
  }
  const sha = commit.replaceAll("`", "");
  if (!/^[0-9a-f]{7,40}$/.test(sha)) {
    throw new Error(`A Runs row's "Checked up to" isn't a commit: ${commit}`);
  }
  return { date, ranIn, commit: sha, testSeconds: seconds(test), buildSeconds: seconds(build) };
}

// A table row's cells, without the outer pipes. An escaped \| stays in its cell.
function cells(row: string): string[] {
  return row
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

function seconds(cell: string): number | null {
  const match = /^(\d+) s$/.exec(cell);
  return match ? Number(match[1]) : null;
}
