import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The agent mistakes log (docs/agent-mistakes.md and docs/agent-mistakes/).
// The postmortem skill (JAS-63) will write it and the wellness check (JAS-65)
// will read it, so an entry in another shape would be skipped instead of counted.

const LINES = ["What happened", "Evidence", "Root cause", "Rung", "Fix"];
const RUNGS = ["design", "check", "rule file or skill", "CLAUDE.md line", "none yet"];
const FOLDER = "docs/agent-mistakes";

type ClassFile = { problems: string[]; entries: number; rung: string | undefined };

// Git on Jasper's PC checks text files out with Windows line endings
// (core.autocrlf), and CI's Linux checkout doesn't, so both must read the same.
// Notepad's "UTF-8 with BOM" adds an invisible character before the # title.
const plainText = (text: string) => text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

// A real calendar date in YYYY-MM-DD, so 2026-13-45 and 2026-02-30 don't count.
function isDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  // A day past the month's end can roll into the next month instead of failing.
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(text);
}

// Reads one class file: a # title, then a ## YYYY-MM-DD section per
// occurrence holding the five lines in order. `rung` is the newest entry's.
function readClassFile(raw: string): ClassFile {
  const text = plainText(raw);
  const problems: string[] = [];
  if (!/^# \S/.test(text)) problems.push("doesn't start with a # title");
  const sections = text.split(/^## /m).slice(1);
  if (sections.length === 0) problems.push("has no ## YYYY-MM-DD entry");
  let rung: string | undefined;
  let newest = "";
  for (const section of sections) {
    const [heading, ...body] = section.split("\n");
    const date = heading.trim();
    if (!isDate(date)) {
      problems.push(`has a section "## ${date}" that isn't a date`);
      continue;
    }
    // Each line looks like "- **Name:** value".
    const lines = body.flatMap((line) => {
      const match = line.match(/^- \*\*(.+?):\*\* (\S.*)$/);
      return match ? [{ name: match[1], value: match[2].trim() }] : [];
    });
    const names = lines.map(({ name }) => name);
    if (names.join("|") !== LINES.join("|")) {
      problems.push(`entry ${date} has the lines ${names.join(", ") || "none"}, not ${LINES.join(", ")}`);
      continue;
    }
    const entryRung = lines[LINES.indexOf("Rung")].value;
    if (!RUNGS.includes(entryRung)) {
      problems.push(`entry ${date} names the rung "${entryRung}", not one of: ${RUNGS.join(", ")}`);
    }
    // Dates in YYYY-MM-DD sort as text.
    if (date >= newest) {
      newest = date;
      rung = entryRung;
    }
  }
  return { problems, entries: sections.length, rung };
}

type IndexRows = { problems: string[]; rows: Map<string, { entries: number; rung: string }> };

// The index's class table: one row per class file, with its count and rung.
// Any other row in it, such as an old-style one-row postmortem, is a problem.
function readIndexRows(raw: string): IndexRows {
  const problems: string[] = [];
  const rows = new Map<string, { entries: number; rung: string }>();
  const lines = plainText(raw).split("\n");
  const header = lines.indexOf("| Class | Times seen | Rung |");
  if (header === -1) return { problems: ['has no "| Class | Times seen | Rung |" table'], rows };
  // Skip the header and the |---| line under it; the table ends at the first non-table line.
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) break;
    const match = line.match(/^\| \[.+?\]\(agent-mistakes\/(.+?\.md)\) \| (\d+) \| (.+?) \|$/);
    if (match) rows.set(match[1], { entries: Number(match[2]), rung: match[3].trim() });
    else problems.push(`has a class table row that isn't "| [title](agent-mistakes/<file>.md) | <count> | <rung> |": ${line}`);
  }
  return { problems, rows };
}

const GOOD = `# A class

What it is.

## 2026-10-29

- **What happened:** a thing.
- **Evidence:** PR 1.
- **Root cause:** a belief.
- **Rung:** none yet
- **Fix:** JAS-1.
`;

