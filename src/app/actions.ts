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
  const riotId = parseRiotId(String(formData.get("riotId") ?? ""));

  if (!isRegion(region)) return { error: "Pick a region." };
  if (!riotId) return { error: "Add the tag after a #, like Faker#KR1. It's on the player's Riot profile." };

  redirect(`/player/${region}/${toSlug(riotId)}`);
}
