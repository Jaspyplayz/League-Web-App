import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { forgetMyPlayer, saveMyPlayer } from "@/lib/my-player";
import { toggleMyPlayer } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/my-player", () => ({ saveMyPlayer: vi.fn(), forgetMyPlayer: vi.fn() }));
// The other actions' modules, which these tests don't use.
vi.mock("@/lib/ask-store", () => ({}));
vi.mock("@/lib/recap-store", () => ({}));
vi.mock("@/lib/match-note-store", () => ({}));
vi.mock("@/lib/day-note-store", () => ({}));
vi.mock("@/lib/riot/api", () => ({}));
vi.mock("@/lib/riot/client", () => ({ RiotApiError: class extends Error {} }));

function form(puuid: string, intent?: string): FormData {
  const data = new FormData();
  data.set("puuid", puuid);
  if (intent !== undefined) data.set("intent", intent);
  return data;
}

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as Awaited<ReturnType<typeof getCurrentUser>>);
  vi.mocked(saveMyPlayer).mockReset();
  vi.mocked(forgetMyPlayer).mockReset();
});

describe("toggleMyPlayer", () => {
  it("clears only this profile's mark when the form says clear", async () => {
    await toggleMyPlayer(form("player-1", "clear"));
    expect(forgetMyPlayer).toHaveBeenCalledWith("user-1", "player-1");
    expect(saveMyPlayer).not.toHaveBeenCalled();
  });

  it("marks the profile when the form says mark", async () => {
    await toggleMyPlayer(form("player-2", "mark"));
    expect(saveMyPlayer).toHaveBeenCalledWith("user-1", "player-2");
    expect(forgetMyPlayer).not.toHaveBeenCalled();
  });

  // #167: the action used to read what's marked and toggle it, so a failed
  // or stale read turned a click meant to mark into one that cleared. Now
  // the form says which, and a form that doesn't changes nothing.
  it.each([undefined, "", "toggle"])("changes nothing when the form's intent is %s", async (intent) => {
    await toggleMyPlayer(form("player-1", intent));
    expect(saveMyPlayer).not.toHaveBeenCalled();
    expect(forgetMyPlayer).not.toHaveBeenCalled();
  });

  it("changes nothing when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await toggleMyPlayer(form("player-1", "clear"));
    expect(forgetMyPlayer).not.toHaveBeenCalled();
  });
});
