"use client";

import { useSyncExternalStore } from "react";
import { shownTheme, switchTheme, themeSwitchLabel } from "@/lib/theme";
import { iconButton } from "./header-style";
import { MoonIcon, SunIcon } from "./icons";

// Re-render whenever <html>'s data-theme changes, whoever changed it: this
// button, the <head> script, or ThemeWatcher following another tab.
function subscribe(onChange: () => void) {
  const watcher = new MutationObserver(onChange);
  watcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => watcher.disconnect();
}

// The header's sun and moon: a moon in dark, a sun in light, like deeplol.
// The icons switch with CSS (the dark: and light: variants in globals.css),
// so the right one shows before React starts. The label needs React: the
// server can't see the saved theme, so its first render says dark and the
// browser corrects it right after the page loads.
export function ThemeSwitch() {
  const shown = useSyncExternalStore(subscribe, shownTheme, () => "dark" as const);
  const label = themeSwitchLabel(shown);
  return (
    <button type="button" onClick={switchTheme} aria-label={label} title={label} className={iconButton}>
      <MoonIcon className="light:hidden" />
      <SunIcon className="hidden light:block" />
    </button>
  );
}
