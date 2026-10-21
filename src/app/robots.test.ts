import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt", () => {
  const { rules } = robots();
  const rule = Array.isArray(rules) ? rules[0] : rules;

  it("asks every crawler to stay out of player pages and the API", () => {
    expect(rule.userAgent).toBe("*");
    expect(rule.disallow).toEqual(["/player/", "/api/"]);
  });

  it("leaves the home and info pages open", () => {
    const disallowed = [rule.disallow ?? []].flat();
    for (const path of ["/", "/how-it-works", "/privacy", "/terms"]) {
      expect(disallowed.some((prefix) => path.startsWith(prefix))).toBe(false);
    }
  });
});
