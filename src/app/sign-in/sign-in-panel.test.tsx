import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignInPanel } from "./sign-in-panel";

// signIn() is a server action that talks to Supabase; these tests are about
// what the panel shows, so a stand-in is enough.
vi.mock("@/app/auth/actions", () => ({ signIn: vi.fn() }));

// Blue and red mean you and the opponent, so a failed sign-in uses neither.
const ALARM_COLOURS = /\b(?:text|bg|border)-(?:ahead|behind)\S*/;

function alertOf(html: string): string {
  const match = html.match(/<p role="alert"[^]*?<\/p>/);
  if (!match) throw new Error("no alert row");
  return match[0];
}

describe("the sign-in panel", () => {
  it("offers Google and Discord, with no alert", () => {
    const html = renderToStaticMarkup(<SignInPanel configured />);
    expect(html).toContain("Continue with Google");
    expect(html).toContain("Continue with Discord");
    expect(html).not.toContain('role="alert"');
  });

  it("keeps a safe ?next= for after signing in", () => {
    const html = renderToStaticMarkup(<SignInPanel configured next="/player/kr/Faker-KR1" />);
    expect(html).toContain('name="next" value="/player/kr/Faker-KR1"');
  });

  // The last three made the URL parser throw, which showed the error page.
  it.each(["//evil.com", "//[", "//a b", "//:"])(
    "sends ?next=%j home, with the buttons still there",
    (next) => {
      const html = renderToStaticMarkup(<SignInPanel configured next={next} />);
      expect(html).toContain('name="next" value="/"');
      expect(html).toContain("Continue with Google");
    },
  );

  it("shows today's message above the buttons after a failed attempt, in neutral colours", () => {
    const html = renderToStaticMarkup(<SignInPanel configured error="callback" />);
    const alert = alertOf(html);
    expect(alert).toContain("Signing in didn&#x27;t finish.");
    expect(alert).not.toMatch(ALARM_COLOURS);
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf("Continue with Google"));
  });

  it.each([
    ["provider", "That sign-in option isn&#x27;t available."],
    ["start", "Couldn&#x27;t start signing in. Please try again."],
  ])("shows the %s message", (error, message) => {
    const html = renderToStaticMarkup(<SignInPanel configured error={error} />);
    expect(alertOf(html)).toContain(message);
  });

  // __proto__, constructor and toString are on every object, so a plain
  // lookup found them, and drawing __proto__ threw the error page.
  it.each(["nonsense", "__proto__", "constructor", "toString"])(
    "falls back to the start message for ?error=%j",
    (error) => {
      const html = renderToStaticMarkup(<SignInPanel configured error={error} />);
      expect(alertOf(html)).toContain("Couldn&#x27;t start signing in.");
      expect(html).toContain("Continue with Google");
      expect(html).toContain("Continue with Discord");
    },
  );

  it("says sign-in isn't set up in place of the buttons", () => {
    const html = renderToStaticMarkup(<SignInPanel configured={false} error="callback" />);
    expect(html).toContain("Sign-in isn&#x27;t set up on this copy of the site yet.");
    expect(html).not.toContain("Continue with");
    expect(html).not.toContain('role="alert"');
  });
});
