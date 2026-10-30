import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The agent mistakes log (docs/agent-mistakes.md and docs/agent-mistakes/).
// The postmortem skill (.claude/skills/postmortem/) writes it and wellness
// check 5 (docs/wellness.md) reads it, so an entry in another shape would be
// skipped instead of counted.

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

type Checklist = { problems: string[]; files: string[] };

// The reviewer's "## Judgement calls" checklist (.claude/agents/reviewer.md):
// "None yet." or one line per lesson, each naming its class file, so a reviewer
// that finds a repeat can tell the builder which class it repeats.
function readChecklist(raw: string): Checklist {
  const text = plainText(raw);
  const section = text.split(/^## /m).find((part) => part.startsWith("Judgement calls\n"));
  if (!section) return { problems: ['has no "## Judgement calls" section'], files: [] };
  const problems: string[] = [];
  const files: string[] = [];
  const lines = section.split("\n").slice(1);
  const bullets = lines.filter((line) => line.startsWith("- "));
  const empty = lines.some((line) => line.trim() === "None yet.");
  if (empty && bullets.length > 0) problems.push('says "None yet." above its lines');
  if (!empty && bullets.length === 0) problems.push('has no lines and no "None yet."');
  for (const line of bullets) {
    const match = line.match(/^- \S.* \(`docs\/agent-mistakes\/([^`]+\.md)`\)$/);
    if (match) files.push(match[1]);
    else problems.push(`has a line that isn't "- <what to look for> (\`docs/agent-mistakes/<file>.md\`)": ${line}`);
  }
  return { problems, files };
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

describe("readChecklist", () => {
  const intro = "Lessons a reader has to catch.\n\n";
  const line = "- A Tier line that names two tiers (`docs/agent-mistakes/tier-line-names-two-tiers.md`)";

  it("accepts an empty checklist", () => {
    expect(readChecklist(`## Judgement calls\n\n${intro}None yet.\n\n## Report\n`)).toEqual({ problems: [], files: [] });
  });

  it("reads each line's class file", () => {
    expect(readChecklist(`## Judgement calls\n\n${intro}${line}\n`)).toEqual({
      problems: [],
      files: ["tier-line-names-two-tiers.md"],
    });
  });

  it('refuses "None yet." left above a line', () => {
    expect(readChecklist(`## Judgement calls\n\n${intro}None yet.\n${line}\n`).problems).toEqual([
      'says "None yet." above its lines',
    ]);
  });

  it("refuses a line that links its class file instead of naming it", () => {
    const link = "- Look for X. ([class](../../docs/agent-mistakes/x.md))";
    expect(readChecklist(`## Judgement calls\n\n${intro}${link}\n`).problems).toHaveLength(1);
  });

  it("refuses a file with no checklist", () => {
    expect(readChecklist("## Report\n").problems).toEqual(['has no "## Judgement calls" section']);
  });
});

// Builders copy the skill's entry block and class table row, so a shape the
// readers refuse would put a wrong entry in every PR that follows it.
describe("the postmortem skill's templates", () => {
  const skill = plainText(readFileSync(".claude/skills/postmortem/SKILL.md", "utf8"));

  it("has an entry block the log accepts", () => {
    const block = skill.match(/these five lines in this order:\n\n```md\n([\s\S]*?)```/)?.[1];
    expect(block, 'the ```md block after "these five lines in this order:"').toBeDefined();
    expect(readClassFile(`# A class\n\n## 2026-10-30\n\n${block}`)).toMatchObject({ problems: [], entries: 1 });
  });

  it("has a class table row the index accepts", () => {
    const row = skill.match(/a new class gets a row `(\|.+?\|)`/)?.[1];
    expect(row, 'the row after "a new class gets a row"').toBeDefined();
    expect(readIndexRows(`| Class | Times seen | Rung |\n| --- | --- | --- |\n${row}\n`).problems).toEqual([]);
  });

  it("has a checklist line the reviewer's checklist accepts", () => {
    const template = skill.match(/replacing its `None yet\.`, as ``(.+?)``/)?.[1];
    expect(template, 'the line after "replacing its `None yet.`, as"').toBeDefined();
    expect(readChecklist(`## Judgement calls\n\n${template}\n`).problems).toEqual([]);
  });
});

// The postmortem starts from each blocker's last line, and wellness check 5
// counts them, so the reviewer must ask for these exact shapes.
describe("the reviewer's instructions", () => {
  const reviewer = plainText(readFileSync(".claude/agents/reviewer.md", "utf8"));
  const files = readdirSync(FOLDER).filter((name) => name.endsWith(".md"));

  it.each(["`Check could catch this: yes, <which check>`", "`Check could catch this: no, judgement call`"])(
    "ask each blocker to end with %s",
    (shape) => {
      expect(reviewer).toContain(shape);
    },
  );

  it("have a Judgement calls checklist whose lines name class files that exist", () => {
    const { problems, files: named } = readChecklist(reviewer);
    expect(problems).toEqual([]);
    expect(named.filter((name) => !files.includes(name))).toEqual([]);
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
