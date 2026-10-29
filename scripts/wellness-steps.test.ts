import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatRow, lastRun, parseTsc, RUNS_HEADER } from "./wellness-steps";

const DOC = readFileSync(new URL("../docs/wellness.md", import.meta.url), "utf8");

function page(rows: string[]): string {
  return ["# Codebase wellness check", "", "## Runs", "", RUNS_HEADER, "|---|---|---|---|---|---|", ...rows, ""].join("\n");
}

describe("lastRun", () => {
  it("returns null before the first run", () => {
    expect(lastRun(page([]))).toBeNull();
  });

  it("reads the last row, not the first", () => {
    const run = lastRun(
      page([
        "| 2026-11-01 | `6c38dce` | JAS-40 | 41 s | 95 s | |",
        "| 2026-11-15 | `0e705c7` | none | 44 s | failed | build broke on a type error |",
      ]),
    );
    expect(run).toEqual({ date: "2026-11-15", commit: "0e705c7", testSeconds: 44, buildSeconds: null });
  });

  it("refuses a row whose commit isn't one, so a run never diffs from the wrong place", () => {
    expect(() => lastRun(page(["| 2026-11-01 | last week | none | 41 s | 95 s | |"]))).toThrow(/commit/);
  });

  it("reads the real page without throwing", () => {
    expect(() => lastRun(DOC)).not.toThrow();
  });
});

describe("formatRow", () => {
  it("writes a row lastRun reads back", () => {
    const row = formatRow({
      date: "2026-11-01",
      commit: "6c38dce",
      tickets: ["JAS-40", "JAS-41"],
      testSeconds: 41.4,
      buildSeconds: null,
      notes: "build failed | see JAS-41",
    });
    expect(row).toBe("| 2026-11-01 | `6c38dce` | JAS-40, JAS-41 | 41 s | failed | build failed \\| see JAS-41 |");
    expect(lastRun(page([row]))).toEqual({ date: "2026-11-01", commit: "6c38dce", testSeconds: 41, buildSeconds: null });
  });

  it("says none when a run made no tickets", () => {
    const row = formatRow({ date: "2026-11-01", commit: "6c38dce", tickets: [], testSeconds: 1, buildSeconds: 2, notes: "" });
    expect(row).toBe("| 2026-11-01 | `6c38dce` | none | 1 s | 2 s |  |");
  });

  it("has as many columns as the real page's Runs table", () => {
    expect(DOC).toContain(RUNS_HEADER);
    const row = formatRow({ date: "2026-11-01", commit: "6c38dce", tickets: [], testSeconds: 1, buildSeconds: 2, notes: "" });
    expect(row.split(" | ").length).toBe(RUNS_HEADER.split(" | ").length);
  });
});

describe("parseTsc", () => {
  it("picks out unused variables and parameters", () => {
    // Real output from main at 6c38dce, with Windows line endings.
    const output = [
      "src/lib/analyzer/ganks.test.ts(84,34): error TS6133: 'minute' is declared but its value is never read.",
      "src/lib/analyzer/positions.ts(107,51): error TS6133: 'p' is declared but its value is never read.",
    ].join("\r\n");
    expect(parseTsc(output)).toEqual({
      unused: [
        { file: "src/lib/analyzer/ganks.test.ts", line: 84, message: "'minute' is declared but its value is never read." },
        { file: "src/lib/analyzer/positions.ts", line: 107, message: "'p' is declared but its value is never read." },
      ],
      otherErrors: 0,
    });
  });

  it("counts real type errors apart, so they aren't reported as unused code", () => {
    const output = [
      "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/b.ts(3,1): error TS6192: All imports in import declaration are unused.",
    ].join("\n");
    expect(parseTsc(output)).toEqual({
      unused: [{ file: "src/b.ts", line: 3, message: "All imports in import declaration are unused." }],
      otherErrors: 1,
    });
  });

  it("finds nothing in a clean run", () => {
    expect(parseTsc("")).toEqual({ unused: [], otherErrors: 0 });
  });
});
