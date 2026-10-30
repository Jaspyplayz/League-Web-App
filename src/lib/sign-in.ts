// Small pure helpers for signing in. The Supabase calls live in
// src/lib/supabase/ and src/app/auth/; these are kept separate so they can be
// unit tested without a browser, cookies or a network.

// The sign-in buttons offered today. Riot sign-in joins this list once Riot
// approves a production key (issue #40).
export const PROVIDERS = {
  google: "Google",
  discord: "Discord",
} as const;

export type Provider = keyof typeof PROVIDERS;

export function isProvider(value: string): value is Provider {
  return Object.hasOwn(PROVIDERS, value);
}

// After signing in we send the player back to the page they came from, which
// travels through Google or Discord as a ?next= value. Anyone can edit that
// value, so only accept paths on this site. Checking for a leading "/" isn't
// enough: browsers read "//evil.com" and "/\evil.com" as other websites. So
// let the URL parser decide, the same way the browser will, and keep the
// result only if it stays on our (placeholder) site.
//
// The parser also tidies the path, and that can create a new "//": "/a/..//evil.com"
// tidies to "//evil.com". So check the tidied path too before sending it back.
const HOME = "http://turnpoint.invalid";

export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith("/")) return "/";
  const url = new URL(next, HOME);
  if (url.origin !== HOME || url.pathname.startsWith("//")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

// The parts of a signed-in user the site uses. Google and Discord fill in
// slightly different profile fields, so the name falls back from one to the
// next.
export type SignedInUser = {
  // Supabase's ID for the account (a UUID). It never changes, so rows the
  // account owns, like its "This is me" player, are keyed by it.
  id: string;
  name: string;
  provider: Provider | null;
};

type Claims = {
  sub?: unknown;
  email?: unknown;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

// Null when the token has no account ID, which a real Supabase token always
// has; treating that as signed out is safer than guessing.
export function userFromClaims(claims: Claims): SignedInUser | null {
  if (typeof claims.sub !== "string" || claims.sub === "") return null;

  const meta = claims.user_metadata ?? {};
  const name = [meta.full_name, meta.name, meta.user_name, claims.email]
    .filter((value): value is string => typeof value === "string")
    .map(cleanName)
    .find((value) => value !== "");
  const provider = String(claims.app_metadata?.provider ?? "");

  return {
    id: claims.sub,
    name: name ?? "Player",
    provider: isProvider(provider) ? provider : null,
  };
}

// The header shows this name to everyone looking at the screen, so it's one
// clean name: never an email address, and nothing in brackets. Some profiles
// add a second name or an email after the first, like "Jaspyplayz
// (jaspyplayz)" or "Jaspyplayz <jasper@example.com>": that part is dropped.
// When the email is all there is, only the part before the @ is kept.
const EMAIL = /\S+@\S+\.\S+/;

export function cleanName(name: string): string {
  const trimmed = name.trim();
  const rest = trimmed
    .replace(/\([^)]*\)?|\[[^\]]*\]?|<[^>]*>?/g, "") // (...), [...], <...>, even if cut off
    .replace(EMAIL, "")
    .replace(/[\s,;:|-]+$/, "")
    .trim();
  if (rest !== "") return rest;
  // Nothing but brackets or an email: keep what's inside, minus any email domain.
  return trimmed
    .replace(/[()[\]<>]/g, "")
    .trim()
    .split("@")[0];
}
