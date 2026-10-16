import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_KEY,
  THEME_SCRIPT,
  parseThemeChoice,
  resolveTheme,
  type ThemeChoice,
} from "./theme";

describe("parseThemeChoice", () => {
  it("keeps the three known choices", () => {
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("system")).toBe("system");
  });

  it("falls back to dark for nothing saved or anything unknown", () => {
    expect(parseThemeChoice(null)).toBe("dark");
    expect(parseThemeChoice("blue")).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("uses light or dark as picked, whatever the device says", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("follows the device for System", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });
});

// The <head> script is a hand-written string, so run it in a fake browser and
// check it lands on the same theme as resolveTheme for every case.
describe("THEME_SCRIPT", () => {
  afterEach(() => vi.unstubAllGlobals());

  function runScript(saved: string | null, deviceIsLight: boolean, storageThrows = false) {
    const root = { dataset: {} as Record<string, string> };
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: deviceIsLight }) });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("blocked");
        return key === THEME_KEY ? saved : null;
      },
    });
    new Function(THEME_SCRIPT)();
    return root.dataset.theme;
  }

  const cases: [ThemeChoice | null, boolean][] = [
    ["dark", false],
    ["dark", true],
    ["light", false],
    ["light", true],
    ["system", false],
    ["system", true],
    [null, true],
  ];

  it.each(cases)("saved %s, device light %s", (saved, deviceIsLight) => {
    expect(runScript(saved, deviceIsLight)).toBe(
      resolveTheme(parseThemeChoice(saved), deviceIsLight),
    );
  });

  it("leaves the page alone when storage is blocked", () => {
    expect(runScript("light", true, true)).toBeUndefined();
  });
});
