import { describe, expect, it } from "vitest";
import { matchesChampion } from "./champion-search";

describe("matchesChampion", () => {
  it.each([
    ["Kai'Sa", "kaisa"],
    ["Lee Sin", "lee sin"],
    ["Lee Sin", "leesin"],
    ["Nunu & Willump", "nunu"],
    ["Ahri", "AH"],
  ])("finds %s when you type %j", (name, query) => {
    expect(matchesChampion(name, query)).toBe(true);
  });

  it("doesn't match a different champion", () => {
    expect(matchesChampion("Ahri", "syndra")).toBe(false);
  });

  it("matches everything when the box is empty or only spaces", () => {
    expect(matchesChampion("Ahri", "")).toBe(true);
    expect(matchesChampion("Ahri", "   ")).toBe(true);
  });
});
