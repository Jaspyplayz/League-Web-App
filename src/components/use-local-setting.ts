import { useSyncExternalStore } from "react";
import { readLocalSetting, subscribeToLocalSettings } from "@/lib/local-setting";

// The setting saved under `key` in this browser (see src/lib/local-setting.ts),
// as the saved string for the caller to parse, or null. useSyncExternalStore
// reads from outside React and re-renders when the setting changes. It
// compares each read with the last using ===, which is why this returns the
// string: a freshly parsed object would look new on every read. The server
// can't see localStorage, so it renders with null, and the browser fills the
// setting in right after the page loads.
export function useLocalSetting(key: string): string | null {
  return useSyncExternalStore(
    subscribeToLocalSettings,
    () => readLocalSetting(key),
    () => null,
  );
}
