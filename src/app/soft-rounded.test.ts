import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Walks src and fails if the beveled "Clean HUD" corners come back.
// Soft Rounded is one pair of tokens in globals.css; a one-off cut
// on a single card is how the rest of the app drifted last time.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("Soft Rounded chrome", () => {
  it("keeps beveled corners out of src", () => {
    const banned = [/hud-cut/, /corner-shape\s*:/, /border-radius:\s*[^;{]*\b0\b/];
    const hits: string[] = [];
    for (const path of sourceFiles("src")) {
      if (!/\.(tsx|css)$/.test(path)) continue;
      const text = readFileSync(path, "utf8");
      for (const pattern of banned) {
        if (pattern.test(text)) hits.push(`${path} matches ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("defines the two radii the cards and controls share", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("--radius-soft: 20px");
    expect(css).toContain("--radius-soft-sm: 12px");
    expect(css).toContain("@utility soft-round");
    expect(css).toContain("@utility soft-round-sm");

    const panel = readFileSync("src/components/ui/panel.tsx", "utf8");
    expect(panel).toContain('export const panelClass = "soft-round border border-frame bg-surface"');
    expect(panel).toContain("export const softPanelClass = panelClass");
  });
});
