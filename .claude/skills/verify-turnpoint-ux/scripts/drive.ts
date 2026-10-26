// UX journeys for verify-turnpoint-ux: how flows feel to a player, not just
// whether data shows. Shares the harness, launch, doctor and cleanup of the
// sibling skill (../../verify-turnpoint/scripts/). Usage (from the repo root):
//   npx tsx .cursor/skills/verify-turnpoint-ux/scripts/drive.ts --list
//   npx tsx .cursor/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url>] [--run <id>] <journey...|all>

import type { Page } from "@playwright/test";
import {
  assertAppPage,
  expect,
  main,
  TEST_PLAYER,
  type Journey,
} from "../../verify-turnpoint/scripts/runner";

const LOAD = { timeout: 45_000 };

/**
 * Calm = no error alert on screen. Next.js's route announcer (<next-route-announcer>,
 * id __next-route-announcer__) is also role=alert and reads the new page's title after a
 * client-side navigation, so it is not an error and is skipped.
 */
async function expectCalm(page: Page) {
  const alerts = await page.evaluate(() =>
    [...document.querySelectorAll('[role="alert"]')]
      .filter((el) => el.id !== "__next-route-announcer__" && !el.closest("next-route-announcer"))
      .map((el) => (el as HTMLElement).innerText.trim())
      .filter(Boolean),
  );
  if (alerts.length) throw new Error(`alert on screen: "${alerts[0].slice(0, 120)}"`);
  await assertAppPage(page);
}

/** The innermost element that holds a panel heading (panels without aria-labelledby). */
function panel(page: Page, heading: string) {
  return page
    .locator("section, div")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
    .last();
}

async function inViewport(page: Page, name: string) {
  const box = await page.getByRole("heading", { name, exact: true }).boundingBox();
  const vh = page.viewportSize()!.height;
  if (!box || box.y < -box.height || box.y > vh) throw new Error(`"${name}" heading is not on screen (y=${box?.y})`);
}

