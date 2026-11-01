import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Participant } from "@/lib/riot/types";
import { LaneBoard } from "./lane-board";

// The Riot client is server-only; these tests only draw players.
vi.mock("server-only", () => ({}));

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function player(participantId: number, teamId: number, role: string, goldEarned: number, win: boolean) {
  return {
    participantId,
    teamId,
    teamPosition: role,
    goldEarned,
    win,
    championName: `${teamId === 100 ? "Ally" : "Enemy"}${role}`,
    riotIdGameName: `Name${participantId}`,
    riotIdTagline: "KR1",
    kills: 3,
    deaths: 1,
    assists: 2,
  } as Participant;
}

// Your team's gold is set so each lane's gap is a different size; the enemy
// team is listed in the wrong order, as Riot can send them.
const PARTICIPANTS = [
  ...ROLES.map((role, i) => player(i + 1, 100, role, [15000, 9000, 12000, 8000, 7000][i], true)),
  ...[...ROLES].reverse().map((role, i) =>
    player(i + 6, 200, role, [7000, 8000, 10000, 9400, 10000][i], false),
  ),
];

function html() {
  return renderToStaticMarkup(
    <LaneBoard region="kr" dd={null} participants={PARTICIPANTS} meId={3} opponentId={8} />,
  );
}

describe("the scoreboard by lane", () => {
  it("pairs players by lane, your team on the left", () => {
    const rows = html().split("<li").slice(1);
    expect(rows).toHaveLength(5);
    ROLES.forEach((role, i) => {
      expect(rows[i].indexOf(`Ally${role}`)).toBeLessThan(rows[i].indexOf(`Enemy${role}`));
      expect(rows[i]).toContain(`Enemy${role}`);
    });
  });

  it("writes each lane's gold gap in words from your side", () => {
    const words = html().split("<li").slice(1).map((row) => row.match(/>([^<>]*(?:ahead|behind|Even))</)?.[1]);
    expect(words).toEqual(["5.0k ahead", "400 behind", "2.0k ahead", "Even", "Even"]);
  });

  it("colours the winners' kills blue and the losers' red", () => {
    expect(html()).toMatch(/Your team.*?text-ahead[^>]*>15</);
    expect(html()).toMatch(/text-behind[^>]*>15<.*Enemy team/);
  });

  it("tags you and your opponent, and tints only your row", () => {
    const rows = html().split("<li").slice(1);
    expect(rows[2]).toContain("You");
    expect(rows[2]).toContain("Opponent");
    expect(rows[2]).toContain("bg-select");
    expect(rows[0]).not.toContain("bg-select");
  });

  it("links each player to their profile", () => {
    expect(html()).toContain('href="/player/kr/Name3-KR1"');
  });
});
