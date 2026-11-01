import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RiotApiError } from "@/lib/riot/client";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import type { Match, Participant } from "@/lib/riot/types";
import { MatchHeader } from "./match-header";
import { NotInGame, TimelineProblem } from "./match-states";

// The Riot client is server-only; the tests only build its error objects.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Riot's status page is a live call; these tests are about the panels.
vi.mock("@/components/riot-status", () => ({ RiotStatus: () => null }));

describe("the timeline's problem panel", () => {
  it("says Riot didn't send it and offers a way out, in neutral colours", () => {
    const html = renderToStaticMarkup(
      <TimelineProblem error={new RiotApiError("unavailable", "Riot is down")} />,
    );
    expect(html).toContain("Riot&#x27;s servers didn&#x27;t send this game&#x27;s timeline");
    expect(html).toContain("The analysis is built from it, minute by minute.");
    expect(html).toContain("Try again");
    expect(html).toContain(`href="${SAMPLE_MATCH_HREF}"`);
    expect(html).not.toMatch(/\b(?:text|bg|border)-(?:ahead|behind)\b/);
  });

  it("uses the usual words for any other Riot problem", () => {
    const html = renderToStaticMarkup(
      <TimelineProblem error={new RiotApiError("bad-key", "Key expired")} />,
    );
    expect(html).toContain("The site&#x27;s Riot API key isn&#x27;t working");
  });
});

describe("a player who isn't in the game", () => {
  it("says so and links to their profile", () => {
    const html = renderToStaticMarkup(
      <NotInGame name="Faker#KR1" profileHref="/player/kr/Faker-KR1" />,
    );
    expect(html).toContain("Faker#KR1 isn&#x27;t in this game");
    expect(html).toContain('href="/player/kr/Faker-KR1"');
    expect(html).toContain("Open Faker#KR1&#x27;s profile");
  });
});

describe("the match header", () => {
  const me = {
    participantId: 1,
    teamId: 100,
    teamPosition: "MIDDLE",
    championName: "Syndra",
    win: true,
    kills: 11,
    deaths: 2,
    assists: 5,
  } as Participant;
  const zoe = { ...me, participantId: 6, teamId: 200, championName: "Zoe", win: false };
  const match = (participants: Participant[], gameDuration = 1446) =>
    ({
      info: {
        participants,
        gameDuration,
        queueId: 420,
        gameVersion: "16.20.712.3456",
        gameStartTimestamp: 0,
        // Riot's gameDuration is in seconds only when this is present.
        gameEndTimestamp: 1,
      },
    }) as unknown as Match;
  const header = (m: Match, player = me) =>
    renderToStaticMarkup(<MatchHeader match={m} me={player} dd={null} now={1000} />);

  it("reads as the result, your champion and your opponent's", () => {
    const html = header(match([me, zoe]));
    expect(html).toMatch(/text-ahead[^>]*>Victory<\/span> as Syndra/);
    expect(html).toContain("vs Zoe");
    expect(html).toContain("11/2/5 · Mid");
    expect(html).toContain("Patch 16.20");
  });

  it("colours a loss red and leaves out a missing opponent", () => {
    const html = header(match([{ ...me, win: false }]), { ...me, win: false });
    expect(html).toMatch(/text-behind[^>]*>Defeat/);
    expect(html).not.toContain(" vs ");
  });

  it("says remake without blue or red", () => {
    const html = header(match([me, zoe], 120));
    expect(html).toMatch(/text-quiet[^>]*>Remake/);
  });
});
