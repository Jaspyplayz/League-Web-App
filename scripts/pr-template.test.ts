import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `npm run can-merge` and the `reviewer` check find their lines by these
// labels and headings, so renaming one in the template would quietly break
// every PR opened from it.
const template = readFileSync(".github/pull_request_template.md", "utf8");

describe("the PR template", () => {
  it("keeps the lines the merge gates read", () => {
    expect(template.match(/^\*\*Tier:\*\*/gm)).toHaveLength(1);
    expect(template).toMatch(/^\*\*Builder:\*\* Claude Code/m);
    expect(template).toMatch(/^## Acceptance criteria$/m);
    expect(template).toMatch(/^## Review$/m);
  });

  it("puts the sections in the agreed order", () => {
    const headings = [...template.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual([
      "Summary",
      "Evidence",
      "Acceptance criteria",
      "Tested",
      "Not tested",
      "Merge Danger",
      "Review",
      "Docs and decisions touched",
    ]);
  });

  it("asks for the Merge Danger door and blast radius", () => {
    expect(template).toContain("**Door:**");
    expect(template).toContain("**Blast radius:**");
  });
});
