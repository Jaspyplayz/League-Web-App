import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// A search the server turns down, like a Riot ID with no tag, must leave the
// region picker where the player put it, or their next search goes to the
// wrong region. Only a browser shows this: React resets the form after it
// sends it (JAS-135). None of these need the Riot key, except where they say.

// A preview's first visit starts a cold server (see smoke.spec.ts), and a
// search can be the first request to wake it.
const FIRST_LOAD = { timeout: 30_000 };

// The titles Riot's failures show instead of the page, none of them a broken PR.
const RIOT_PROBLEM = /^(The site's Riot API key isn't working|Too many lookups right now|Riot's servers didn't answer)$/;
const NO_TAG_ERROR = /^Add the tag after a #/;

const BIG = "Player lookup";
const HEADER = "Search a player";

// An address no route matches shows the not-found page. On Vercel any search
// from it crashed into "Something went wrong", though `next dev` and
// `next start` were fine, so only a preview shows it (JAS-136).
const NO_ROUTE = "/no-such-page";

const FORMS = [
  { where: "home", path: "/", name: BIG },
  { where: "the header", path: "/how-it-works", name: HEADER },
  { where: "the not-found page", path: NO_ROUTE, name: BIG },
  { where: "the not-found page's header", path: NO_ROUTE, name: HEADER },
];

// A search sent before React wakes up goes a different way (JAS-139), so wait
// for it. The key is React's own, set about when it takes over the form.
async function waitForReact(form: Locator) {
  await expect(form).toBeVisible(FIRST_LOAD);
  await expect
    .poll(() => form.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps"))), FIRST_LOAD)
    .toBe(true);
}

function fields(page: Page, name: string) {
  const form = page.getByRole("search", { name });
  return {
    form,
    region: form.getByRole("combobox", { name: "Region" }),
    riotId: form.getByRole("textbox", { name: "Riot ID" }),
    search: form.getByRole("button", { name: "Search", exact: true }),
    error: form.getByRole("alert"),
  };
}

for (const { where, path, name } of FORMS) {
  test(`${where} keeps the picked region after a rejected search`, async ({ page }) => {
    await page.goto(path);
    const { form, region, riotId, search, error } = fields(page, name);
    await waitForReact(form);
    await expect(region).toHaveValue("na");

    await region.selectOption("euw");
    await riotId.fill("NoTag");
    await search.click();

    await expect(error).toHaveText(NO_TAG_ERROR, FIRST_LOAD);
    await expect(riotId).toHaveValue("NoTag");
    await expect(region).toHaveValue("euw");

    // And again, since the second search starts from what the first left.
    await search.click();
    await expect(error).toHaveText(NO_TAG_ERROR);
    await expect(region).toHaveValue("euw");
  });
}

test("the player-not-found page keeps the picked region after a rejected search", async ({ page }) => {
  // Finding no player takes a Riot lookup, so this one needs the key.
  await page.goto("/player/kr/Fakerzzq-KR2");
  const heading = page.getByRole("heading", { name: /^No player called/ });
  const riotProblem = page.getByText(RIOT_PROBLEM);
  await expect(heading.or(riotProblem)).toBeVisible(FIRST_LOAD);
  test.skip(await riotProblem.isVisible(), "Skipped: Riot couldn't answer the lookup.");

  const { form, region, riotId, search, error } = fields(page, BIG);
  await waitForReact(form);
  await expect(region).toHaveValue("kr");
  await expect(fields(page, HEADER).region).toHaveValue("kr");

  await region.selectOption("euw");
  await riotId.fill("NoTag");
  await search.click();

  await expect(error).toHaveText(NO_TAG_ERROR, FIRST_LOAD);
  await expect(region).toHaveValue("euw");
});

for (const name of [BIG, HEADER]) {
  test(`the not-found page's "${name}" form sends a search to the player's page`, async ({ page }) => {
    const response = await page.goto(NO_ROUTE);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
    const { form, region, riotId, search } = fields(page, name);
    await waitForReact(form);

    await region.selectOption("euw");
    await riotId.fill("Hide on bush#KR1");
    await search.click();
    await expect(page).toHaveURL(/\/player\/euw\/Hide%20on%20bush-KR1/, FIRST_LOAD);
  });
}

// React must keep the not-found page it finds, or a search typed while the
// scripts load is wiped. Rendering the page with a notFound() inside
// <Suspense> made React throw it away and draw it again.
test("the not-found page isn't drawn again when React loads", async ({ page }) => {
  await page.addInitScript(() => {
    const counted = window as unknown as { mainsRemoved: number };
    counted.mainsRemoved = 0;
    new MutationObserver((changes) => {
      for (const change of changes) {
        for (const node of change.removedNodes) if (node.nodeName === "MAIN") counted.mainsRemoved++;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(NO_ROUTE);
  // React swaps the page in the same step that hands it the form, so by now
  // any swap has happened.
  await waitForReact(page.getByRole("search", { name: BIG }));
  expect(await page.evaluate(() => (window as unknown as { mainsRemoved: number }).mainsRemoved)).toBe(0);
});

test("a corrected search goes to the picked region", async ({ page }) => {
  await page.goto("/");
  const { form, region, riotId, search, error } = fields(page, BIG);
  await waitForReact(form);

  await region.selectOption("euw");
  await riotId.fill("NoTag");
  await search.click();
  await expect(error).toHaveText(NO_TAG_ERROR, FIRST_LOAD);

  await riotId.fill("Hide on bush#KR1");
  await search.click();
  await expect(page).toHaveURL(/\/player\/euw\/Hide%20on%20bush-KR1/, FIRST_LOAD);
});

test("a search is sent once, and the button says it's looking meanwhile", async ({ page }) => {
  await page.goto("/");
  const { form, riotId, search, error } = fields(page, BIG);
  await waitForReact(form);

  // Slow the search down enough to see the button change. Next.js marks its
  // server action requests with this header. The form has both `onSubmit` and
  // `action`, so count them: only one of the two may send it.
  let sent = 0;
  await page.route("**/*", async (route) => {
    if (route.request().headers()["next-action"]) {
      sent++;
      await new Promise((done) => setTimeout(done, 1000));
    }
    await route.fallback();
  });
  await riotId.fill("NoTag");
  await search.click();

  await expect(form.getByRole("button", { name: "Looking up…" })).toBeDisabled();
  await expect(error).toHaveText(NO_TAG_ERROR, FIRST_LOAD);
  await expect(search).toBeEnabled();
  expect(sent).toBe(1);
});

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("a search still goes to the picked region", async ({ page }) => {
    await page.goto("/");
    const { region, riotId, search } = fields(page, BIG);
    await region.selectOption("euw");
    await riotId.fill("Hide on bush#KR1");
    await search.click();
    await expect(page).toHaveURL(/\/player\/euw\/Hide%20on%20bush-KR1/, FIRST_LOAD);
  });
});

// Bots that unfurl links, like Discord's, get the page rendered for them
// rather than the stored one. They need the 404 too, or a mistyped link shows
// up in chat as a real page.
test.describe("as a link-preview bot", () => {
  test.use({ userAgent: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)" });

  test("an address with no route answers 404", async ({ page }) => {
    const response = await page.goto(NO_ROUTE);
    expect(response?.status()).toBe(404);
  });
});
