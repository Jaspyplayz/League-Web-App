import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The agent mistakes log (docs/agent-mistakes.md and docs/agent-mistakes/).
// The postmortem skill writes it and the wellness check reads it, so an entry
// in another shape would be skipped instead of counted.

const LINES = ["What happened", "Evidence", "Root cause", "Rung", "Fix"];
const RUNGS = ["design", "check", "rule file or skill", "CLAUDE.md line", "none yet"];
const FOLDER = "docs/agent-mistakes";

type ClassFile = { problems: string[]; entries: number; rung: string | undefined };

// Reads one class file: a # title, then a ## YYYY-MM-DD section per
// occurrence holding the five lines in order. `rung` is the newest entry's.
function readClassFile(text: string): ClassFile {
  const problems: string[] = [];
  if (!/^# \S/.test(text)) problems.push("doesn't start with a # title");
  const sections = text.split(/^## /m).slice(1);
  if (sections.length === 0) problems.push("has no ## YYYY-MM-DD entry");
  let rung: string | undefined;
  let newest = "";
  for (const section of sections) {
    const [heading, ...body] = section.split("\n");
    const date = heading.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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

// The index's class table: one row per class file, with its count and rung.
function readIndexRows(text: string): Map<string, { entries: number; rung: string }> {
  const rows = new Map<string, { entries: number; rung: string }>();
  for (const match of text.matchAll(/^\| \[.+?\]\(agent-mistakes\/(.+?\.md)\) \| (\d+) \| (.+?) \|$/gm)) {
    rows.set(match[1], { entries: Number(match[2]), rung: match[3].trim() });
  }
  return rows;
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

  it("counts repeats and takes the newest entry's rung", () => {
    const repeat = GOOD.replace("none yet", "check").replace("2026-10-29", "2026-11-02").split("\n").slice(4).join("\n");
    expect(readClassFile(`${GOOD}\n${repeat}`)).toMatchObject({ entries: 2, rung: "check" });
  });
});

describe("the agent mistakes log", () => {
  const files = readdirSync(FOLDER).filter((name) => name.endsWith(".md"));
  const rows = readIndexRows(readFileSync("docs/agent-mistakes.md", "utf8"));

  it("has at least one class file", () => {
    expect(files.length).toBeGreaterThan(0);
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
