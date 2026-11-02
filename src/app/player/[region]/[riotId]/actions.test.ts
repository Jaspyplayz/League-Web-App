import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateProfile } from "@/lib/profile-store";
import { updateProfileAction } from "./actions";

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
// updateProfile is the action's only way to the database, so when it isn't
// called, no query ran and nothing could reach Sentry.
vi.mock("@/lib/profile-store", () => ({ updateProfile: vi.fn() }));
vi.mock("@/lib/match-builds", () => ({ loadBuilds: vi.fn() }));

// Made up, since the repo is public: 78 characters like Riot's PUUIDs.
const MADE_UP_PUUID = "Ab1-_".repeat(15) + "Cd2";

beforeEach(() => {
  vi.mocked(updateProfile).mockReset().mockResolvedValue({ status: "updated" });
  vi.mocked(refresh).mockReset();
});

describe("updateProfileAction", () => {
  it("updates the player and shows the new snapshot", async () => {
    expect(await updateProfileAction("na", MADE_UP_PUUID)).toEqual({ status: "updated" });
    expect(updateProfile).toHaveBeenCalledWith("na", MADE_UP_PUUID);
    expect(refresh).toHaveBeenCalledOnce();
  });

  // JAS-214: a PUUID holding a NUL reached Postgres, which refuses one, and
  // the error went to Sentry. isPuuid's tests cover the other shapes.
  it("refuses made-up arguments without asking the database", async () => {
    const calls: [string, string][] = [
      ["na", "\u0000"],
      ["na", ""],
      ["na", undefined as unknown as string],
      ["moon", MADE_UP_PUUID],
    ];
    for (const args of calls) {
      expect(await updateProfileAction(...args)).toEqual({ status: "failed", kind: "not-found" });
    }
    expect(updateProfile).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