const journeys: Journey[] = [
  {
    name: "ux-search-recovery",
    feature: "search-recovery.md",
    needs: ["nothing"],
    run: async ({ page, step }) => {
      await step("open home", async () => {
        await page.goto("/", LOAD);
        await expect(page.getByRole("search", { name: "Player lookup" })).toBeVisible(LOAD);
        await expectCalm(page);
      });
      await step("submit a riot id without a tag", async () => {
        await page.getByLabel("Riot ID").fill("Faker");
        await page.getByRole("button", { name: "Analyze" }).click();
        const alert = page.locator("#search-error");
        await expect(alert).toHaveText("Enter a Riot ID like Faker#KR1.", LOAD);
        await expect(alert).toHaveRole("alert");
        await expect(page.getByLabel("Riot ID")).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByLabel("Riot ID")).toHaveAttribute("aria-describedby", "search-error");
      });
      await step("input kept and page did not move", async () => {
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByLabel("Riot ID")).toHaveValue("Faker");
        await expect(page.getByRole("button", { name: "Analyze" })).toBeEnabled();
      });
    },
  },
  {
    name: "ux-phone-home",
    feature: "phone-home.md",
    needs: ["nothing"],
    phone: true,
    run: async ({ page, step, note }) => {
      await step("open home on a phone", async () => {
        await page.goto("/", LOAD);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(/Find the minute/i, LOAD);
        await expectCalm(page);
      });
      await step("no sideways scroll and form fits", async () => {
        const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        note("scrollWidth", sw);
        note("clientWidth", cw);
        if (sw > cw + 1) throw new Error(`page scrolls sideways: scrollWidth ${sw} > clientWidth ${cw}`);
        const btn = await page.getByRole("button", { name: "Analyze" }).boundingBox();
        if (!btn || btn.x < 0 || btn.x + btn.width > cw + 1) throw new Error(`Analyze button is off screen: ${JSON.stringify(btn)}`);
        if (btn.height < 44) throw new Error(`Analyze tap target is ${btn.height}px tall, under 44px`);
      });
      await step("scroll to the start cards", async () => {
        const cards = page.getByRole("region", { name: "Look at a game" });
        await cards.scrollIntoViewIfNeeded();
        await expect(cards.getByRole("link", { name: /See a sample analysis/ })).toBeVisible();
      });
    },
  },
  {
    name: "ux-review-path",
    feature: "review-path.md",
    needs: ["database"],
    run: async ({ page, step, note }) => {
      await step("open home", async () => {
        await page.goto("/", LOAD);
        await expectCalm(page);
      });
      await step("choose see a sample analysis", async () => {
        await page.getByRole("link", { name: /See a sample analysis/ }).click();
        await expect(page).toHaveURL(/\/match\/KR_8416261221/, LOAD);
        await expect(page.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true", LOAD);
        await expectCalm(page);
      });
      await step("reach the 60-second review", async () => {
        const review = page.getByRole("region", { name: "60-second review" });
        await review.scrollIntoViewIfNeeded();
        await expect(review.getByRole("listitem").first()).toBeVisible();
        note("firstMoment", (await review.getByRole("listitem").first().innerText()).split("\n").slice(0, 3).join(" | "));
      });
      await step("watch the first moment in the replay", async () => {
        const review = page.getByRole("region", { name: "60-second review" });
        await review.getByRole("button", { name: "Watch in replay" }).first().click();
        await expect(page.getByRole("tab", { name: "Deep dive" })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tabpanel", { name: "Summary" })).toBeHidden();
        await expect(page.getByRole("heading", { name: "Replay", exact: true })).toBeVisible();
        await page.waitForTimeout(500); // reducedMotion is set; this only lets the scroll land
        await inViewport(page, "Replay");
      });
      await step("back to summary keeps the review", async () => {
        await page.getByRole("tab", { name: "Summary" }).click();
        await expect(page.getByRole("region", { name: "60-second review" })).toBeVisible();
      });
    },
  },
  {
    name: "ux-signed-out-teasers",
    feature: "signed-out-teasers.md",
    needs: ["riot", "supabase"],
    run: async ({ page, step }) => {
      await step("ask tab signed out", async () => {
        await page.goto(`${TEST_PLAYER.path}/ask`, LOAD);
        await expectCalm(page);
        const main = page.getByRole("main");
        await expect(main.getByText("to ask questions about this player")).toBeVisible(LOAD);
        await expect(main.getByText("Illustration · not a real game")).toBeVisible();
        await expect(main.getByRole("textbox")).toHaveCount(0);
      });
      await step("sign in from the teaser keeps the way back", async () => {
        await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
        await expect(page).toHaveURL(/\/sign-in\?next=%2Fplayer%2Fkr%2FHide%2520on%2520bush-KR1%2Fask/, LOAD);
        await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue with Discord" })).toBeVisible();
      });
      await step("game recap teaser on the sample game", async () => {
        await page.goto("/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221", LOAD);
        const recap = panel(page, "Game recap");
        await recap.scrollIntoViewIfNeeded();
        await expect(recap.getByText("to get a short written recap of this game.")).toBeVisible(LOAD);
        await expect(recap.getByText("Illustration · not a real game")).toBeVisible();
        await expect(recap.getByRole("button", { name: /recap/i })).toHaveCount(0);
      });
      await step("add to notes signed out lands on the notes teaser", async () => {
        const review = page.getByRole("region", { name: "60-second review" });
        await review.getByRole("button", { name: "Add to notes" }).first().click();
        await page.waitForTimeout(500);
        await inViewport(page, "Your notes");
        await expect(panel(page, "Your notes").getByText("to keep private notes on this game")).toBeVisible();
        await expect(page.locator("#match-note")).toHaveCount(0);
      });
    },
  },
  {
    name: "ux-insights-peer-card",
    feature: "insights-peer-card.md",
    needs: ["riot", "database"],
    run: async ({ page, step, note }) => {
      await step("open you vs others", async () => {
        await page.goto(`${TEST_PLAYER.path}/insights?view=others`, LOAD);
        await expectCalm(page);
        await expect(page.getByRole("region", { name: /^You vs / }).first()).toBeVisible(LOAD);
      });
      await step("peer card leads with one skill", async () => {
        const card = page.getByRole("region", { name: /^You vs / }).first();
        await expect(card.getByRole("heading", { name: "Skill to improve" })).toBeVisible();
        note("rankHeading", await card.getByRole("heading").first().innerText());
      });
      await step("compare with another rank", async () => {
        const form = page.getByRole("form", { name: "Compare with a rank" });
        await form.getByLabel("Rank").selectOption("gold");
        await form.getByRole("button", { name: "Compare" }).click();
        await expect(page).toHaveURL(/tier=gold/, LOAD);
        await expect(page.getByRole("heading", { name: /^You vs Gold$/i })).toBeVisible(LOAD);
        await expect(page).toHaveURL(/view=others/);
        await expectCalm(page);
      });
      await step("compare with a player rejects a bad id calmly", async () => {
        const form = page.getByRole("form", { name: "Compare with a player" });
        await form.getByLabel("Their Riot ID").fill("nohashtag");
        await form.getByRole("button", { name: "Compare" }).click();
        const alert = page.getByRole("alert").filter({ hasText: "isn't a Riot ID" });
        await expect(alert).toBeVisible(LOAD);
        await alert.scrollIntoViewIfNeeded(); // so the screenshot shows the message
        await expect(page.getByRole("heading", { name: /^You vs Gold$/i })).toBeVisible();
      });
    },
  },
];

main(journeys, "Usage: npx tsx .cursor/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url>] [--run <id>] <journey...|all>\nJourneys:");
