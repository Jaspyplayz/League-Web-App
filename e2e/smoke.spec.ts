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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Turnpoint");

  await page.getByLabel("Riot ID").fill("Hide on bush#KR1");
  await page.getByLabel("Region").selectOption("kr");
  await page.getByRole("main").getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/player\/kr\/Hide%20on%20bush-KR1/);

  // Wait for either the profile or the expired-key notice, whichever comes.
  const profile = page.getByRole("region", { name: "Player summary" });
  const expired = page.getByText(EXPIRED_KEY);
  await expect(profile.or(expired)).toBeVisible();
  test.skip(await expired.isVisible(), "Skipped: the Riot development key has expired.");

  // The rank cards sit in the side column, next to the match list.
  await expect(page.getByRole("heading", { name: "Ranked Solo/Duo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible();

  // Matches switches to By day and back.
  const views = page.getByRole("navigation", { name: "Matches view" });
  await views.getByRole("link", { name: "By day" }).click();
  await expect(views.getByRole("link", { name: "By day" })).toHaveAttribute("aria-current", "page");
  // Days, or the empty panel if the player hasn't played in four weeks.
  const days = page.getByRole("heading", { name: "Days", exact: true });
  await expect(days.or(page.getByText(/^No games in the last/))).toBeVisible(FIRST_LOAD);
  await views.getByRole("link", { name: "List" }).click();
  await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible(FIRST_LOAD);

  // Each game row is one link to that game's match page.
  await page.getByRole("link", { name: /^Open this .+ game/ }).first().click();
  await expect(page).toHaveURL(/\/match\/KR_/);
  await expect(page.getByRole("tab", { name: "Summary" })).toBeVisible(FIRST_LOAD);
});

// The Log was a profile tab; it's now the By day view of Matches. Reaching
// the new address is enough, so this passes even with an expired Riot key.
test("send the old Log address to By day", async ({ page }) => {
  await page.goto("/player/kr/Hide%20on%20bush-KR1/log");
  await expect(page).toHaveURL(/\/player\/kr\/Hide%20on%20bush-KR1\?view=day$/);
});

// The sample game is served from the database, so unlike the search above it
// must work even when the Riot key has expired. Home's chart opens it too;
// `exact` keeps this to the button.
test("open the sample analysis", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Open this game", exact: true }).click();
  await expect(page).toHaveURL(/\/match\/KR_/);
  await expect(page.getByRole("region", { name: "Match summary" })).toContainText(
    "Victory",
    FIRST_LOAD,
  );
  await expect(page.getByText("Biggest swings")).toBeVisible();
  // A grade mark on the strip is a button: clicking one selects its play, and
  // the eval bar moves to that play's chance.
  const mark = page
    .getByRole("button", { name: /chance to win after it/ })
    .and(page.locator('[aria-pressed="false"]'))
    .first();
  const label = (await mark.getAttribute("aria-label")) ?? "";
  const chance = label.match(/\d+%$/)?.[0];
  await mark.click();
  // `mark` looks for an unpressed mark, so it now means a different one. A
  // mark's label doesn't change.
  await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("img", { name: `chance to win: ${chance}` })).toBeVisible();
  // The replay lives on the Replay tab, hidden until it's opened.
  const replay = page.getByRole("heading", { name: "Replay", exact: true });
  await expect(replay).toBeHidden();
  await page.getByRole("tab", { name: "Replay" }).click();
  await expect(replay).toBeVisible();

  // Game review's step buttons select the play on the board too, and its main
  // button opens the replay at that play.
  await page.getByRole("tab", { name: "Summary" }).click();
  const review = page.getByRole("region", { name: "Game review" });
  // The first play is already selected from the strip above, so this is the
  // second: picking a row has to move the selection for these to pass.
  await review.locator("ol button").nth(1).click();
  await expect(review.getByRole("button", { name: "First play" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /chance to win after it/ }).nth(1),
  ).toHaveAttribute("aria-pressed", "true");
  await review.getByRole("button", { name: "Last play" }).click();
  await expect(review.getByRole("button", { name: "Next play" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /chance to win after it/ }).last(),
  ).toHaveAttribute("aria-pressed", "true");
  await review.getByRole("button", { name: "Start review in the replay" }).click();
  await expect(page.getByRole("tab", { name: "Replay" })).toHaveAttribute("aria-selected", "true");
  await expect(replay).toBeVisible();
  // The sample game's last play starts at 24:15, and the replay opens on its
  // first whole second.
  await expect(page.getByRole("slider", { name: "Game time" })).toHaveAttribute(
    "aria-valuetext",
    /^24:1[56]:/,
  );
});

// The theme is applied by a script in <head>, so check it survives a reload:
// if that script broke, the page would come back dark.
test("switch to light mode from the header", async ({ page }) => {
  await page.goto("/how-it-works");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // The label says what the next click does.
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
});

// The theme was Settings' only choice, so the page sends old links home.
test("send the old Settings page home", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Turnpoint");
});

// Every page but home has a search in the header. Reaching the player's
// address is enough here, so this passes even with an expired Riot key.
test("search a player from the header on a match page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Open this game", exact: true }).click();
  await expect(page).toHaveURL(/\/match\/KR_/);
  const search = page.getByRole("search", { name: "Search a player" });
  // On a KR player's page the region starts on KR.
  await expect(search.getByLabel("Region")).toHaveValue("kr");
  await search.getByLabel("Riot ID").fill("Hide on bush#KR1");
  await search.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/player\/kr\/Hide%20on%20bush-KR1$/);
});

// A typo in a link should land on our own 404 page with a search box, not a
// blank dead end. Neither address needs Riot, so this works with an expired key.
test("show the not-found page for a bad link", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  // The page's own search box, not the header's.
  await expect(page.getByRole("main").getByLabel("Riot ID")).toBeVisible();

  // An unknown region calls notFound() from the player page.
  await page.goto("/player/xx/Hide%20on%20bush-KR1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
});
