import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInOptions } from "./sign-in-options";

// signIn() is a server action that talks to Supabase; these tests are about
// how the page reads the address, so a stand-in is enough.
vi.mock("@/app/auth/actions", () => ({ signIn: vi.fn() }));

// Without these the panel says sign-in isn't set up and never reads ?next=.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-only");
});
afterEach(() => vi.unstubAllEnvs());

async function pageFor(params: Record<string, string | string[]>): Promise<string> {
  return renderToStaticMarkup(await SignInOptions({ searchParams: Promise.resolve(params) }));
}

describe("the sign-in page reading the address", () => {
  it("passes a lone ?next= and ?error= on to the panel", async () => {
    const html = await pageFor({ next: "/player/kr/Faker-KR1", error: "callback" });
    expect(html).toContain('name="next" value="/player/kr/Faker-KR1"');
    expect(html).toContain("Signing in didn&#x27;t finish.");
  });

  // Next.js hands the page an array when a value is in the address twice,
  // and the array used to reach safeNextPath, which threw.
  it("sends a ?next= sent twice home, with the buttons still there", async () => {
    const html = await pageFor({ next: ["/a", "/b"] });
    expect(html).toContain('name="next" value="/"');
    expect(html).toContain("Continue with Google");
  });

  it("shows no message for an ?error= sent twice", async () => {
    const html = await pageFor({ error: ["callback", "provider"] });
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("Continue with Google");
  });
});
