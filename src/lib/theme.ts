// Light or dark colors, picked on the Settings page and kept in this
// browser's localStorage. The colors themselves live in src/app/globals.css:
// dark is the default, and data-theme="light" on <html> swaps in the light set.

export type ThemeChoice = "dark" | "light" | "system";
export type Theme = "dark" | "light";

export const THEME_KEY = "turnpoint-theme";
export const THEME_CHOICES: readonly ThemeChoice[] = ["dark", "light", "system"];

// The site was dark only before this setting existed, so dark stays the
// default for anyone who hasn't picked.
export const DEFAULT_THEME_CHOICE: ThemeChoice = "dark";

// What's saved can be anything (an old value, a hand edit), so only the three
// known choices count; anything else falls back to the default.
export function parseThemeChoice(saved: string | null): ThemeChoice {
  return THEME_CHOICES.includes(saved as ThemeChoice)
    ? (saved as ThemeChoice)
    : DEFAULT_THEME_CHOICE;
}

// "System" follows the device's light or dark setting.
export function resolveTheme(choice: ThemeChoice, deviceIsLight: boolean): Theme {
  if (choice === "system") return deviceIsLight ? "light" : "dark";
  return choice;
}

export const LIGHT_QUERY = "(prefers-color-scheme: light)";

// Runs in <head> as the page loads, before anything is drawn, so a light-mode
// visitor never sees a flash of dark. React hasn't started yet at that point,
// so this is a plain string of browser JavaScript doing what applyTheme()
// below does. theme.test.ts runs it to check the two agree.
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(THEME_KEY)});var l=c==="light"||(c==="system"&&window.matchMedia(${JSON.stringify(LIGHT_QUERY)}).matches);document.documentElement.dataset.theme=l?"light":"dark"}catch(e){}})()`;

// localStorage can throw, for example when the browser blocks site data. The
// site then simply stays dark.
export function readThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME_CHOICE;
  }
}

export function saveThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Not saved, but applyTheme() still switches this page.
  }
}

// Sets data-theme on <html>, which globals.css reads to pick the colors.
export function applyTheme(choice: ThemeChoice = readThemeChoice()) {
  const deviceIsLight = window.matchMedia(LIGHT_QUERY).matches;
  document.documentElement.dataset.theme = resolveTheme(choice, deviceIsLight);
}
