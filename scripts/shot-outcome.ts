// Decides what a page load in `npm run shot` really showed, so a screenshot of
// Vercel's login page or the Riot key notice is never passed off as proof
// that a page works. Kept apart from scripts/shot.ts so it can be tested
// without a browser.

export type Outcome = "ok" | "vercel-login" | "riot-key" | "not-found" | "error";

export type PageLoad = {
  /** The origin `npm run shot` asked for, such as http://localhost:3000. */
  origin: string;
  /** Where the browser ended up after any redirects. */
  url: string;
  /** HTTP status of the page itself, or null when there was no response. */
  status: number | null;
  /** The page's visible text. */
  text: string;
};

// The same notice e2e/smoke.spec.ts waits for. Pages that need Riot show it
// when the development key has expired (every 24 hours) or the server has no
// key at all, like a dev server started in a worktree without .env.local.
const RIOT_KEY_NOTICE = "The site's Riot API key isn't working";

// src/app/global-error.tsx, and Next.js's own message when the page crashes in
// the browser.
const ERROR_TEXTS = ["Something went wrong", "Application error: a client-side exception"];

export function classify(load: PageLoad): { outcome: Outcome; reason: string } {
  const landed = new URL(load.url);
  if (landed.origin !== load.origin) {
    if (landed.hostname === "vercel.com" || landed.hostname.endsWith(".vercel.com")) {
      return { outcome: "vercel-login", reason: `redirected to Vercel's login (${landed.origin})` };
    }
    return { outcome: "error", reason: `redirected away to ${landed.origin}` };
  }
  if (load.status === 401 || load.status === 403) {
    return { outcome: "vercel-login", reason: `the site answered ${load.status}` };
  }
  if (load.status === 404) return { outcome: "not-found", reason: "the site answered 404" };
  if (load.status === null || load.status >= 400) {
    return { outcome: "error", reason: `the site answered ${load.status ?? "nothing"}` };
  }
  if (load.text.includes(RIOT_KEY_NOTICE)) {
    return { outcome: "riot-key", reason: `the page shows "${RIOT_KEY_NOTICE}"` };
  }
  const error = ERROR_TEXTS.find((text) => load.text.includes(text));
  if (error) return { outcome: "error", reason: `the page shows "${error}"` };
  return { outcome: "ok", reason: `the site answered ${load.status}` };
}
