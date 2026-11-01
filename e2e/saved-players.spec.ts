import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The box of saved players under the search. Most of these fake the server's
// answer, since a preview has no sign-in and its database decides the ranks.
// The last one asks the real route.

// A preview's first visit starts a cold server (see smoke.spec.ts).
const FIRST_LOAD = { timeout: 30_000 };

const faker = { region: "kr", gameName: "Hide on bush", tagLine: "KR1" };
const fakerKey = "kr/hide on bush#kr1";
const me = { region: "na", gameName: "Turnpoint Tester", tagLine: "NA1" };
const NO_RANK = "No solo queue rank on file";

async function openHomeWithSaved(page: Page, recent: unknown[], pinned: unknown[] = []) {
  await page.goto("/");
  await page.evaluate(
    ([r, p]) => {
      localStorage.setItem("turnpoint:recent-players", JSON.stringify(r));
      localStorage.setItem("turnpoint:pinned-players", JSON.stringify(p));
    },
    [recent, pinned],
  );
  await page.reload();
}

// Answers the box's requests in turn, repeating the last, and counts them.
async function fakeAnswers(page: Page, answers: { status?: number; json?: unknown }[]) {
  const seen = { requests: 0 };
  await page.route("**/api/saved-players", (route) => {
    const answer = answers[Math.min(seen.requests, answers.length - 1)];
    seen.requests++;
    return route.fulfill(answer);
  });
  return seen;
}

const riotId = (page: Page) => page.getByRole("textbox", { name: "Riot ID" });
const recentTab = (page: Page) => page.getByRole("tab", { name: /^Recent/ });

test("stays shut with nothing saved", async ({ page }) => {
  await page.goto("/");
  await riotId(page).click();
  await riotId(page).pressSequentially("hide");
  await expect(recentTab(page)).toBeHidden();
});

test("closes on Escape and on a click outside", async ({ page }) => {
  await openHomeWithSaved(page, [faker]);
  await riotId(page).click();
  await expect(recentTab(page)).toBeVisible(FIRST_LOAD);

  await page.keyboard.press("Escape");
  await expect(recentTab(page)).toBeHidden();
  await expect(riotId(page)).toBeFocused();

  await riotId(page).click();
  await expect(recentTab(page)).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(recentTab(page)).toBeHidden();
});

// "This is me" on a profile keeps the header's search mounted, so a box that
// asked only once would never show the new row.
test("asks the server again each time it opens", async ({ page }) => {
  const seen = await fakeAnswers(page, [
    { json: { ranks: { [fakerKey]: null }, you: null } },
    { json: { ranks: { [fakerKey]: { tier: "DIAMOND", division: "I" } }, you: me } },
  ]);
  await openHomeWithSaved(page, [faker]);

  await riotId(page).click();
  await expect(page.getByTitle(NO_RANK)).toBeVisible(FIRST_LOAD);
  await expect(page.getByText("You", { exact: true })).toBeHidden();
  await page.keyboard.press("Escape");

  await riotId(page).click();
  await expect(page.getByText("You", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Diamond I")).toBeVisible();
  expect(seen.requests).toBe(2);
});

test("shows no dash when the read fails, and tries again next time", async ({ page }) => {
  const seen = await fakeAnswers(page, [
    { status: 503 },
    { json: { ranks: { [fakerKey]: { tier: "DIAMOND", division: "I" } }, you: null } },
  ]);
  await openHomeWithSaved(page, [faker]);

  await riotId(page).click();
  await expect(recentTab(page)).toBeVisible(FIRST_LOAD);
  await expect.poll(() => seen.requests).toBe(1);
  await expect(page.getByTitle(NO_RANK)).toBeHidden();
  await page.keyboard.press("Escape");

  await riotId(page).click();
  await expect(page.getByTitle("Diamond I")).toBeVisible();
});

test("hands focus back when a row leaves under the keyboard", async ({ page }) => {
  await fakeAnswers(page, [{ json: { ranks: {}, you: null } }]);
  await openHomeWithSaved(page, [], [faker]);
  await riotId(page).click();

  const unpin = page.getByRole("button", { name: "Unpin Hide on bush#KR1" });
  await unpin.focus();
  await page.keyboard.press("Enter");
  await expect(unpin).toBeHidden();
  await expect(riotId(page)).toBeFocused();
});

// A broken query answers 503, and the box alone would just stay blank.
test("the real route answers for every player it's asked about", async ({ page }) => {
  await page.goto("/");
  const answer = await page.evaluate(async (player) => {
    const response = await fetch("/api/saved-players", {
      method: "POST",
      body: JSON.stringify([player, { region: "na", gameName: "Never Looked Up", tagLine: "0000" }]),
    });
    return { status: response.status, body: await response.json() };
  }, faker);

  expect(answer.status).toBe(200);
  expect(Object.keys(answer.body.ranks).sort()).toEqual([fakerKey, "na/never looked up#0000"]);
  expect(answer.body.ranks["na/never looked up#0000"]).toBeNull();
  expect(answer.body.you).toBeNull();
});
