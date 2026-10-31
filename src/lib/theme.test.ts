import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_KEY,
  THEME_SCRIPT,
  parseThemeChoice,
  resolveTheme,
  switchTheme,
  themeSwitchLabel,
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

// The header's switch, run in a fake browser: it saves and shows the other
// theme, and turns transitions off only for the moment of the switch.
describe("switchTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function fakeBrowser(shown: "dark" | "light") {
    vi.useFakeTimers();
    const root = { dataset: { theme: shown } as Record<string, string> };
    const styles: { textContent: string; remove: () => void }[] = [];
    vi.stubGlobal("document", {
      documentElement: root,
      body: {},
      createElement: () => {
        const style = { textContent: "", remove: () => styles.splice(styles.indexOf(style), 1) };
        return style;
      },
      head: { appendChild: (style: (typeof styles)[number]) => styles.push(style) },
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      getComputedStyle: () => ({ color: "" }),
    });
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    return { root, styles, saved };
  }

  it("goes from dark to light, saves it, and puts transitions back after", () => {
    const { root, styles, saved } = fakeBrowser("dark");
    switchTheme();
    expect(root.dataset.theme).toBe("light");
    expect(saved.get(THEME_KEY)).toBe("light");
    expect(styles.map((s) => s.textContent)).toEqual([
      "*,*::before,*::after{transition:none!important}",
    ]);
    vi.runAllTimers();
    expect(styles).toEqual([]);
  });

  it("goes from light back to dark", () => {
    const { root, saved } = fakeBrowser("light");
    switchTheme();
    expect(root.dataset.theme).toBe("dark");
    expect(saved.get(THEME_KEY)).toBe("dark");
  });
});

describe("themeSwitchLabel", () => {
  it("says what a click does", () => {
    expect(themeSwitchLabel("dark")).toBe("Switch to light theme");
    expect(themeSwitchLabel("light")).toBe("Switch to dark theme");
  });
});
