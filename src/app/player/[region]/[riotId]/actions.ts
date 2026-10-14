"use server";

import { refresh } from "next/cache";
import { updateProfile, type UpdateResult } from "@/lib/profile-store";
import { isRegion } from "@/lib/regions";

// Server Actions are functions the browser can call on the server, here
// from the Update button. Anyone can call one with any arguments, so they're
// checked before use; updateProfile also only refreshes players Turnpoint
// has already saved, and applies the cooldown.
export async function updateProfileAction(region: string, puuid: string): Promise<UpdateResult> {
  if (!isRegion(region) || typeof puuid !== "string") {
    return { status: "failed", kind: "not-found" };
  }

  const result = await updateProfile(region, puuid);
  // Re-render the page the button is on, so it shows the new snapshot.
  if (result.status === "updated") refresh();
  return result;
}
