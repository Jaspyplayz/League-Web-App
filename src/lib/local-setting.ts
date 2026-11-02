// Small settings kept in this browser's localStorage: the recent and pinned
// players, the focus goal and the theme. Each one is a nice extra, and the
// site works without them.
//
// localStorage can throw, for example when the browser blocks site data, so
// all reading and writing goes through these functions, which never throw.
// There's no React here, so theme.ts, which the server-rendered layout
// imports, can use it. The hook for components is in
// src/components/use-local-setting.ts.

// What's saved under `key`, or null when nothing is or storage is blocked.
export function readLocalSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Components showing a setting re-render when it changes: in this tab through
// `listeners`, and in other tabs through the browser's "storage" event, which
// only fires in the tabs that didn't make the change.
const listeners = new Set<() => void>();

export function saveLocalSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved this time; nothing else to do.
  }
  listeners.forEach((onChange) => onChange());
}

export function subscribeToLocalSettings(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
