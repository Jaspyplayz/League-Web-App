// UX journeys for verify-turnpoint-ux: how flows feel to a player, not just
// whether data shows. Shares the harness, launch, doctor and cleanup of the
// sibling skill (../../verify-turnpoint/scripts/). Usage (from the repo root):
//   npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts --list
//   npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] [--run <id>] <journey...|all>

import type { Page } from "@playwright/test";
import {
  assertAppPage,
  expect,
  main,
  SAMPLE_MATCH_PATH,
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

// Fills this browser's saved lists, the way searching and the star do.
async function savePlayers(page: Page, recent: unknown[], pinned: unknown[]) {
  await page.evaluate(
    ([r, p]) => {
      localStorage.setItem("turnpoint:recent-players", JSON.stringify(r));
      localStorage.setItem("turnpoint:pinned-players", JSON.stringify(p));
    },
    [recent, pinned],
  );
}

const SAMPLE_PLAYER = { region: "kr", gameName: "Hide on bush", tagLine: "KR1" };
const NEVER_LOOKED_UP = { region: "na", gameName: "Never Looked Up", tagLine: "0000" };

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
        await page.getByRole("button", { name: "Search", exact: true }).click();
        const alert = page.locator("#search-error");
        await expect(alert).toHaveText("Add the tag after a #, like Faker#KR1. It's on the player's Riot profile.", LOAD);
        await expect(alert).toHaveRole("alert");
        await expect(page.getByLabel("Riot ID")).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByLabel("Riot ID")).toHaveAttribute("aria-describedby", "search-error");
      });
      await step("input kept and page did not move", async () => {
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByLabel("Riot ID")).toHaveValue("Faker");
        await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
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
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Turnpoint", LOAD);
        await expectCalm(page);
      });
      await step("no sideways scroll and form fits", async () => {
        const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        note("scrollWidth", sw);
        note("clientWidth", cw);
        if (sw > cw + 1) throw new Error(`page scrolls sideways: scrollWidth ${sw} > clientWidth ${cw}`);
        const btn = await page.getByRole("button", { name: "Search", exact: true }).boundingBox();
        if (!btn || btn.x < 0 || btn.x + btn.width > cw + 1) throw new Error(`Search button is off screen: ${JSON.stringify(btn)}`);
        if (btn.height < 44) throw new Error(`Search tap target is ${btn.height}px tall, under 44px`);
      });
      await step("scroll to the example game", async () => {
        const open = page.getByRole("link", { name: "Open this game", exact: true });
        await open.scrollIntoViewIfNeeded();
        await expect(open).toBeVisible();
      });
    },
  },
  {
    name: "ux-saved-players",
    feature: "saved-players.md",
    needs: ["nothing"],
    run: async ({ page, step, note }) => {
      const riotId = page.getByRole("textbox", { name: "Riot ID" });
      const recentTab = page.getByRole("tab", { name: /^Recent/ });
      await step("a first visit gets no box", async () => {
        await page.goto("/", LOAD);
        await riotId.click();
        await riotId.pressSequentially("hide");
        await expect(recentTab).toBeHidden();
        await expectCalm(page);
      });
      await step("clicking the search opens the box", async () => {
        await savePlayers(page, [SAMPLE_PLAYER, NEVER_LOOKED_UP], [SAMPLE_PLAYER]);
        await page.reload(LOAD);
        await riotId.click();
        await expect(recentTab).toHaveText(/Recent\s*2/);
        await expect(page.getByRole("tab", { name: /^Pinned/ })).toHaveText(/Pinned\s*1/);
        await expect(page.getByTitle("No solo queue rank on file").first()).toBeVisible(LOAD);
        note("sampleBadge", await page.getByRole("listitem").first().locator("span[title]").getAttribute("title"));
      });
      await step("typing narrows the rows", async () => {
        await riotId.fill("never");
        const panel = page.getByRole("tabpanel", { name: "Recent" });
        await expect(panel.getByRole("listitem")).toHaveCount(1);
        await expect(panel).toContainText("Never Looked Up");
        await riotId.fill("");
        await expect(panel.getByRole("listitem")).toHaveCount(2);
      });
      await step("the star pins a player", async () => {
        await page.getByRole("button", { name: "Pin Never Looked Up#0000" }).click();
        await page.getByRole("tab", { name: /^Pinned/ }).click();
        await expect(page.getByRole("tab", { name: /^Pinned/ })).toHaveText(/Pinned\s*2/);
        await expect(page.getByRole("tabpanel", { name: "Pinned" })).toContainText("Never Looked Up");
      });
      await step("the x removes a player from that list only", async () => {
        await page.getByRole("button", { name: "Remove Never Looked Up#0000 from pinned players" }).click();
        await expect(page.getByRole("tab", { name: /^Pinned/ })).toHaveText(/Pinned\s*1/);
        await expect(recentTab).toHaveText(/Recent\s*2/);
      });
      await step("escape closes it and keeps the cursor in the search", async () => {
        await page.keyboard.press("Escape");
        await expect(recentTab).toBeHidden();
        await expect(riotId).toBeFocused();
      });
      await step("clicking again opens it and a click outside closes it", async () => {
        await riotId.click();
        await expect(recentTab).toBeVisible();
        await page.getByRole("heading", { level: 1 }).click();
        await expect(recentTab).toBeHidden();
      });
      await step("the lists survive a reload", async () => {
        await page.reload(LOAD);
        await riotId.click();
        await expect(recentTab).toHaveText(/Recent\s*2/);
        await expect(page.getByRole("tab", { name: /^Pinned/ })).toHaveText(/Pinned\s*1/);
      });
      await step("the header's search on another page opens it too", async () => {
        await page.goto("/how-it-works", LOAD);
        await page.getByRole("textbox", { name: "Riot ID" }).click();
        await expect(recentTab).toHaveText(/Recent\s*2/);
        await page.keyboard.press("Escape");
        await expect(recentTab).toBeHidden();
      });
      await step("a row opens that player's page", async () => {
        await page.goto("/how-it-works", LOAD);
        await page.getByRole("textbox", { name: "Riot ID" }).click();
        await page.getByRole("link", { name: /Never Looked Up/ }).click();
        await expect(page).toHaveURL(/\/player\/na\/Never%20Looked%20Up-0000/, LOAD);
        await expect(recentTab).toBeHidden();
      });
    },
  },
  {
    name: "ux-saved-players-phone",
    feature: "saved-players.md",
    needs: ["nothing"],
    phone: true,
    run: async ({ page, step, note }) => {
      await step("open the box at 390px", async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/", LOAD);
        await savePlayers(page, [SAMPLE_PLAYER, NEVER_LOOKED_UP], [SAMPLE_PLAYER]);
        await page.reload(LOAD);
        await page.getByRole("textbox", { name: "Riot ID" }).click();
        await expect(page.getByRole("tab", { name: /^Recent/ })).toBeVisible();
        await expect(page.getByTitle("No solo queue rank on file").first()).toBeVisible(LOAD);
      });
      await step("no sideways scroll and big enough to tap", async () => {
        const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        note("scrollWidth", sw);
        note("clientWidth", cw);
        if (sw > cw + 1) throw new Error(`page scrolls sideways: scrollWidth ${sw} > clientWidth ${cw}`);
        const star = await page.getByRole("button", { name: "Pin Never Looked Up#0000" }).boundingBox();
        const remove = await page.getByRole("button", { name: /^Remove Never Looked Up/ }).boundingBox();
        for (const button of [star, remove]) {
          if (!button || button.height < 44 || button.x + button.width > cw) {
            throw new Error(`row button off screen or under 44px: ${JSON.stringify(button)}`);
          }
        }
      });
      await step("in light mode", async () => {
        await page.evaluate(() => localStorage.setItem("turnpoint-theme", "light"));
        await page.reload(LOAD);
        await page.getByRole("textbox", { name: "Riot ID" }).click();
        await expect(page.getByRole("tab", { name: /^Recent/ })).toBeVisible();
        await expect(page.getByTitle("No solo queue rank on file").first()).toBeVisible(LOAD);
      });
    },
  },
  {
    name: "ux-saved-players-search",
    feature: "saved-players.md",
    needs: ["riot"],
    run: async ({ page, step, note }) => {
      await step("search a player", async () => {
        await page.goto("/", LOAD);
        await page.getByRole("textbox", { name: "Riot ID" }).fill(TEST_PLAYER.riotId);
        await page.getByRole("combobox", { name: "Region" }).selectOption(TEST_PLAYER.region);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await expect(page).toHaveURL(/\/player\//, LOAD);
        await expect(page.getByRole("region", { name: "Player summary" })).toBeVisible(LOAD);
      });
      await step("see them in recent, with their rank", async () => {
        await page.getByRole("textbox", { name: "Riot ID" }).click();
        const panel = page.getByRole("tabpanel", { name: "Recent" });
        await expect(panel.getByRole("listitem")).toHaveCount(1, LOAD);
        // A dash here would mean the rank query found nothing for a player
        // whose profile just saved them.
        const badge = panel.locator("span[title]").first();
        await expect(badge).toBeVisible(LOAD);
        await expect(badge).not.toHaveAttribute("title", "No solo queue rank on file");
        note("badge", await badge.getAttribute("title"));
      });
    },
  },
  {
    name: "ux-saved-players-sample-match",
    feature: "saved-players.md",
    needs: ["database"],
    phone: true,
    run: async ({ page, step, note }) => {
      await step("open the sample game at 390px in light mode", async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/", LOAD);
        await savePlayers(page, [SAMPLE_PLAYER, NEVER_LOOKED_UP], [SAMPLE_PLAYER]);
        await page.evaluate(() => localStorage.setItem("turnpoint-theme", "light"));
        await page.reload(LOAD);
        await page.getByRole("link", { name: "Open this game", exact: true }).click();
        await expect(page).toHaveURL(/\/match\/KR_/, LOAD);
        await expect(page.getByRole("region", { name: "Match summary" })).toBeVisible(LOAD);
      });
      await step("the header's search opens the box there", async () => {
        await page.getByRole("textbox", { name: "Riot ID" }).click();
        await expect(page.getByRole("tab", { name: /^Recent/ })).toHaveText(/Recent\s*2/);
        await expect(page.getByTitle("No solo queue rank on file").first()).toBeVisible(LOAD);
        const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        note("scrollWidth", sw);
        note("clientWidth", cw);
        if (sw > cw + 1) throw new Error(`page scrolls sideways: scrollWidth ${sw} > clientWidth ${cw}`);
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
      await step("choose open this game", async () => {
        await page.getByRole("link", { name: "Open this game", exact: true }).click();
        await expect(page).toHaveURL(/\/match\/KR_8416261221/, LOAD);
        await expect(page.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true", LOAD);
        await expectCalm(page);
      });
      await step("reach the 60-second review in game review", async () => {
        const review = page.getByRole("region", { name: "Game review" });
        await review.scrollIntoViewIfNeeded();
        // It opens on the play that moved the game most, which is always a moment.
        const opened = review.locator('[aria-current="true"]');
        await expect(opened).toContainText("In your 60-second review");
        await expect(review.getByText("Think about")).toBeVisible();
        note("firstMoment", (await opened.innerText()).split("\n").slice(0, 4).join(" | "));
      });
      await step("watch the moment in the replay", async () => {
        const review = page.getByRole("region", { name: "Game review" });
        await review.getByRole("button", { name: "Watch in replay" }).click();
        await expect(page.getByRole("tab", { name: "Replay" })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tabpanel", { name: "Summary" })).toBeHidden();
        await expect(page.getByRole("heading", { name: "Replay", exact: true })).toBeVisible();
        await page.waitForTimeout(500); // reducedMotion is set; this only lets the scroll land
        await inViewport(page, "Replay");
      });
      await step("ask sits beside the replay", async () => {
        const ask = page.getByRole("heading", { name: "Ask about this game" });
        await expect(ask).toBeVisible();
        // Beside it from 1280px wide, under it below that.
        const replayBox = (await page.getByRole("heading", { name: "Replay", exact: true }).boundingBox())!;
        const askBox = (await ask.boundingBox())!;
        const wide = page.viewportSize()!.width >= 1280;
        note("askPlacement", askBox.x > replayBox.x + 200 ? "beside" : "under");
        if (wide && askBox.x <= replayBox.x + 200) throw new Error("Ask is under the replay at 1280px or wider");
        if (!wide && askBox.y <= replayBox.y) throw new Error("Ask isn't under the replay below 1280px");
      });
      await step("back to summary keeps the review", async () => {
        await page.getByRole("tab", { name: "Summary" }).click();
        await expect(page.getByRole("region", { name: "Game review" })).toBeVisible();
      });
    },
  },
  {
    name: "ux-game-review",
    feature: "game-review.md",
    needs: ["database"],
    run: async ({ page, step, note }) => {
      const review = page.getByRole("region", { name: "Game review" });
      const opened = review.locator('[aria-current="true"]');
      const replayClock = page.getByRole("slider", { name: "Game time" });
      // The strip's mark at a clock time.
      const mark = (clock: string) =>
        page.getByRole("button", { name: new RegExp(`^${clock} .*chance to win after it`) });
      // The opened play, its mark and the eval bar all agree. Returns the chance.
      const expectBoardOn = async (clock: string) => {
        await expect(opened).toContainText(clock);
        await expect(mark(clock)).toHaveAttribute("aria-pressed", "true");
        const chance = (await mark(clock).getAttribute("aria-label"))?.match(/\d+%$/)?.[0];
        await expect(page.getByRole("img", { name: `chance to win: ${chance}` })).toBeVisible();
        return chance;
      };

      await step("open the sample game on its biggest play", async () => {
        await page.goto(SAMPLE_MATCH_PATH, LOAD);
        await expect(review).toBeVisible(LOAD);
        await expectCalm(page);
        for (const tile of ["Overall", "Early", "Mid"]) {
          await expect(review.getByText(tile, { exact: true })).toBeVisible();
        }
        const grades = review.getByRole("list", { name: "Grades of your plays" }).getByRole("listitem");
        await expect(grades).toHaveCount(11);
        await expect(grades.filter({ hasText: "Book" })).toContainText("–");
        await expect(grades.filter({ hasText: "Blunder" })).toContainText("0");
        note("opensOn", await expectBoardOn("20:54"));
      });
      await step("next play moves the eval bar and strip mark", async () => {
        await review.getByRole("button", { name: "Next play" }).click();
        note("afterNext", await expectBoardOn("22:10"));
        await expect(review.getByText("Think about")).toBeVisible();
      });
      await step("previous play goes back", async () => {
        await review.getByRole("button", { name: "Previous play" }).click();
        await expectBoardOn("20:54");
      });
      await step("first play, where first and previous stop", async () => {
        await review.getByRole("button", { name: "First play" }).click();
        await expectBoardOn("3:22");
        await expect(review.getByRole("button", { name: "First play" })).toBeDisabled();
        await expect(review.getByRole("button", { name: "Previous play" })).toBeDisabled();
      });
      await step("a row in the list selects the play on the board", async () => {
        await review.locator("ol > li > button").nth(1).click();
        await expect(review.getByRole("button", { name: "First play" })).toBeEnabled();
        await expectBoardOn("5:54");
      });
      await step("last play, with the list scrolled to it", async () => {
        await review.getByRole("button", { name: "Last play" }).click();
        await expectBoardOn("24:15");
        await expect(review.getByRole("button", { name: "Next play" })).toBeDisabled();
        const inList = await opened.evaluate((row) => {
          const list = row.closest("ol")!.getBoundingClientRect();
          const box = row.getBoundingClientRect();
          return box.top >= list.top - 1 && box.bottom <= list.bottom + 1;
        });
        if (!inList) throw new Error("the opened play is scrolled out of its list");
      });
      await step("a strip mark selects the play in game review", async () => {
        await mark("5:54").click();
        await expect(opened).toContainText("5:54");
      });
      await step("step to the play at 33:36 in another game", async () => {
        await page.goto(TEST_PLAYER.path + "/match/KR_8419370694", LOAD);
        await expect(review).toBeVisible(LOAD);
        await review.getByRole("button", { name: "First play" }).click();
        await expectBoardOn("8:11");
        await review.getByRole("button", { name: "Last play" }).click();
        await expectBoardOn("33:36");
      });
      await step("start review opens the replay at 33:37", async () => {
        await review.getByRole("button", { name: "Start review in the replay" }).click();
        await expect(page.getByRole("tab", { name: "Replay" })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tabpanel", { name: "Summary" })).toBeHidden();
        await expect(replayClock).toHaveAttribute("aria-valuetext", /^33:37:/);
        note("replayAt", await replayClock.getAttribute("aria-valuetext"));
      });
    },
  },
  {
    name: "ux-game-review-phone",
    feature: "game-review.md",
    needs: ["database"],
    phone: true,
    run: async ({ page, step, note }) => {
      const review = page.getByRole("region", { name: "Game review" });
      await step("open the sample game at 390px", async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(SAMPLE_MATCH_PATH, LOAD);
        await expect(review).toBeVisible(LOAD);
        await expectCalm(page);
      });
      await step("game review sits under the board, with no sideways scroll", async () => {
        const board = (await page.getByRole("region", { name: "Gold lead" }).boundingBox())!;
        const box = (await review.boundingBox())!;
        const scoreboard = (await page.getByRole("region", { name: "Scoreboard by lane" }).boundingBox())!;
        if (box.y < board.y + board.height) throw new Error("Game review starts above the board's end");
        if (scoreboard.y < box.y + box.height) throw new Error("the scoreboard isn't under Game review");
        const { sw, cw } = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        note("scrollWidth", sw);
        if (sw > cw + 1) throw new Error(`page scrolls sideways: scrollWidth ${sw} > clientWidth ${cw}`);
      });
      await step("step buttons are big enough to tap and move the board", async () => {
        const previous = review.getByRole("button", { name: "Previous play" });
        await previous.scrollIntoViewIfNeeded();
        const size = (await previous.boundingBox())!;
        if (size.height < 44) throw new Error(`step button is ${size.height}px tall, under 44px`);
        const bar = page.getByRole("img", { name: /chance to win: \d+%/ });
        const before = await bar.getAttribute("aria-label");
        await previous.click();
        await expect(bar).not.toHaveAttribute("aria-label", before!);
      });
      await step("start review opens the replay", async () => {
        await review.getByRole("button", { name: "Start review in the replay" }).click();
        await expect(page.getByRole("tab", { name: "Replay" })).toHaveAttribute("aria-selected", "true");
        // The play before the one it opens on, which starts at 18:44 and a bit.
        await expect(page.getByRole("slider", { name: "Game time" })).toHaveAttribute("aria-valuetext", /^18:45:/);
      });
    },
  },
  {
    name: "ux-signed-out-teasers",
    feature: "signed-out-teasers.md",
    needs: ["database", "supabase"],
    run: async ({ page, step }) => {
      await step("old ask address lands on the profile", async () => {
        await page.goto(`${TEST_PLAYER.path}/ask`, LOAD);
        // goto follows the redirect, so the page's address is where it landed.
        expect(new URL(page.url()).pathname).toBe(TEST_PLAYER.path);
      });
      await step("ask panel signed out", async () => {
        await page.goto("/player/kr/Hide%20on%20bush-KR1/match/KR_8416261221", LOAD);
        await page.getByRole("tab", { name: "Replay" }).click();
        await expectCalm(page);
        // The Game recap teaser on Summary has its own illustration, so look
        // only inside the Ask panel.
        const ask = page.getByRole("region", { name: "Ask about this game" });
        await expect(ask.getByText("to ask questions about this player")).toBeVisible(LOAD);
        await expect(ask.getByText("Illustration · not a real game")).toBeVisible();
        await expect(ask.getByRole("textbox")).toHaveCount(0);
      });
      await step("sign in from the teaser keeps the way back", async () => {
        await page.getByRole("region", { name: "Ask about this game" }).getByRole("link", { name: "Sign in" }).click();
        await expect(page).toHaveURL(/\/sign-in\?next=%2Fplayer%2Fkr%2FHide%2520on%2520bush-KR1%2Fmatch%2FKR_8416261221/, LOAD);
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
        // Game review opens on the biggest play, which is always a moment.
        const review = page.getByRole("region", { name: "Game review" });
        await review.getByRole("button", { name: "Add to notes" }).click();
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
  {
    name: "ux-profile-games",
    feature: "profile-games.md",
    needs: ["riot", "database"],
    run: async ({ page, step, note }) => {
      const tabs = () => page.getByRole("navigation", { name: "Profile sections" });
      const views = () => page.getByRole("navigation", { name: "Matches view" });
      await step("open the profile", async () => {
        await page.goto(TEST_PLAYER.path, LOAD);
        await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible(LOAD);
        await expectCalm(page);
        await expect(tabs().getByRole("link")).toHaveText(["Matches", "Champions", "Insights"]);
        await expect(tabs().getByRole("link", { name: "Matches" })).toHaveAttribute("aria-current", "page");
        await expect(views().getByRole("link", { name: "List" })).toHaveAttribute("aria-current", "page");
      });
      await step("switch to by day", async () => {
        await views().getByRole("link", { name: "By day" }).click();
        await expect(page).toHaveURL(/\?view=day$/, LOAD);
        await expect(views().getByRole("link", { name: "By day" })).toHaveAttribute("aria-current", "page");
        // Days, or the empty panel when the player has no games in four weeks.
        const days = page.getByRole("heading", { name: "Days", exact: true });
        const empty = page.getByText(/^No games in the last/);
        await expect(days.or(empty)).toBeVisible(LOAD);
        note("byDay", (await days.isVisible()) ? "days" : "empty");
        await expect(tabs().getByRole("link", { name: "Matches" })).toHaveAttribute("aria-current", "page");
        await expectCalm(page);
      });
      await step("back to the list", async () => {
        await views().getByRole("link", { name: "List" }).click();
        await expect(page.getByRole("heading", { name: "Recent matches" })).toBeVisible(LOAD);
        expect(new URL(page.url()).search).toBe("");
      });
      await step("click a game row and land on its match page", async () => {
        const row = page.getByRole("link", { name: /^Open this .+ game/ }).first();
        note("row", (await row.getAttribute("aria-label")) ?? "");
        // Click the row's game score, not the link's own text, to prove a
        // click anywhere on the row opens the game. A mouse click at that
        // spot, because the row link's cover sits over the score on purpose.
        const box = page.getByLabel(/^(Game score \d+ out of 100|No game score)$/).first();
        // A mouse click only lands on screen, so bring the score into view first.
        await box.scrollIntoViewIfNeeded();
        const spot = await box.boundingBox();
        if (!spot) throw new Error("the first row has no game score box");
        await page.mouse.click(spot.x + spot.width / 2, spot.y + spot.height / 2);
        await expect(page).toHaveURL(/\/match\/KR_/, LOAD);
        await expect(page.getByRole("tab", { name: "Summary" })).toHaveAttribute("aria-selected", "true", LOAD);
        await expectCalm(page);
      });
      await step("old log address lands on by day", async () => {
        await page.goto(`${TEST_PLAYER.path}/log`, LOAD);
        // goto follows the redirect, so the page's address is where it landed.
        expect(new URL(page.url()).pathname).toBe(TEST_PLAYER.path);
        expect(new URL(page.url()).search).toBe("?view=day");
        await expect(views().getByRole("link", { name: "By day" })).toHaveAttribute("aria-current", "page", LOAD);
        await expectCalm(page);
      });
    },
  },
];

main(journeys, "Usage: npx tsx .claude/skills/verify-turnpoint-ux/scripts/drive.ts [--base <url> | --pr <number>] [--run <id>] <journey...|all>\nJourneys:");
