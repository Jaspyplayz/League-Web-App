import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignInPage from "./page";

// The real signIn() imports Supabase code marked server-only, which can't
// load in a test, so a stand-in takes its place.
vi.mock("@/app/auth/actions", () => ({ signIn: vi.fn() }));

// Without these the panel says sign-in isn't set up and never uses ?next=.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-only");
});
afterEach(() => vi.unstubAllEnvs());

// prerender, not renderToStaticMarkup: it waits for the part behind the
// page's <Suspense>, where the address is read. When that part throws,
// prerender doesn't: React draws the stand-in and leaves the rest to the
// browser. So any error it reports fails the test, and a page that crashed
// can't pass a test that only checks what's missing.
async function pageFor(params: Record<string, string | string[]>): Promise<string> {
  const errors: unknown[] = [];
  const { prelude } = await prerender(<SignInPage searchParams={Promise.resolve(params)} />, {
    onError: (error) => void errors.push(error),
  });
  if (errors.length > 0) throw errors[0];
  return new Response(prelude).text();
}

// React splits "Continue with Google" into two text parts, so the tests look
// for the button's hidden field instead.
const GOOGLE_BUTTON = 'name="provider" value="google"';

describe("the sign-in page", () => {
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
    expect(html).toContain(GOOGLE_BUTTON);
  });

  it("shows no message for an ?error= sent twice", async () => {
    const html = await pageFor({ error: ["callback", "provider"] });
    expect(html).not.toContain('role="alert"');
    expect(html).toContain(GOOGLE_BUTTON);
  });

  it("says sign-in isn't set up when Supabase isn't", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const html = await pageFor({});
    expect(html).toContain("Sign-in isn&#x27;t set up on this copy of the site yet.");
    expect(html).not.toContain(GOOGLE_BUTTON);
  });
});
