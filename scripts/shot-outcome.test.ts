import { describe, expect, it } from "vitest";
import { classify, type PageLoad } from "./shot-outcome";

const PREVIEW = "https://league-web-abc123-jaspy-s-team.vercel.app";

function load(overrides: Partial<PageLoad>): PageLoad {
  return { origin: PREVIEW, url: `${PREVIEW}/settings`, status: 200, text: "Settings", ...overrides };
}

describe("classify", () => {
  it("passes a page that loaded on the site it asked for", () => {
    expect(classify(load({})).outcome).toBe("ok");
  });

  it("catches the redirect to Vercel's login on a protected preview", () => {
    const sso = "https://vercel.com/sso-api?url=https%3A%2F%2Fleague-web-abc123.vercel.app%2F";
    expect(classify(load({ url: sso, text: "Log in to Vercel" })).outcome).toBe("vercel-login");
  });

  it("catches a preview that refuses without a redirect", () => {
    expect(classify(load({ status: 401, text: "Authentication Required" })).outcome).toBe(
      "vercel-login",
    );
  });

  it("reports the Riot key notice instead of passing the page", () => {
    const text = "The site's Riot API key isn't working. Try again tomorrow.";
    expect(classify(load({ text })).outcome).toBe("riot-key");
  });

  it("reports a missing page and a crashed one", () => {
    expect(classify(load({ status: 404 })).outcome).toBe("not-found");
    expect(classify(load({ status: 500 })).outcome).toBe("error");
    expect(classify(load({ status: null })).outcome).toBe("error");
    expect(classify(load({ text: "Something went wrong\nTry again" })).outcome).toBe("error");
  });

  it("does not pass a page that redirected to some other site", () => {
    expect(classify(load({ url: "https://example.com/" })).outcome).toBe("error");
  });
});
