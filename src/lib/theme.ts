// Light or dark colors, picked with the theme switch in the header and kept
// in this browser's localStorage. The colors themselves live in src/app/globals.css:
// dark is the default, and data-theme="light" on <html> swaps in the light set.

// "system" follows the device. The header's switch only saves dark or light,
// but the old Settings page offered System too, so a browser that saved it
// keeps following its device until the switch is pressed.
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

// The theme the page shows right now, read from <html>.
export function shownTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// The switch's label says what a click does, not what's showing.
export function themeSwitchLabel(shown: Theme): string {
  return shown === "dark" ? "Switch to light theme" : "Switch to dark theme";
}

// Header links and buttons fade their colors on hover, and a theme change
// changes those same colors, so without this they would fade into the new
// theme while the rest of the page snaps. A style turns every transition off,
// the theme changes, and reading a computed style makes the browser apply the
// new colors right then, before the style is removed again.
export function applyThemeWithoutFading(choice: ThemeChoice = readThemeChoice()) {
  const noFade = document.createElement("style");
  noFade.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(noFade);
  applyTheme(choice);
  void window.getComputedStyle(document.body).color;
  setTimeout(() => noFade.remove(), 1);
}

// What the header's switch does: saves the other theme and shows it.
export function switchTheme() {
  const next: Theme = shownTheme() === "dark" ? "light" : "dark";
  saveThemeChoice(next);
  applyThemeWithoutFading(next);
}
