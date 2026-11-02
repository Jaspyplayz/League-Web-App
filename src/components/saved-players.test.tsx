import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addRecentPlayer,
  PINNED_PLAYERS_KEY,
  RECENT_PLAYERS_KEY,
  type SavedPlayer,
} from "@/lib/saved-players";
import { PinButton, updateSavedPlayers } from "./saved-players";
import { useLocalSetting } from "./use-local-setting";

// The real hook, wrapped so a test can stand in for the browser's side.
vi.mock("./use-local-setting", async (real) => ({
  useLocalSetting: vi.fn((await real<typeof import("./use-local-setting")>()).useLocalSetting),
}));

const faker: SavedPlayer = { region: "kr", gameName: "Hide on bush", tagLine: "KR1" };
const caps: SavedPlayer = { region: "euw", gameName: "Caps", tagLine: "EUW" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(useLocalSetting).mockReset();
});

// Players' browsers already hold their pins under this name, so reading
// another one would lose them.
it("fills the star for a player this browser saved under turnpoint:pinned-players", () => {
  const pinned = JSON.stringify([faker]);
  vi.mocked(useLocalSetting).mockImplementation((key) => (key === "turnpoint:pinned-players" ? pinned : null));
  expect(renderToStaticMarkup(<PinButton {...faker} />)).toContain('aria-pressed="true"');
});

// A browser's localStorage, kept in a Map, or one that blocks every read and
// write the way a browser blocking site data does.
function fakeStorage({ blocked = false } = {}) {
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => {
      if (blocked) throw new Error("blocked");
      return saved.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error("blocked");
      saved.set(key, value);
    },
  });
  return saved;
}

describe("updateSavedPlayers", () => {
  it("saves the change to the list as it's saved right now", () => {
    const saved = fakeStorage();
    saved.set(RECENT_PLAYERS_KEY, JSON.stringify([faker]));
    updateSavedPlayers(RECENT_PLAYERS_KEY, (list) => addRecentPlayer(list, caps));
    expect(JSON.parse(saved.get(RECENT_PLAYERS_KEY)!)).toEqual([caps, faker]);
  });

  it("starts from an empty list and doesn't throw when the browser blocks storage", () => {
    fakeStorage({ blocked: true });
    const change = vi.fn((list: SavedPlayer[]) => addRecentPlayer(list, caps));
    expect(() => updateSavedPlayers(RECENT_PLAYERS_KEY, change)).not.toThrow();
    expect(change).toHaveBeenCalledWith([]);
  });
});

describe("PinButton", () => {
  // The server can't see this browser's lists, so the star always starts
  // unpinned and the browser fills it in after the page loads.
  it("renders unpinned on the server, even for a player this browser pinned", () => {
    fakeStorage().set(PINNED_PLAYERS_KEY, JSON.stringify([faker]));
    const html = renderToStaticMarkup(<PinButton {...faker} />);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Pin Hide on bush#KR1"');
  });
});
