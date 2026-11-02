import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocalSetting, saveLocalSetting, subscribeToLocalSettings } from "./local-setting";

afterEach(() => vi.unstubAllGlobals());

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

describe("readLocalSetting", () => {
  it("returns what's saved under the key, or null when nothing is", () => {
    fakeStorage().set("turnpoint-theme", "light");
    expect(readLocalSetting("turnpoint-theme")).toBe("light");
    expect(readLocalSetting("turnpoint-focus")).toBeNull();
  });

  it("returns null when the browser blocks storage", () => {
    fakeStorage({ blocked: true });
    expect(readLocalSetting("turnpoint-theme")).toBeNull();
  });
});

describe("saveLocalSetting", () => {
  it("saves the value under the key", () => {
    const saved = fakeStorage();
    saveLocalSetting("turnpoint-theme", "light");
    expect(saved.get("turnpoint-theme")).toBe("light");
  });

  it("doesn't throw when the browser blocks storage", () => {
    fakeStorage({ blocked: true });
    expect(() => saveLocalSetting("turnpoint-theme", "light")).not.toThrow();
  });
});

describe("subscribeToLocalSettings", () => {
  // A real EventTarget stands in for window, so the "storage" event another
  // tab's save fires can be sent for real.
  function fakeWindow() {
    const window = new EventTarget();
    vi.stubGlobal("window", window);
    return window;
  }

  it("tells subscribers about a save in this tab until they unsubscribe", () => {
    fakeStorage();
    fakeWindow();
    const onChange = vi.fn();
    const unsubscribe = subscribeToLocalSettings(onChange);
    saveLocalSetting("turnpoint-theme", "light");
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    saveLocalSetting("turnpoint-theme", "dark");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("tells subscribers about a save in another tab until they unsubscribe", () => {
    const window = fakeWindow();
    const onChange = vi.fn();
    const unsubscribe = subscribeToLocalSettings(onChange);
    window.dispatchEvent(new Event("storage"));
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(new Event("storage"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
