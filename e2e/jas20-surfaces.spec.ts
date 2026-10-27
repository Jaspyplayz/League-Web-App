import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Key surfaces for JAS-20. The smoke job turns this on with JAS20_SHOTS=1
// and uploads the pngs. A normal smoke run skips it, so other PRs do not
// pay for a second pass over every data page.
//
// These shots are the proof. A Riot-key notice or the "sign-in isn't set
// up" panel is a failure, not a stand-in for the page.

const PLAYER = "/player/kr/Hide%20on%20bush-KR1";
const MATCH = `${PLAYER}/match/KR_8416261221`;
const OUT = path.join(process.cwd(), "test-results", "jas20-surfaces");
const READY = { timeout: 90_000 };

test.describe("JAS-20 key surfaces", () => {
  test.skip(process.env.JAS20_SHOTS !== "1", "Set JAS20_SHOTS=1 to capture key surfaces.");
  // One page at a time (the job passes --workers=1). A failed page must not
  // cancel the others, so this is not serial mode.
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sign-in shows Google and Discord", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Discord" })).toBeVisible();
    await rejectStandIns(page);
    await shot(page, "13-sign-in");
  });

  test("profile", async ({ page }) => {
    await page.goto(PLAYER);
    await expect(page.getByRole("region", { name: "Player summary" })).toBeVisible(READY);
    await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible();
    await rejectStandIns(page);
    await shot(page, "02-profile");
  });

  test("match summary", async ({ page }) => {
    await page.goto(MATCH);
    await expect(page.getByRole("region", { name: "Match summary" })).toContainText(
      "Victory",
      READY,
    );
    await expect(page.getByRole("tab", { name: "Summary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await rejectStandIns(page);
    await shot(page, "03-match-summary");
  });

  test("match deep dive", async ({ page }) => {
    await page.goto(MATCH);
    await expect(page.getByRole("tab", { name: "Deep dive" })).toBeVisible(READY);
    await page.getByRole("tab", { name: "Deep dive" }).click();
    await expect(page.getByRole("heading", { name: "Replay", exact: true })).toBeVisible();
    await rejectStandIns(page);
    await shot(page, "04-match-deep-dive");
  });

  test("insights overview", async ({ page }) => {
    await openInsights(page, "overview");
    await expect(page.getByRole("heading", { name: /weakness|Early game/i })).toBeVisible(READY);
    await shot(page, "12-insights-overview");
  });

  test("insights you vs others", async ({ page }) => {
    await openInsights(page, "others");
    await expect(page.getByRole("heading", { name: /^You vs |Compare with a player/ })).toBeVisible(
      READY,
    );
    await shot(page, "05-insights-you-vs-others");
  });

  test("insights habits and sessions", async ({ page }) => {
    await openInsights(page, "habits");
    await expect(page.getByRole("heading", { name: "Habits" })).toBeVisible(READY);
    await expect(page.getByRole("heading", { name: "Session blocks" })).toBeVisible();
    await shot(page, "12b-insights-habits-sessions");
  });

  test("champions", async ({ page }) => {
    await page.goto(`${PLAYER}/champions`);
    await expect(page.getByRole("link", { name: "Champions" })).toHaveAttribute(
      "aria-current",
      "page",
      READY,
    );
    await expect(page.getByText(/games/)).toBeVisible();
    await rejectStandIns(page);
    await shot(page, "06-champions");
  });

  test("player log", async ({ page }) => {
    await page.goto(`${PLAYER}/log`);
    await expect(page.getByRole("link", { name: "Log" })).toHaveAttribute(
      "aria-current",
      "page",
      READY,
    );
    await expect(page.getByRole("heading", { name: "Days" })).toBeVisible();
    await rejectStandIns(page);
    await shot(page, "08-player-log");
  });

  test("ask teaser", async ({ page }) => {
    await page.goto(`${PLAYER}/ask`);
    await expect(page.getByText("to ask questions about this player")).toBeVisible(READY);
    await expect(page.getByText("Illustration · not a real game")).toBeVisible();
    await rejectStandIns(page);
    await shot(page, "09-ask");
  });
});

async function openInsights(page: Page, view: string) {
  const query = view === "overview" ? "" : `?view=${view}`;
  await page.goto(`${PLAYER}/insights${query}`);
  const tab = view === "overview" ? "Overview" : view === "others" ? "You vs others" : "Habits and sessions";
  await expect(page.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page", READY);
  await rejectStandIns(page);
}

async function rejectStandIns(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text, "Riot-key notice is not this page").not.toContain(
    "The site's Riot API key isn't working",
  );
  expect(text, "unset sign-in is not this page").not.toContain(
    "Sign-in isn't set up on this copy",
  );
  expect(text, "Ask unavailable is not the composer").not.toContain("Ask isn't available right now");
  expect(text.toLowerCase(), "Vercel login is not this page").not.toContain("log in to vercel");
}

async function shot(page: Page, name: string) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}
