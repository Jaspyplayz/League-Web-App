import { describe, expect, it } from "vitest";
import { isProvider, safeNextPath, userFromClaims } from "./sign-in";

describe("isProvider", () => {
  it("accepts the providers we offer", () => {
    expect(isProvider("google")).toBe(true);
    expect(isProvider("discord")).toBe(true);
  });

  it.each(["github", "riot", "", "toString"])("rejects %j", (value) => {
    expect(isProvider(value)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/player/kr/Hide%20on%20bush-KR1")).toBe(
      "/player/kr/Hide%20on%20bush-KR1",
    );
    expect(safeNextPath("/?tab=insights")).toBe("/?tab=insights");
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "player",
  ])(
    "sends %j home instead",
    (next) => {
      expect(safeNextPath(next)).toBe("/");
    },
  );
});

describe("userFromClaims", () => {
  it("uses the full name and provider from a Google sign-in", () => {
    expect(
      userFromClaims({
        email: "jasper@example.com",
        user_metadata: { full_name: "Jasper", name: "Jasper L" },
        app_metadata: { provider: "google" },
      }),
    ).toEqual({ name: "Jasper", provider: "google" });
  });

  it("falls back to the Discord username, then the email", () => {
    expect(
      userFromClaims({ user_metadata: { user_name: "jaspy" }, app_metadata: { provider: "discord" } }),
    ).toEqual({ name: "jaspy", provider: "discord" });
    expect(userFromClaims({ email: "a@b.com", user_metadata: { full_name: "  " } })).toEqual({
      name: "a@b.com",
      provider: null,
    });
  });

  it("still returns a name when the profile is empty", () => {
    expect(userFromClaims({})).toEqual({ name: "Player", provider: null });
  });
});
