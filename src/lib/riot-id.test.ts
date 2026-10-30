import { describe, expect, it } from "vitest";
import { fromSlug, isPlayerPath, parseRiotId, participantRiotId, toSlug } from "./riot-id";

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

describe("participantRiotId", () => {
  it("reads the Riot ID from match data", () => {
    expect(participantRiotId({ riotIdGameName: "Faker", riotIdTagline: "KR1" })).toEqual({
      gameName: "Faker",
      tagLine: "KR1",
    });
  });

  it("returns null when either half is missing", () => {
    expect(participantRiotId({})).toBeNull();
    expect(participantRiotId({ riotIdGameName: "Faker", riotIdTagline: "" })).toBeNull();
    expect(participantRiotId({ riotIdGameName: "", riotIdTagline: "KR1" })).toBeNull();
  });
});

describe("isPlayerPath", () => {
  it("accepts a player's page as the profile writes it", () => {
    const slug = toSlug({ gameName: "Hide on bush", tagLine: "KR1" });
    expect(isPlayerPath("kr", `/player/kr/${slug}`)).toBe(true);
    expect(isPlayerPath("na", "/player/na/Jaspy-CA1")).toBe(true);
  });

  it("rejects another region, another page or a link elsewhere", () => {
    expect(isPlayerPath("na", "/player/euw/Jaspy-CA1")).toBe(false);
    expect(isPlayerPath("na", "/player/na/")).toBe(false);
    expect(isPlayerPath("na", "/player/na/Jaspy-CA1/insights")).toBe(false);
    expect(isPlayerPath("na", "/player/na/x?next=//evil.example")).toBe(false);
    expect(isPlayerPath("na", "https://evil.example/player/na/x")).toBe(false);
  });
});
