"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, readThemeChoice, saveThemeChoice, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; detail: string }[] = [
  { value: "dark", label: "Dark", detail: "The original look" },
  { value: "light", label: "Light", detail: "White background" },
  { value: "system", label: "System", detail: "Follows your device" },
];

// Re-render when the choice changes: in this tab through `listeners`, and in
// other tabs through the browser's "storage" event.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemePicker() {
  // The server can't see localStorage, so its render has nothing picked
  // (null) and the browser ticks the saved choice right after the page loads.
  const choice = useSyncExternalStore<ThemeChoice | null>(subscribe, readThemeChoice, () => null);

  function pick(value: ThemeChoice) {
    saveThemeChoice(value);
    applyTheme(value);
    listeners.forEach((onChange) => onChange());
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-lg font-semibold text-ink">Theme</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-line-strong bg-page p-4 transition-colors hover:border-ahead-soft has-[:checked]:border-ahead has-[:checked]:bg-ahead/10"
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={choice === option.value}
              onChange={() => pick(option.value)}
              className="mt-1 accent-ahead"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-medium text-ink">{option.label}</span>
              <span className="text-note text-muted">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