describe("readClassFile", () => {
  it("accepts a well-formed entry", () => {
    expect(readClassFile(GOOD)).toEqual({ problems: [], entries: 1, rung: "none yet" });
  });

  it("names a missing line", () => {
    const { problems } = readClassFile(GOOD.replace("- **Root cause:** a belief.\n", ""));
    expect(problems).toEqual([
      "entry 2026-10-29 has the lines What happened, Evidence, Rung, Fix, not What happened, Evidence, Root cause, Rung, Fix",
    ]);
  });

  it("refuses a rung that isn't on the ladder", () => {
    const { problems } = readClassFile(GOOD.replace("none yet", "Check, plus the rule file"));
    expect(problems).toEqual([
      'entry 2026-10-29 names the rung "Check, plus the rule file", not one of: design, check, rule file or skill, CLAUDE.md line, none yet',
    ]);
  });

  it("refuses a section heading that isn't a date", () => {
    expect(readClassFile(GOOD.replace("## 2026-10-29", "## Second time")).problems).toEqual([
      'has a section "## Second time" that isn\'t a date',
    ]);
  });

  it("refuses a date that isn't on the calendar", () => {
    expect(readClassFile(GOOD.replace("2026-10-29", "2026-13-45")).problems).toEqual([
      'has a section "## 2026-13-45" that isn\'t a date',
    ]);
  });

  it("counts repeats and takes the newest entry's rung", () => {
    const repeat = GOOD.replace("none yet", "check").replace("2026-10-29", "2026-11-02").split("\n").slice(4).join("\n");
    expect(readClassFile(`${GOOD}\n${repeat}`)).toMatchObject({ entries: 2, rung: "check" });
  });

  it("reads a file with Windows line endings the same", () => {
    expect(readClassFile(GOOD.replace(/\n/g, "\r\n"))).toEqual(readClassFile(GOOD));
  });

  it("reads a file saved with a byte-order mark the same", () => {
    expect(readClassFile(`\uFEFF${GOOD}`)).toEqual(readClassFile(GOOD));
  });
});

const INDEX = `| Class | Times seen | Rung |
| ----- | ---------- | ---- |
| [A class](agent-mistakes/a-class.md) | 1 | none yet |

After the table.
`;

describe("readIndexRows", () => {
  it("reads each row's file, count and rung", () => {
    expect(readIndexRows(INDEX)).toEqual({
      problems: [],
      rows: new Map([["a-class.md", { entries: 1, rung: "none yet" }]]),
    });
  });

  it("refuses a row in another shape, such as an old one-row postmortem", () => {
    const old = "| 2026-11-01 | Claude did a thing | PR 1 | a belief | Check, plus the rule file | PR 2 |";
    const { problems } = readIndexRows(INDEX.replace("\n\nAfter", `\n${old}\n\nAfter`));
    expect(problems).toEqual([
      `has a class table row that isn't "| [title](agent-mistakes/<file>.md) | <count> | <rung> |": ${old}`,
    ]);
  });

  it("reads a file with Windows line endings the same", () => {
    expect(readIndexRows(INDEX.replace(/\n/g, "\r\n"))).toEqual(readIndexRows(INDEX));
  });
});

describe("the agent mistakes log", () => {
  const files = readdirSync(FOLDER).filter((name) => name.endsWith(".md"));
  const { problems, rows } = readIndexRows(readFileSync("docs/agent-mistakes.md", "utf8"));

  it("has at least one class file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("has a class table with only rows it can read", () => {
    expect(problems).toEqual([]);
  });

  it.each(files)("%s is well formed and matches its row in the index", (name) => {
    const file = readClassFile(readFileSync(`${FOLDER}/${name}`, "utf8"));
    expect(file.problems).toEqual([]);
    expect(rows.get(name), `${name}'s row in docs/agent-mistakes.md's class table`).toEqual({
      entries: file.entries,
      rung: file.rung,
    });
  });

  it("lists no class file that doesn't exist", () => {
    expect([...rows.keys()].filter((name) => !files.includes(name))).toEqual([]);
  });
});
