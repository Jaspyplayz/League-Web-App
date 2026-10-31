import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { readMyPlayer } from "@/lib/my-player";
import { AccountMenu } from "./account-menu";

vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/my-player", () => ({ readMyPlayer: vi.fn() }));
vi.mock("@/lib/profile-store", () => ({ savedSoloRank: async () => null }));
vi.mock("@/lib/ddragon", () => ({ getDataDragon: async () => null }));
vi.mock("@/lib/supabase/config", () => ({ supabaseConfig: () => ({ url: "x", key: "y" }) }));
// The real dropdown hides its menu until clicked; these tests read the menu.
vi.mock("./account-dropdown", () => ({
  AccountDropdown: ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
    <div>
      {trigger}
      {children}
    </div>
  ),
}));

const player = { puuid: "player-1", region: "na" as const, gameName: "Jaspy", tagLine: "CA1", profileIconId: null };

async function render(): Promise<string> {
  return renderToStaticMarkup(await AccountMenu());
}

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", name: "Jasper" } as Awaited<ReturnType<typeof getCurrentUser>>);
});

describe("AccountMenu", () => {
  it("links to the profile marked as yours", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: true, player });
    expect(await render()).toContain('href="/player/na/Jaspy-CA1"');
  });

  it("says how to mark one when none is", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: true, player: null });
    const html = await render();
    expect(html).toContain("on your profile to see your rank here");
    expect(html).not.toContain("Couldn&#x27;t load");
  });

  // #167: a failed read used to look like nothing marked, so the menu told
  // you to press "This is me" on a profile that already was yours.
  it("says it couldn't load, not that nothing is marked, when the read fails", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: false });
    const html = await render();
    expect(html).toContain("Couldn&#x27;t load your profile");
    expect(html).not.toContain("on your profile to see your rank here");
    expect(html).not.toContain("My profile");
  });
});
