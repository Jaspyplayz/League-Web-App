import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HowItWorksPage from "./page";
import { SECTIONS } from "./sections";

// The real header module pulls in sign-in code; the page only needs its link.
vi.mock("@/components/site-header", () => ({
  REPO_URL: "https://github.com/Jaspyplayz/League-Web-App",
}));

const html = renderToStaticMarkup(<HowItWorksPage />);

describe("How it works", () => {
  it("opens with the title, one sentence, the two links and the models at a glance", () => {
    const h1 = html.indexOf("How Turnpoint works</h1>");
    const example = html.indexOf("Open the example game");
    const source = html.indexOf("Source on GitHub");
    const glance = html.indexOf("The models at a glance</h2>");
    expect(h1).toBeGreaterThan(-1);
    expect(h1).toBeLessThan(example);
    expect(example).toBeLessThan(source);
    expect(source).toBeLessThan(glance);
  });

  it("has the sections in JAS-90's order, each one a target for the page's list and select", () => {
    expect(SECTIONS.map((s) => s.title)).toEqual([
      "The models at a glance",
      "1. The data",
      "2. Turning points",
      "3. Win chance",
      "4. Early, mid and late ratings",
      "5. Game score",
      "6. How it’s checked",
      "7. What it won’t do",
    ]);
    const headings = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
    expect(headings).toEqual(SECTIONS.map((s) => s.id));
    for (const s of SECTIONS.slice(1)) expect(html).toContain(`href="#${s.id}"`);
    expect(html).toContain("Jump to a section");
  });

  it("keeps the 12 rank models closed behind a button", () => {
    expect(html).toContain("Show the 12 rank models");
    expect(html).not.toMatch(/<details[^>]* open/);
  });

  it("links the three write-ups", () => {
    for (const doc of ["win-chance", "phase-ratings", "game-score"]) {
      expect(html).toContain(`/blob/main/docs/${doc}.md`);
    }
  });
});

// The Review board look: new token names only, sentence case, no condensed
// or mono type. The shared Panel still carries the old names until the
// contract ticket, so this reads the page's own files, not the HTML.
describe("the page's own files", () => {
  const folder = join(process.cwd(), "src/app/how-it-works");
  const files = readdirSync(folder).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));
  const OLD =
    /\b(?:bg|text|border|divide|accent|ring|fill|stroke)-(?:surface|surface-hover|line|line-strong|frame|ink|ink-soft|muted|faint)\b/;
  const RETIRED = /\b(?:uppercase|font-display|font-mono|soft-round(?:-sm)?)\b/;

  it.each(files)("%s uses only the new names", (file) => {
    const source = readFileSync(join(folder, file), "utf8");
    expect(source).not.toMatch(OLD);
    expect(source).not.toMatch(RETIRED);
  });
});
