import { describe, expect, it } from "vitest";
import { fromSlug, parseRiotId, toSlug } from "./riot-id";

describe("parseRiotId", () => {
  it("splits a game name and tag line", () => {
    expect(parseRiotId("Faker#KR1")).toEqual({ gameName: "Faker", tagLine: "KR1" });
  });

  it("keeps spaces in the game name and trims the edges", () => {
    expect(parseRiotId("  Hide on bush #KR1 ")).toEqual({
      gameName: "Hide on bush",
      tagLine: "KR1",
    });
  });

  it("splits on the last # so names containing # still work", () => {
    expect(parseRiotId("a#b#NA1")).toEqual({ gameName: "a#b", tagLine: "NA1" });
  });

  it.each(["Faker", "Faker#", "#KR1", "ab#NA1", "Faker#K", "Faker#TOOLONG", "Faker#K-1"])(
    "rejects %j",
    (input) => {
      expect(parseRiotId(input)).toBeNull();
    },
  );
});

describe("slugs", () => {
  it("round-trips a Riot ID with spaces and dashes", () => {
    const id = { gameName: "x-Ray Vision", tagLine: "EUW" };
    expect(fromSlug(toSlug(id))).toEqual(id);
  });

  it("rejects malformed slugs", () => {
    expect(fromSlug("nodash")).toBeNull();
    expect(fromSlug("%E0%A4%A")).toBeNull();
  });
});
