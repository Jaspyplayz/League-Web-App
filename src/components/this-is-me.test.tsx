import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { readMyPlayer } from "@/lib/my-player";
import { ThisIsMeButton } from "./this-is-me";

vi.mock("@/app/account/actions", () => ({ toggleMyPlayer: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/my-player", () => ({ readMyPlayer: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ supabaseConfig: () => ({ url: "x", key: "y" }) }));

const props = { region: "na", puuid: "player-1", gameName: "Jaspy", tagLine: "CA1" };
const player = { ...props, region: "na" as const, profileIconId: null };

async function render(): Promise<string> {
  return renderToStaticMarkup(await ThisIsMeButton(props));
}

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as Awaited<ReturnType<typeof getCurrentUser>>);
});

describe("ThisIsMeButton", () => {
  it("shows a profile you marked as yours, with a button to unmark it", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: true, player });
    const html = await render();
    expect(html).toContain("✓ This is you");
    expect(html).toContain('type="submit"');
    expect(html).toContain('name="intent" value="clear"');
  });

  it("offers to mark a profile that isn't yours", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: true, player: null });
    const html = await render();
    expect(html).toContain("This is me");
    expect(html).toContain('type="submit"');
    expect(html).toContain('name="intent" value="mark"');
  });

  // #167: a failed read used to look like nothing marked, so this offered
  // "This is me" on your own profile, and clicking it cleared the mark.
  it("offers no button that marks or clears when it can't read what's marked", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: false });
    const html = await render();
    expect(html).toContain("disabled");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="submit"');
    expect(html).toContain("Couldn&#x27;t check whether this profile is yours");
    // The reason shows as the label too, since phones don't show a title.
    expect(html).toContain(">Reload to check</button>");
    expect(html).not.toContain("hover:");
    // Readable in both themes: muted text, not faded with opacity.
    expect(html).toContain("text-muted");
    expect(html).not.toContain("opacity-");
  });
});
