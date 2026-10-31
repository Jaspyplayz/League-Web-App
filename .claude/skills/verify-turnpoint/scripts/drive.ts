// Functional journeys for verify-turnpoint. Usage (from the repo root):
//   npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts --list
//   npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] [--run <id>] <journey...|all>
// Each journey maps to one file in ../features/.

import { assertAppPage, expect, main, SAMPLE_MATCH_PATH, TEST_PLAYER, type Journey } from "./runner";

const LOAD = { timeout: 45_000 }; // cold preview / dev compile / Riot

const journeys: Journey[] = [
  {
    name: "home-lookup",
    feature: "home-lookup.md",
    needs: ["riot"],
    run: async ({ page, step }) => {
      await step("open home", async () => {
        await page.goto("/", LOAD);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Turnpoint");
        await expect(page.getByRole("search", { name: "Player lookup" })).toBeVisible();
      });
      await step("type riot id and region", async () => {
        await page.getByLabel("Riot ID").fill(TEST_PLAYER.riotId);
        await page.getByLabel("Region").selectOption(TEST_PLAYER.region);
        await expect(page.getByLabel("Riot ID")).toHaveValue(TEST_PLAYER.riotId);
      });
      await step("press search", async () => {
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await expect(page).toHaveURL(/\/player\/kr\/Hide%20on%20bush-KR1$/, LOAD);
        await assertAppPage(page);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(/Hide on bush/i, LOAD);
        await expect(page.getByRole("navigation", { name: "Profile sections" })).toBeVisible();
      });
    },
  },
  {
    name: "profile-matches",
    feature: "profile-matches.md",
    needs: ["riot", "database"],
    run: async ({ page, step, note }) => {
      await step("open profile", async () => {
        await page.goto(TEST_PLAYER.path, LOAD);
        await assertAppPage(page);
        await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible(LOAD);
        await expect(page.getByRole("heading", { name: "Ranked Solo/Duo" })).toBeVisible();
      });
      await step("match list has rows", async () => {
        const list = page.getByRole("region", { name: "Recent matches" });
        await expect(list.getByText(/^(Victory|Defeat|Remake)$/i).first()).toBeVisible(LOAD);
        const rows = await list.getByText(/^(Victory|Defeat|Remake)$/i).count();
        note("resultLabels", rows);
        if (rows < 1) throw new Error("no match rows: the list shows no Victory/Defeat rows");
      });
      await step("switch queue to Ranked Solo/Duo", async () => {
        await page.getByRole("region", { name: "Recent matches" }).getByRole("link", { name: "Ranked Solo/Duo", exact: true }).click();
        await expect(page).toHaveURL(/queue=/, LOAD);
        await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible(LOAD);
      });
    },
  },
  {
    name: "match-review",
    feature: "match-review.md",
    needs: ["database"],
    run: async ({ page, step, note }) => {
      await step("open sample game", async () => {
        await page.goto(SAMPLE_MATCH_PATH, LOAD);
        await assertAppPage(page);
        await expect(page.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true", LOAD);
        await expect(page.getByText("Victory", { exact: false }).first()).toBeVisible();
      });
      await step("60-second review has moments", async () => {
        const review = page.getByRole("region", { name: "60-second review" });
        await review.scrollIntoViewIfNeeded();
        await expect(review).toBeVisible();
        const moments = await review.getByRole("listitem").count();
        note("moments", moments);
        if (moments < 1 || moments > 3) throw new Error(`expected 1-3 moments, saw ${moments}`);
        await expect(review.getByText("Think about").first()).toBeVisible();
        await expect(review.getByRole("button", { name: "Watch in replay" }).first()).toBeVisible();
      });
    },
  },
  {
    name: "insights-others",
    feature: "insights-others.md",
    needs: ["riot", "database"],
    run: async ({ page, step, note }) => {
      await step("open You vs others", async () => {
        await page.goto(`${TEST_PLAYER.path}/insights?view=others`, LOAD);
        await assertAppPage(page);
        await expect(page.getByRole("navigation", { name: "Insights views" }).getByRole("link", { name: "You vs others" })).toHaveAttribute("aria-current", "page", LOAD);
      });
      await step("rank comparison shows", async () => {
        const card = page.getByRole("region", { name: /^You vs / }).first();
        await expect(card).toBeVisible(LOAD);
        note("heading", await card.getByRole("heading").first().innerText());
        const notEnough = await page.getByText("Not enough games to spot trends yet").isVisible();
        if (notEnough) throw new Error('the view shows "Not enough games to spot trends yet"');
        await expect(page.getByRole("form", { name: "Compare with a rank" })).toBeVisible();
        await expect(page.getByRole("region", { name: "Compare with a player" })).toBeVisible();
      });
    },
  },
  {
    name: "ask-teaser",
    feature: "ask-teaser.md",
    needs: ["riot", "supabase"],
    run: async ({ page, step }) => {
      await step("open Ask signed out", async () => {
        await page.goto(`${TEST_PLAYER.path}/ask`, LOAD);
        await assertAppPage(page);
        await expect(page.getByRole("navigation", { name: "Profile sections" }).getByRole("link", { name: "Ask" })).toHaveAttribute("aria-current", "page", LOAD);
        if (await page.getByText("Ask isn't available right now.").isVisible())
          throw new Error('Ask shows "Ask isn\'t available right now." (no ANTHROPIC_API_KEY, Supabase or DATABASE_URL on this target)');
      });
      await step("teaser shows sign in and illustration", async () => {
        const main = page.getByRole("main");
        await expect(main.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /\/sign-in\?next=%2Fplayer%2Fkr%2FHide%2520on%2520bush-KR1%2Fask/);
        await expect(main.getByText("Illustration · not a real game")).toBeVisible();
        await expect(main.getByText("What do my losses have in common?").first()).toBeVisible();
        await expect(main.getByRole("textbox")).toHaveCount(0);
      });
    },
  },
];

main(journeys, "Usage: npx tsx .claude/skills/verify-turnpoint/scripts/drive.ts [--base <url> | --pr <number>] [--run <id>] <journey...|all>\nJourneys:");
