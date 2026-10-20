"use server";

import { refresh } from "next/cache";
import { askEnabled } from "@/lib/ask";
import { cleanQuestion } from "@/lib/ask-rules";
import { ask, type AskOutcome } from "@/lib/ask-store";
import { getCurrentUser } from "@/lib/auth";
import { isDayKey } from "@/lib/daily-log";
import { writeDayNote } from "@/lib/day-note-store";
import { cleanNote, MAX_NOTE_LENGTH, type SaveNoteResult } from "@/lib/match-note";
import { writeMatchNote } from "@/lib/match-note-store";
import { forgetMyPlayer, readMyPlayer, saveMyPlayer } from "@/lib/my-player";
import { recapsEnabled } from "@/lib/recap";
import { createRecap, type CreateRecapResult } from "@/lib/recap-store";
import { isMatchIdFor, isRegion } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { RiotApiError } from "@/lib/riot/client";
import { fromSlug } from "@/lib/riot-id";

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

// The "Write recap" button on a match page. Signed-in accounts only, so the
// per-account daily cap in createRecap() can't be dodged by signing out.
export async function writeRecapAction(
  region: string,
  matchId: string,
  puuid: string,
): Promise<CreateRecapResult> {
  if (
    !isRegion(region) ||
    typeof matchId !== "string" ||
    !isMatchIdFor(region, matchId) ||
    typeof puuid !== "string"
  ) {
    return { status: "failed", message: "Couldn't write a recap on this page." };
  }
  if (!recapsEnabled()) return { status: "failed", message: "Recaps aren't available right now." };
  const user = await getCurrentUser();
  if (!user) return { status: "failed", message: "You're signed out. Sign in again to write one." };
  return createRecap(region, matchId, puuid, user.id);
}

// The Ask button on a player's Ask tab. Signed-in accounts only, so the
// per-account daily cap in ask() can't be dodged by signing out. The player
// comes from the page's address ("Name-TAG"), looked up again here.
export async function askAction(
  region: string,
  riotId: string,
  question: string,
): Promise<AskOutcome> {
  const id = typeof riotId === "string" ? fromSlug(riotId) : null;
  if (!isRegion(region) || !id) return { status: "failed", message: "Couldn't ask on this page." };
  const cleaned = cleanQuestion(typeof question === "string" ? question : "");
  if (!cleaned.ok) return { status: "failed", message: cleaned.message };
  if (!askEnabled()) return { status: "failed", message: "Ask isn't available right now." };
  const user = await getCurrentUser();
  if (!user) return { status: "failed", message: "You're signed out. Sign in again to ask." };

  try {
    const account = await getAccount(region, id);
    if (!account) return { status: "failed", message: "Couldn't find this player." };
    return await ask(region, account, cleaned.text, user.id);
  } catch (error) {
    if (error instanceof RiotApiError) {
      return { status: "failed", message: "Riot isn't answering right now. Try again in a moment." };
    }
    throw error;
  }
}
