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
const HOME = "http://turnpoint.invalid";

export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith("/")) return "/";
  const url = new URL(next, HOME);
  return url.origin === HOME ? `${url.pathname}${url.search}${url.hash}` : "/";
}

// The parts of a signed-in user the header shows. Google and Discord fill in
// slightly different profile fields, so fall back from one to the next.
export type SignedInUser = {
  name: string;
  provider: Provider | null;
};

type Claims = {
  email?: unknown;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export function userFromClaims(claims: Claims): SignedInUser {
  const meta = claims.user_metadata ?? {};
  const name = [meta.full_name, meta.name, meta.user_name, claims.email].find(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
  const provider = String(claims.app_metadata?.provider ?? "");

  return {
    name: name?.trim() ?? "Player",
    provider: isProvider(provider) ? provider : null,
  };
}
