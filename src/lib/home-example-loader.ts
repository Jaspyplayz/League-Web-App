import "server-only";

import { cacheLife } from "next/cache";
import { championName, getDataDragon } from "@/lib/ddragon";
import { summarizeExample, type HomeExample } from "@/lib/home-example";
import { readSavedGame } from "@/lib/match-store";
import { SAMPLE_MATCH } from "@/lib/sample-match";

// Home's example game (src/app/page.tsx). The sample game never changes, so
// one read serves every visit for an hour instead of two database reads per
// visit. It throws rather than returning a worse result, because Next.js
// keeps only what a cached function returns: after a failure, the next visit
// tries again.
//
// That's why a Data Dragon failure throws too (JAS-148). Other pages fall
// back to Riot's raw champion IDs ("TwistedFate", "MonkeyKing") for one
// visit, but here the raw IDs would be kept and shown to everyone for up to
// an hour after Data Dragon came back.
export async function loadHomeExample(): Promise<HomeExample> {
  "use cache";
  cacheLife("hours");

  const [game, dd] = await Promise.all([readSavedGame(SAMPLE_MATCH.matchId), getDataDragon()]);
  const example =
    game && summarizeExample(game.match, game.timeline, SAMPLE_MATCH, (name) => championName(dd, name));
  if (!example) throw new Error("The example game couldn't be read from the database.");
  return example;
}
