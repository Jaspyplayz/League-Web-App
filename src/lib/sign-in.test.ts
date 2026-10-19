import { describe, expect, it } from "vitest";
import { isProvider, safeNextPath, userFromClaims, withoutEmail } from "./sign-in";

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

describe("withoutEmail", () => {
  it("keeps names without an email as they are", () => {
    expect(withoutEmail("  Jasper L ")).toBe("Jasper L");
    expect(withoutEmail("jaspy#0")).toBe("jaspy#0");
  });

  it("drops an email inside or after the name", () => {
    expect(withoutEmail("Jaspyplayz (jasper@example.com)")).toBe("Jaspyplayz");
    expect(withoutEmail("Jaspyplayz <jasper@example.com>")).toBe("Jaspyplayz");
    expect(withoutEmail("Jaspyplayz - jasper@example.com")).toBe("Jaspyplayz");
  });

  it("keeps the part before the @ when the name is only an email", () => {
    expect(withoutEmail("jasper@example.com")).toBe("jasper");
  });
});

describe("userFromClaims", () => {
  const ID = "4f6c1d2e-8a3b-4c5d-9e7f-0a1b2c3d4e5f";

  it("uses the full name and provider from a Google sign-in", () => {
    expect(
      userFromClaims({
        sub: ID,
        email: "jasper@example.com",
        user_metadata: { full_name: "Jasper", name: "Jasper L" },
        app_metadata: { provider: "google" },
      }),
    ).toEqual({ id: ID, name: "Jasper", provider: "google" });
  });

  it("falls back to the Discord username, then the email", () => {
    expect(
      userFromClaims({
        sub: ID,
        user_metadata: { user_name: "jaspy" },
        app_metadata: { provider: "discord" },
      }),
    ).toEqual({ id: ID, name: "jaspy", provider: "discord" });
    expect(
      userFromClaims({ sub: ID, email: "a@b.com", user_metadata: { full_name: "  " } }),
    ).toEqual({
      id: ID,
      name: "a",
      provider: null,
    });
  });

  it("never shows an email address as the name", () => {
    expect(
      userFromClaims({ sub: ID, user_metadata: { full_name: "Jaspyplayz (jasper@example.com)" } })
        ?.name,
    ).toBe("Jaspyplayz");
    expect(userFromClaims({ sub: ID, email: "jasper.l@example.com" })?.name).toBe("jasper.l");
  });

  it("still returns a name when the profile is empty", () => {
    expect(userFromClaims({ sub: ID })).toEqual({ id: ID, name: "Player", provider: null });
  });

  it("treats a token without an account ID as signed out", () => {
    expect(userFromClaims({ user_metadata: { full_name: "Jasper" } })).toBeNull();
    expect(userFromClaims({ sub: "" })).toBeNull();
  });
});
