import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { appendFileSync } from "node:fs";

// An accessibility scan of the pages the smoke test visits, with axe, the
// checker behind Lighthouse's accessibility score. It finds what a computer
// can see on the page: missing labels, text without enough contrast, broken
// ARIA. Whether a screen reader user can follow a match page still takes a
// person trying it.
//
// What it finds is printed in the log and on the smoke test's run summary on
// GitHub, and fails the test, so a PR can't add a new problem. Set
// FAIL_ON_FINDINGS to false to only report, for example while fixing a batch
// of findings.
const FAIL_ON_FINDINGS = true;

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

// `only` limits the scan to part of the page, given as a CSS selector.
async function scan(page: Page, pageName: string, only?: string) {
  const axe = new AxeBuilder({ page }).withTags(STANDARD);
  if (only) axe.include(only);
  const { violations } = await axe.analyze();

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

// Switch the way a visitor does, with the header's sun and moon; the choice
// stays saved in this browser.
async function switchToLightMode(page: Page) {
  await page.goto("/how-it-works");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Turnpoint");
  await scan(page, "Home");
});

// The box of saved players is only on the page while it's open. The sample
// game's player has a rank on the preview, and the other has a dash.
test("scan the saved players box, in both themes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const players = [
      { region: "kr", gameName: "Hide on bush", tagLine: "KR1" },
      { region: "na", gameName: "Never Looked Up", tagLine: "0000" },
    ];
    localStorage.setItem("turnpoint:recent-players", JSON.stringify(players));
    localStorage.setItem("turnpoint:pinned-players", JSON.stringify(players.slice(0, 1)));
  });
  await page.reload();

  async function scanOpenBox(pageName: string) {
    await page.getByRole("textbox", { name: "Riot ID" }).click();
    await expect(page.getByRole("tab", { name: "Recent" })).toBeVisible();
    // Wait for the ranks, or the scan sees the empty badges instead.
    await expect(page.getByTitle("No solo queue rank on file").first()).toBeVisible(FIRST_LOAD);
    await scan(page, pageName, "form[role=search]");
  }

  await scanOpenBox("Saved players box");
  await switchToLightMode(page);
  await page.goto("/");
  await scanOpenBox("Saved players box, light mode");
});

async function selectLostPlay(page: Page) {
  const review = page.getByRole("region", { name: "Game review" });
  await review.locator("ol button", { hasText: "−" }).first().click();
  await expect(review.locator("ol button[aria-current]")).toContainText("−");
}

test("scan the sample analysis, all three tabs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Open this game", exact: true }).click();
  await expect(page.getByRole("region", { name: "Match summary" })).toContainText(
    "Victory",
    FIRST_LOAD,
  );
  await scan(page, "Sample analysis, Summary tab");

  // The sample game opens on a play you gained from. A lost one puts red text
  // on the selected row's fill.
  await selectLostPlay(page);
  await scan(page, "Sample analysis, Summary tab, a lost play selected");

  // Replay has the Ask panel beside it, whichever state Ask is in on the
  // preview (usually not set up there, since previews have no sign-in).
  await page.getByRole("tab", { name: "Replay" }).click();
  await expect(page.getByRole("heading", { name: "Replay", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask about this game" })).toBeVisible();
  await scan(page, "Sample analysis, Replay tab");

  await page.getByRole("tab", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Build and runes" })).toBeVisible();
  await scan(page, "Sample analysis, Stats tab");
});

test("scan a player page, in both themes", async ({ page }) => {
  await openPlayerPage(page);
  await scan(page, "Player page");

  await switchToLightMode(page);
  await openPlayerPage(page);
  await scan(page, "Player page, light mode");
});

test("scan the not-found page", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await scan(page, "Not-found page");
});

// On a phone the header's links move into a menu, which is only on the page
// while it's open, so open it before scanning, in both themes. Only the
// header is scanned: How it works is just a page that needs no database.
test("scan the phone header with its menu open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/how-it-works");
  await openPhoneMenu(page);
  await scan(page, "Phone header, menu open", "header");

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // The click outside the menu closed it.
  await openPhoneMenu(page);
  await scan(page, "Phone header, menu open, light mode", "header");
});

// The menu fades in, and axe would measure its text half faded, so wait
// until it's fully there.
async function openPhoneMenu(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("navigation", { name: "Main" });
  await expect(menu).toContainText("Example game");
  await expect(menu).toHaveCSS("opacity", "1");
}

// Light mode has its own colors, so its contrast is checked separately.
test("scan light mode", async ({ page }) => {
  await switchToLightMode(page);

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await scan(page, "Home, light mode");

  await page.getByRole("link", { name: "Open this game", exact: true }).click();
  await expect(page.getByRole("region", { name: "Match summary" })).toContainText(
    "Victory",
    FIRST_LOAD,
  );
  await scan(page, "Sample analysis, light mode");
  await selectLostPlay(page);
  await scan(page, "Sample analysis, light mode, a lost play selected");
});
