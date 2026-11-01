import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlayerNotFound } from "./player-not-found";

vi.mock("@/app/actions", () => ({ searchPlayer: vi.fn() }));

describe("PlayerNotFound", () => {
  it("fills the search with the Riot ID and region the heading names", () => {
    const html = renderToStaticMarkup(
      <PlayerNotFound region="kr" id={{ gameName: "Faker", tagLine: "KR2" }} />,
    );
    expect(html).toContain("No player called Faker#KR2 on Korea");
    expect(html).toMatch(/<input[^>]*name="riotId"[^>]*value="Faker#KR2"/);
    expect(html).toMatch(/<option[^>]*selected[^>]*>KR</);
  });
});
