// Decides what a page load in `npm run shot` really showed, so a screenshot of
// Vercel's login page or the Riot key notice is never passed off as proof
// that a page works. Kept apart from scripts/shot.ts so it can be tested
// without a browser.

export const OUTCOMES = ["ok", "vercel-login", "riot-key", "not-found", "error"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type PageLoad = {
  /** The origin `npm run shot` asked for, such as http://localhost:3000. */
  origin: string;
  /** Where the browser ended up after any redirects. */
  url: string;
  /** HTTP status of the page itself, or null when there was no response. */
  status: number | null;
  /** The page's visible text. */
  text: string;
  /**
   * Whether the page asks search engines not to index it. Next.js adds that
   * to its not-found page, which the player and match pages show with status
   * 200 when they call notFound() inside a Suspense boundary.
   */
  noindex: boolean;
  /**
   * The text of each role="alert" element. The site uses them only for
   * failures: a Riot notice, a Riot ID that isn't one, a failed sign-in.
   */
  alerts: string[];
};

// The same notice e2e/smoke.spec.ts waits for. Pages that need Riot show it
// when the development key has expired (every 24 hours) or the server has no
// key at all, like a dev server started in a worktree without .env.local.
export const RIOT_KEY_NOTICE = "The site's Riot API key isn't working";

// The player page's answer to a Riot ID that doesn't exist. It is an ordinary
// page, not the not-found one, so it has neither a 404 nor noindex.
export const NO_PLAYER = "No player found";

// src/app/global-error.tsx, and Next.js's own message when the page crashes in
// the browser.
export const ERROR_TEXTS = ["Something went wrong", "Application error: a client-side exception"];

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
  if (load.noindex) {
    return { outcome: "not-found", reason: `the site answered ${load.status} with its not-found page` };
  }
  if (load.text.includes(NO_PLAYER)) {
    return { outcome: "not-found", reason: `the page shows "${NO_PLAYER}"` };
  }
  if (load.text.includes(RIOT_KEY_NOTICE)) {
    return { outcome: "riot-key", reason: `the page shows "${RIOT_KEY_NOTICE}"` };
  }
  const error = ERROR_TEXTS.find((text) => load.text.includes(text));
  if (error) return { outcome: "error", reason: `the page shows "${error}"` };
  if (load.alerts.length > 0) {
    return { outcome: "error", reason: `the page shows an alert: "${load.alerts[0].slice(0, 120)}"` };
  }
  return { outcome: "ok", reason: `the site answered ${load.status}` };
}
