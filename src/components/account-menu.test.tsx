import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { readMyPlayer } from "@/lib/my-player";
import { AccountMenu, MenuSignOut } from "./account-menu";

vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/my-player", () => ({ readMyPlayer: vi.fn() }));
vi.mock("@/lib/profile-store", () => ({
  savedSoloRank: async () => ({ tier: "DIAMOND", rank: "I", leaguePoints: 40 }),
}));
vi.mock("@/lib/ddragon", () => ({ getDataDragon: async () => null }));
vi.mock("@/lib/supabase/config", () => ({ supabaseConfig: () => ({ url: "x", key: "y" }) }));
// The real link reads the address, which needs Next's router.
vi.mock("./sign-in-link", () => ({ SignInLink: () => <a href="/sign-in">Sign in</a> }));

const player = { puuid: "player-1", region: "na" as const, gameName: "Jaspy", tagLine: "CA1", profileIconId: null };

function signedIn() {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", name: "Jasper" } as Awaited<ReturnType<typeof getCurrentUser>>);
}

async function render(): Promise<string> {
  return renderToStaticMarkup(await AccountMenu());
}

beforeEach(signedIn);

describe("AccountMenu", () => {
  it("shows Sign in when nobody is signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect(await render()).toContain("Sign in");
  });

  it("links your name and rank to the profile marked as yours, beside Sign out", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: true, player });
    const html = await render();
    expect(html).toContain('href="/player/na/Jaspy-CA1"');
    expect(html).toContain('aria-label="Jaspy#CA1, Diamond I. Open your profile"');
    expect(html).toContain("#CA1");
    expect(html).toContain('aria-label="Sign out"');
  });

  it("says no profile is marked when none is, with nothing to link to", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: true, player: null });
    const html = await render();
    expect(html).toContain("No profile marked");
    expect(html).not.toContain("/player/");
    expect(html).not.toContain("Couldn&#x27;t load");
  });

  // #167: a failed read used to look like nothing marked, so the menu told
  // you to press "This is me" on a profile that already was yours.
  it("says it couldn't load, not that nothing is marked, when the read fails", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: false });
    const html = await render();
    expect(html).toContain("Couldn&#x27;t load your profile");
    expect(html).not.toContain("No profile marked");
    expect(html).not.toContain("/player/");
  });
});

describe("MenuSignOut", () => {
  it("offers Sign out in the phone menu when signed in", async () => {
    expect(renderToStaticMarkup(await MenuSignOut())).toContain("Sign out");
  });

  it("adds nothing when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect(await MenuSignOut()).toBeNull();
  });
});
