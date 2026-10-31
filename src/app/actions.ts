"use server";

import { redirect } from "next/navigation";
import { isRegion } from "@/lib/regions";
import { parseRiotId, toSlug } from "@/lib/riot-id";

export type SearchState = { error: string | null };

export async function searchPlayer(
  _prev: SearchState,
  formData: FormData,
): Promise<SearchState> {
  const region = String(formData.get("region") ?? "");
  const typed = String(formData.get("riotId") ?? "");
  const riotId = parseRiotId(typed);

  if (!isRegion(region)) return { error: "Pick a region." };
  if (!riotId) {
    // A missing tag is the common slip, so say where to find it (JAS-93).
    // A tag that's there but too short, or a two-letter name, gets the shape.
    if (!typed.includes("#")) {
      return { error: "Add the tag after a #, like Faker#KR1. It's on the player's Riot profile." };
    }
    return { error: "Enter a Riot ID like Faker#KR1." };
  }

  redirect(`/player/${region}/${toSlug(riotId)}`);
}
