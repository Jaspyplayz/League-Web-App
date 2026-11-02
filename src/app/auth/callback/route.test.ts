import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseClient } from "@/lib/supabase/server";
import { GET } from "./route";

// Supabase is the network; these tests are about where the player is sent.
vi.mock("@/lib/supabase/server", () => ({ createSupabaseClient: vi.fn() }));

const exchangeCodeForSession = vi.fn();

beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  vi.mocked(createSupabaseClient).mockResolvedValue({
    auth: { exchangeCodeForSession },
  } as unknown as Awaited<ReturnType<typeof createSupabaseClient>>);
});

async function landingFor(query: string): Promise<string | null> {
  const response = await GET(new NextRequest(`https://turnpoint.example/auth/callback?${query}`));
  return response.headers.get("location");
}

describe("GET /auth/callback", () => {
  it("returns the player to the page they started from", async () => {
    expect(await landingFor("code=abc&next=/player/kr/Faker-KR1")).toBe(
      "https://turnpoint.example/player/kr/Faker-KR1",
    );
    expect(exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("abc");
  });

  // The URL parser throws on the first three, which used to answer with a 500.
  it.each(["next=//[", "next=//a%20b", "next=//:", "next=/a&next=/b", "next=//evil.com"])(
    "sends ?%s home",
    async (query) => {
      expect(await landingFor(`code=abc&${query}`)).toBe("https://turnpoint.example/");
    },
  );

  it("sends a crafted link with no code back to sign-in, without throwing", async () => {
    expect(await landingFor("next=//[")).toBe("https://turnpoint.example/sign-in?error=callback");
  });
});
