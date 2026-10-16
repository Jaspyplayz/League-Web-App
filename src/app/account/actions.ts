"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isDayKey } from "@/lib/daily-log";
import { writeDayNote } from "@/lib/day-note-store";
import { cleanNote, MAX_NOTE_LENGTH, type SaveNoteResult } from "@/lib/match-note";
import { writeMatchNote } from "@/lib/match-note-store";
import { forgetMyPlayer, readMyPlayer, saveMyPlayer } from "@/lib/my-player";
import { isMatchIdFor, isRegion } from "@/lib/regions";

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

// The Save button in the notes box on a match page. As above, the account
// comes from the cookie, so a note can only ever be saved to your own.
export async function saveMatchNoteAction(
  region: string,
  matchId: string,
  note: string,
): Promise<SaveNoteResult> {
  if (!isRegion(region) || typeof matchId !== "string" || !isMatchIdFor(region, matchId)) {
    return { status: "failed", message: "Couldn't save the note on this page." };
  }
  const cleaned = cleanNote(note);
  if (!cleaned.ok) {
    return { status: "failed", message: `Notes can be up to ${MAX_NOTE_LENGTH} characters.` };
  }
  const user = await getCurrentUser();
  if (!user) return { status: "failed", message: "You're signed out. Sign in again to save." };

  return (await writeMatchNote(user.id, matchId, cleaned.text))
    ? { status: "saved" }
    : { status: "failed", message: "Couldn't save the note. Try again in a moment." };
}

// The Save button under a day on the Log tab. Same checks as above; the day
// is "2026-10-16" in the player's own timezone.
export async function saveDayNoteAction(day: string, note: string): Promise<SaveNoteResult> {
  if (!isDayKey(day)) return { status: "failed", message: "Couldn't save the note for this day." };
  const cleaned = cleanNote(note);
  if (!cleaned.ok) {
    return { status: "failed", message: `Notes can be up to ${MAX_NOTE_LENGTH} characters.` };
  }
  const user = await getCurrentUser();
  if (!user) return { status: "failed", message: "You're signed out. Sign in again to save." };

  return (await writeDayNote(user.id, day, cleaned.text))
    ? { status: "saved" }
    : { status: "failed", message: "Couldn't save the note. Try again in a moment." };
}
