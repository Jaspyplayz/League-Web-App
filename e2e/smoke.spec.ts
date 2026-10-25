import { expect, test } from "./fixtures";

// One happy path through the real site: search a player, see their profile,
// open the sample analysis. It runs against each PR's Vercel preview, so it
// catches a page that crashes in production but passes the unit tests.

// The development Riot key expires every 24 hours. When it has, the site
// shows this message instead of a profile, and that's not a broken PR.
const EXPIRED_KEY = "The site's Riot API key isn't working";

// A preview's first visit starts a cold server and reads the game from the
// database, which can take longer than Playwright's default 5 seconds.
const FIRST_LOAD = { timeout: 30_000 };

// When a test fails, print what the page actually showed, so the CI log
// explains the failure. CI keeps no trace (see playwright.config.ts).
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const text = await page
    .locator("body")
    .innerText()
    .catch(() => "(page unreadable)");
  console.log(`Page at ${page.url()} showed:\n${text.slice(0, 1500)}`);
});

test("search a player and see their profile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find the minute");

  await page.getByLabel("Riot ID").fill("Hide on bush#KR1");
  await page.getByLabel("Region").selectOption("kr");
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page).toHaveURL(/\/player\/kr\/Hide%20on%20bush-KR1/);

  // Wait for either the profile or the expired-key notice, whichever comes.
  const profile = page.getByRole("region", { name: "Player summary" });
  const expired = page.getByText(EXPIRED_KEY);
  await expect(profile.or(expired)).toBeVisible();
  test.skip(await expired.isVisible(), "Skipped: the Riot development key has expired.");

  // The rank cards sit in the side column, next to the match list.
  await expect(page.getByRole("heading", { name: "Ranked Solo/Duo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible();
});

// The sample game is served from the database, so unlike the search above it
// must work even when the Riot key has expired.
test("open the sample analysis", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "See a sample analysis" }).click();
  await expect(page).toHaveURL(/\/match\/KR_/);
  await expect(page.getByRole("region", { name: "Match summary" })).toContainText(
    "Victory",
    FIRST_LOAD,
  );
  await expect(page.getByText("Biggest swings")).toBeVisible();
  // The replay lives on the Deep dive tab, hidden until it's opened.
  const replay = page.getByRole("heading", { name: "Replay", exact: true });
  await expect(replay).toBeHidden();
  await page.getByRole("tab", { name: "Deep dive" }).click();
  await expect(replay).toBeVisible();
});

// The theme is applied by a script in <head>, so check it survives a reload:
// if that script broke, the page would come back dark.
test("switch to light mode in Settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("radio", { name: /^Light/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: /^Light/ })).toBeChecked();
});

// A typo in a link should land on our own 404 page with a search box, not a
// blank dead end. Neither address needs Riot, so this works with an expired key.
test("show the not-found page for a bad link", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await expect(page.getByLabel("Riot ID")).toBeVisible();

  // An unknown region calls notFound() from the player page.
  await page.goto("/player/xx/Hide%20on%20bush-KR1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
});
