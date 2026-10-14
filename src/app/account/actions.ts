"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { forgetMyPlayer, readMyPlayer, saveMyPlayer } from "@/lib/my-player";

// The "This is me" button on a profile. Clicking it on your own profile
// marks it; clicking it again (or on someone else's) changes or clears that.
// Anyone can call a Server Action with any form data, so the account always
// comes from the signed-in cookie, never from the form.
export async function toggleMyPlayer(formData: FormData) {
  const puuid = formData.get("puuid");
  const user = await getCurrentUser();
  if (!user || typeof puuid !== "string" || puuid === "") return;

  const current = await readMyPlayer(user.id);
  if (current?.puuid === puuid) {
    await forgetMyPlayer(user.id);
  } else {
    await saveMyPlayer(user.id, puuid);
  }
  // Re-render the page, so the button and the header's My profile link
  // show the change.
  refresh();
}
