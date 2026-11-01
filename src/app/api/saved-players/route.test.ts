import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { readMyPlayer } from "@/lib/my-player";
import { savedSoloRanks } from "@/lib/profile-store";
import { MAX_PINNED_PLAYERS, MAX_RECENT_PLAYERS } from "@/lib/saved-players";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/my-player", () => ({ readMyPlayer: vi.fn() }));
vi.mock("@/lib/profile-store", () => ({ savedSoloRanks: vi.fn() }));

const faker = { region: "kr", gameName: "Hide on bush", tagLine: "KR1" };
const me = { region: "na", gameName: "Jasper", tagLine: "NA1" };

const call = (body: string) =>
  POST(new Request("https://example.com/api/saved-players", { method: "POST", body }));

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset().mockResolvedValue(null);
  vi.mocked(readMyPlayer).mockReset();
  vi.mocked(savedSoloRanks).mockReset().mockResolvedValue({});
});

describe("POST /api/saved-players", () => {
  it("answers with the ranks of the players it was sent", async () => {
    const ranks = { "kr/hide on bush#kr1": { tier: "CHALLENGER" as const, division: "I" } };
    vi.mocked(savedSoloRanks).mockResolvedValue(ranks);

    const response = await call(JSON.stringify([faker]));

    expect(savedSoloRanks).toHaveBeenCalledExactlyOnceWith([faker]);
    expect(await response.json()).toEqual({ ranks, you: null });
  });

  it.each(["not json", '{"region":"na"}', "null", '[{"region":"mars","gameName":"a","tagLine":"b"}]'])(
    "treats the body %s as an empty list",
    async (body) => {
      const response = await call(body);
      expect(response.status).toBe(200);
      expect(savedSoloRanks).toHaveBeenCalledExactlyOnceWith([]);
    },
  );

  it("reads no more rows than a browser can save", async () => {
    await call(JSON.stringify(Array.from({ length: 500 }, () => faker)));
    expect(vi.mocked(savedSoloRanks).mock.calls[0][0]).toHaveLength(
      MAX_RECENT_PLAYERS + MAX_PINNED_PLAYERS,
    );
  });

  it("adds the signed-in player's own row and looks up their rank too", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(readMyPlayer).mockResolvedValue({
      ok: true,
      player: { puuid: "p1", profileIconId: null, ...me } as never,
    });

    const response = await call(JSON.stringify([faker]));

    expect(savedSoloRanks).toHaveBeenCalledExactlyOnceWith([me, faker]);
    // Only the Riot ID goes back, not the PUUID.
    expect((await response.json()).you).toEqual(me);
  });

  it.each([
    ["hasn't pressed This is me", { ok: true, player: null }],
    ["can't be read", { ok: false }],
  ] as const)("leaves the row out when the signed-in player %s", async (_name, result) => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(readMyPlayer).mockResolvedValue(result);

    const response = await call(JSON.stringify([faker]));

    expect((await response.json()).you).toBeNull();
    expect(savedSoloRanks).toHaveBeenCalledExactlyOnceWith([faker]);
  });
});
