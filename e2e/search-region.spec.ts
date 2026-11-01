import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// A search the server turns down, like a Riot ID with no tag, must leave the
// region picker where the player put it, or their next search goes to the
// wrong region. Only a browser shows this: React resets the form after it
// sends it (JAS-135). None of these need the Riot key, except where they say.

// A preview's first visit starts a cold server (see smoke.spec.ts).
const FIRST_LOAD = { timeout: 30_000 };

const EXPIRED_KEY = "The site's Riot API key isn't working";
const NO_TAG_ERROR = /^Add the tag after a #/;

const BIG = "Player lookup";
const HEADER = "Search a player";

const FORMS = [
  { where: "home", path: "/", name: BIG },
  { where: "the 404 page", path: "/no-such-page", name: BIG },
  { where: "the header", path: "/how-it-works", name: HEADER },
];

// A search sent before React wakes up goes a different way, so wait for it.
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

    await expect(error).toHaveText(NO_TAG_ERROR);
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
  const expired = page.getByText(EXPIRED_KEY);
  await expect(heading.or(expired)).toBeVisible(FIRST_LOAD);
  test.skip(await expired.isVisible(), "Skipped: the Riot development key has expired.");

  const { form, region, riotId, search, error } = fields(page, BIG);
  await waitForReact(form);
  await expect(region).toHaveValue("kr");
  await expect(fields(page, HEADER).region).toHaveValue("kr");

  await region.selectOption("euw");
  await riotId.fill("NoTag");
  await search.click();

  await expect(error).toHaveText(NO_TAG_ERROR);
  await expect(region).toHaveValue("euw");
});

test("a corrected search goes to the picked region", async ({ page }) => {
  await page.goto("/");
  const { form, region, riotId, search, error } = fields(page, BIG);
  await waitForReact(form);

  await region.selectOption("euw");
  await riotId.fill("NoTag");
  await search.click();
  await expect(error).toHaveText(NO_TAG_ERROR);

  await riotId.fill("Hide on bush#KR1");
  await search.click();
  await expect(page).toHaveURL(/\/player\/euw\/Hide%20on%20bush-KR1/, FIRST_LOAD);
});

test("the button says it's looking while a search runs", async ({ page }) => {
  await page.goto("/");
  const { form, riotId, search, error } = fields(page, BIG);
  await waitForReact(form);

  // Slow the search down enough to see the button change.
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST") await new Promise((done) => setTimeout(done, 1000));
    await route.fallback();
  });
  await riotId.fill("NoTag");
  await search.click();

  await expect(form.getByRole("button", { name: "Looking up…" })).toBeDisabled();
  await expect(error).toHaveText(NO_TAG_ERROR);
  await expect(search).toBeEnabled();
});

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("a rejected search still shows its error", async ({ page }) => {
    await page.goto("/");
    const { riotId, search, error } = fields(page, BIG);
    await riotId.fill("NoTag");
    await search.click();
    await expect(error).toHaveText(NO_TAG_ERROR, FIRST_LOAD);
  });

  test("a search still goes to the picked region", async ({ page }) => {
    await page.goto("/");
    const { region, riotId, search } = fields(page, BIG);
    await region.selectOption("euw");
    await riotId.fill("Hide on bush#KR1");
    await search.click();
    await expect(page).toHaveURL(/\/player\/euw\/Hide%20on%20bush-KR1/, FIRST_LOAD);
  });
});
