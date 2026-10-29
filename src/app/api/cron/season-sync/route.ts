import "server-only";

import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { syncSeasons } from "@/lib/season-store";

// The daily season sync. Vercel calls this once a day (the schedule is in
// vercel.json) and it saves the new games of every player someone marked
// "This is me", so their Season box stays complete without anyone opening
// the profile. The work is in syncSeasons (src/lib/season-store.ts).
//
// Vercel sends the CRON_SECRET environment variable as a bearer token, so
// nobody else can make the site spend its Riot calls by opening this URL.
// Without the variable set, every call is refused.

// Up to 60 Riot calls usually take a few seconds; this leaves room for the
// rate limiter to wait out a busy minute.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isFromVercel(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const players = await syncSeasons();
  // Nobody reads the answer, so the run is written to the function's logs
  // on Vercel, and a Riot error goes to Sentry too: a rejected key would
  // otherwise stop the season boxes filling in without anyone noticing.
  console.log("season sync", JSON.stringify(players));
  const failed = players.filter((p) => p.error !== null);
  if (failed.length > 0) {
    Sentry.captureMessage(`Season sync: ${failed.length} of ${players.length} players had Riot errors`, {
      level: "warning",
      extra: { players: failed },
    });
  }
  return Response.json({ players });
}

function isFromVercel(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  // timingSafeEqual takes as long whatever the header is, so the secret
  // can't be guessed one character at a time by timing the answers.
  return given.length === expected.length && timingSafeEqual(given, expected);
}
