import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchPlayer } from "./actions";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

beforeEach(() => vi.mocked(redirect).mockClear());

function search(riotId: string, region = "kr") {
  const form = new FormData();
  form.set("region", region);
  form.set("riotId", riotId);
  return searchPlayer({ error: null }, form);
}

describe("searchPlayer", () => {
  it("says where to find the tag when there's no #", async () => {
    expect(await search("Faker")).toEqual({
      error: "Add the tag after a #, like Faker#KR1. It's on the player's Riot profile.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("shows the Riot ID's shape when the tag is there but isn't valid", async () => {
    for (const typed of ["Faker#NA", "Jo#KR1", "Faker#KR1!"]) {
      expect(await search(typed)).toEqual({ error: "Enter a Riot ID like Faker#KR1." });
    }
    expect(redirect).not.toHaveBeenCalled();
  });

  it("goes to the player's page for a valid Riot ID", async () => {
    await search("Hide on bush#KR1");
    expect(redirect).toHaveBeenCalledWith("/player/kr/Hide%20on%20bush-KR1");
  });

  it("asks for a region it knows", async () => {
    expect(await search("Faker#KR1", "xx")).toEqual({ error: "Pick a region." });
  });
});
