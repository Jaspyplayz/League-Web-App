import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncSeasons } from "@/lib/season-store";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/season-store", () => ({ syncSeasons: vi.fn() }));

const call = (authorization?: string) =>
  GET(
    new Request("https://example.com/api/cron/season-sync", {
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(syncSeasons).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/season-sync", () => {
  it("runs the sync when Vercel sends the secret", async () => {
    vi.mocked(syncSeasons).mockResolvedValue([
      { player: "Jaspy#CA1", saved: 3, left: 0, error: null },
    ]);
    const res = await call("Bearer test-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      players: [{ player: "Jaspy#CA1", saved: 3, left: 0, error: null }],
    });
  });

  it("refuses a missing or wrong secret without spending Riot calls", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("test-secret")).status).toBe(401);
    expect(syncSeasons).not.toHaveBeenCalled();
  });

  it("refuses everything when CRON_SECRET isn't set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(syncSeasons).not.toHaveBeenCalled();
  });
});
