import * as Sentry from "@sentry/nextjs";
import { getCurrentUser } from "@/lib/auth";
import { readMyPlayer } from "@/lib/my-player";
import { savedSoloRanks } from "@/lib/profile-store";
import { parseRiotId } from "@/lib/riot-id";
import {
  MAX_PINNED_PLAYERS,
  MAX_RECENT_PLAYERS,
  parseSavedPlayers,
  type SavedPlayer,
  type SavedPlayerDetails,
} from "@/lib/saved-players";

// Well over what 15 of the longest Riot IDs take up as JSON.
const MAX_BODY_CHARACTERS = 4000;

// What the box under the search shows from the database: each saved player's
// solo queue rank, and the signed-in player's own row. The browser keeps the
// lists, so it sends them here, as a POST to keep Riot IDs out of the address.
// This is a route and not a Server Action because Next.js runs a browser's
// actions one at a time, so reading ranks with one would hold up the search
// form. It never calls Riot and stores nothing.
export async function POST(request: Request) {
  // Anyone can call this, so the body is treated like any stored list: bad
  // entries are dropped, and no more rows are read than a browser can save.
  const body = await request.text();
  if (body.length > MAX_BODY_CHARACTERS) return new Response(null, { status: 413 });
  const list = parseSavedPlayers(body, MAX_RECENT_PLAYERS + MAX_PINNED_PLAYERS).filter(
    (p) => parseRiotId(`${p.gameName}#${p.tagLine}`) !== null,
  );

  const you = await signedInPlayer();
  const ranks = await savedSoloRanks(you ? [you, ...list] : list);
  // Not an empty answer: that would tell the box nobody here has a rank.
  if (!ranks) return new Response(null, { status: 503 });
  return Response.json({ ranks, you } satisfies SavedPlayerDetails);
}

// The player this account marked with "This is me". A failed read just leaves
// the row out: the rest of the box still works.
async function signedInPlayer(): Promise<SavedPlayer | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    const mine = await readMyPlayer(user.id);
    if (!mine.ok || !mine.player) return null;
    const { region, gameName, tagLine } = mine.player;
    return { region, gameName, tagLine };
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}
