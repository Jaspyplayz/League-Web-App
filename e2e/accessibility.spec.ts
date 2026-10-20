import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { appendFileSync } from "node:fs";

// An accessibility scan of the pages the smoke test visits, with axe, the
// checker behind Lighthouse's accessibility score. It finds what a computer
// can see on the page: missing labels, text without enough contrast, broken
// ARIA. Whether a screen reader user can follow a match page still takes a
// person trying it.
//
// Report only for now: what it finds is printed in the log and on the smoke
// test's run summary on GitHub, and the test passes anyway. Once those are
// fixed, set FAIL_ON_FINDINGS to true so a new problem fails the PR.
const FAIL_ON_FINDINGS = false;

// WCAG 2.1 levels A and AA, the standard most accessibility laws point to.
const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// The sample game is read from the database, and a preview's first visit
// starts a cold server (see smoke.spec.ts).
const FIRST_LOAD = { timeout: 30_000 };

// Shown instead of a player's profile once the development Riot key has
// expired, which isn't a broken PR (see smoke.spec.ts).
const EXPIRED_KEY = "The site's Riot API key isn't working";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

async function scan(page: Page, pageName: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(STANDARD).analyze();

  const heading =
    violations.length === 0
      ? `### ${pageName}: nothing found`
      : `### ${pageName}: ${plural(violations.length, "kind")} of problem`;
  const lines = violations.map((v) => {
    const first = v.nodes[0]?.target.join(" ").slice(0, 120) ?? "";
    return `- ${v.impact ?? "unrated"}: ${v.help} (${v.id}) on ${plural(v.nodes.length, "element")}, first \`${first}\`. ${v.helpUrl}`;
  });
  const report = [heading, ...lines].join("\n");
  console.log(report);
  // GitHub shows this file on the workflow run's summary page.
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${report}\n\n`);

  if (FAIL_ON_FINDINGS) expect(violations.map((v) => v.id)).toEqual([]);
}

// Switch the way a visitor does; the choice stays saved in this browser.
async function switchToLightMode(page: Page) {
  await page.goto("/settings");
  await page.getByRole("radio", { name: /^Light/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
}

// The profile the smoke test searches for. Skips the test when the Riot key
// has expired, since the page then shows only the notice.
async function openPlayerPage(page: Page) {
  await page.goto("/player/kr/Hide%20on%20bush-KR1");
  const profile = page.getByRole("region", { name: "Player summary" });
  const expired = page.getByText(EXPIRED_KEY);
  await expect(profile.or(expired)).toBeVisible(FIRST_LOAD);
  test.skip(await expired.isVisible(), "Skipped: the Riot development key has expired.");
  await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible();
}

test("scan the home page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find the minute");
  await scan(page, "Home");
});

test("scan the sample analysis, both tabs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "See a sample analysis" }).click();
  await expect(page.getByRole("region", { name: "Match summary" })).toContainText(
    "Victory",
    FIRST_LOAD,
  );
  await scan(page, "Sample analysis, Summary tab");

  await page.getByRole("tab", { name: "Deep dive" }).click();
  await expect(page.getByRole("heading", { name: "Replay", exact: true })).toBeVisible();
  await scan(page, "Sample analysis, Deep dive tab");
});

test("scan a player page, in both themes", async ({ page }) => {
  await openPlayerPage(page);
  await scan(page, "Player page");

  await switchToLightMode(page);
  await openPlayerPage(page);
  await scan(page, "Player page, light mode");
});

test("scan Settings and the not-found page", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await scan(page, "Settings");

  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await scan(page, "Not-found page");
});

// Light mode has its own colors, so its contrast is checked separately.
test("scan light mode", async ({ page }) => {
  await switchToLightMode(page);

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await scan(page, "Home, light mode");

  await page.getByRole("link", { name: "See a sample analysis" }).click();
  await expect(page.getByRole("region", { name: "Match summary" })).toContainText(
    "Victory",
    FIRST_LOAD,
  );
  await scan(page, "Sample analysis, light mode");
});
