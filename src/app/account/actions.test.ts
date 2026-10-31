import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { forgetMyPlayer, readMyPlayer, saveMyPlayer } from "@/lib/my-player";
import { toggleMyPlayer } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/my-player", () => ({ readMyPlayer: vi.fn(), saveMyPlayer: vi.fn(), forgetMyPlayer: vi.fn() }));
// The other actions' modules, which these tests don't use.
vi.mock("@/lib/ask-store", () => ({}));
vi.mock("@/lib/recap-store", () => ({}));
vi.mock("@/lib/match-note-store", () => ({}));
vi.mock("@/lib/day-note-store", () => ({}));
vi.mock("@/lib/riot/api", () => ({}));
vi.mock("@/lib/riot/client", () => ({ RiotApiError: class extends Error {} }));

const player = { puuid: "player-1", region: "na" as const, gameName: "Jaspy", tagLine: "CA1", profileIconId: null };

function form(puuid: string): FormData {
  const data = new FormData();
  data.set("puuid", puuid);
  return data;
}

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" } as Awaited<ReturnType<typeof getCurrentUser>>);
  vi.mocked(saveMyPlayer).mockReset();
  vi.mocked(forgetMyPlayer).mockReset();
});

describe("toggleMyPlayer", () => {
  it("clears the mark when the profile is already yours", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: true, player });
    await toggleMyPlayer(form("player-1"));
    expect(forgetMyPlayer).toHaveBeenCalledWith("user-1");
    expect(saveMyPlayer).not.toHaveBeenCalled();
  });

  it("marks the profile when another one is yours", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: true, player });
    await toggleMyPlayer(form("player-2"));
    expect(saveMyPlayer).toHaveBeenCalledWith("user-1", "player-2");
    expect(forgetMyPlayer).not.toHaveBeenCalled();
  });

  // #167: with the read failing, it can't tell a click meant to mark from one
  // meant to clear, so it changes nothing.
  it("changes nothing when it can't read what's marked", async () => {
    vi.mocked(readMyPlayer).mockResolvedValue({ ok: false });
    await toggleMyPlayer(form("player-1"));
    expect(saveMyPlayer).not.toHaveBeenCalled();
    expect(forgetMyPlayer).not.toHaveBeenCalled();
  });
});
