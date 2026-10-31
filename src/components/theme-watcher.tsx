"use client";

import { useLayoutEffect } from "react";
import { LIGHT_QUERY, THEME_KEY, applyTheme, applyThemeWithoutFading } from "@/lib/theme";

// Renders nothing. The <head> script sets the theme as the page loads; this
// keeps it right afterwards:
// - when "System" was picked and the device switches between light and dark
// - when the header's switch is pressed in another tab
// - in development, where React briefly resets <html> and clears the theme
export function ThemeWatcher() {
  useLayoutEffect(() => {
    applyTheme();
    const reapply = () => applyThemeWithoutFading();
    const device = window.matchMedia(LIGHT_QUERY);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY) reapply();
    };
    device.addEventListener("change", reapply);
    window.addEventListener("storage", onStorage);
    return () => {
      device.removeEventListener("change", reapply);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
