"use server";

import { refresh } from "next/cache";
import { askEnabled } from "@/lib/ask";
import { cleanQuestion } from "@/lib/ask-rules";
import { ask, type AskOutcome } from "@/lib/ask-store";
import { getCurrentUser } from "@/lib/auth";
import { isDayKey, LOG_DAYS } from "@/lib/daily-log";
import { writeDayNote } from "@/lib/day-note-store";
import { cleanNote, MAX_NOTE_LENGTH, type SaveNoteResult } from "@/lib/match-note";
import { writeMatchNote } from "@/lib/match-note-store";
import { forgetMyPlayer, saveMyPlayer } from "@/lib/my-player";
import { recapsEnabled } from "@/lib/recap";
import { createRecap, type CreateRecapResult } from "@/lib/recap-store";
import { isMatchIdFor, isRegion } from "@/lib/regions";
import { getAccount } from "@/lib/riot/api";
import { RiotApiError } from "@/lib/riot/client";
import { fromSlug } from "@/lib/riot-id";

// The "This is me" button on a profile. The form says what the click means:
// "mark" makes this profile yours (replacing another), "clear" unmarks it.
// Reading what's marked here instead could guess wrong when that read fails
// (#167), and clearing only this profile means a stale page can't clear a
// different one. Anyone can call a Server Action with any form data, so the
// account always comes from the signed-in cookie, never from the form.
export async function toggleMyPlayer(formData: FormData) {
  const puuid = formData.get("puuid");
  const intent = formData.get("intent");
  const user = await getCurrentUser();
  if (!user || typeof puuid !== "string" || puuid === "") return;

  if (intent === "mark") {
    await saveMyPlayer(user.id, puuid);
  } else if (intent === "clear") {
    await forgetMyPlayer(user.id, puuid);
  } else {
    return;
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

// The Save button under a day in By day. Same checks as above, plus the day
// must be one By day could be showing (isNoteDay). The day is "2026-10-16"
// in the player's own timezone.
export async function saveDayNoteAction(day: string, note: string): Promise<SaveNoteResult> {
  if (!isDayKey(day) || !isNoteDay(day, Date.now())) {
    // A player only sees this once the day has dropped out of By day's
    // weeks: on a page left open for a day and a half or more, or with a
    // clock days off. Reloading won't bring the day back, so the message
    // doesn't suggest it. Their text stays in the box, so they can copy it.
    return {
      status: "failed",
      message: `Notes can only be saved on days in the last ${LOG_DAYS / 7} weeks.`,
    };
  }
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

const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-10-16" for the UTC day the time falls on.
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Whether a note can be saved on this day: one By day could be showing.
// Without this check, a script could save a note on every date from 0100 to
// 9999 and fill the database (JAS-212).
//
// By day shows the player's last LOG_DAYS days, in their browser's timezone,
// which the server doesn't know. Every timezone in use is between UTC-12 and
// UTC+14, so the player's today is the server's UTC yesterday, today or
// tomorrow. So By day can show UTC today minus LOG_DAYS through UTC tomorrow.
// A spare day on each side covers a page left open since yesterday, or a
// clock a day fast: UTC today minus LOG_DAYS + 1 through the day after
// tomorrow.
//
// It counts in UTC, not in the server's own timezone. A server set to UTC-12
// and a player at UTC+14 are 26 hours apart, so their dates can be two days
// apart.
function isNoteDay(day: string, now: number): boolean {
  // "2026-10-16" sorts as plain text, so the edges compare as strings.
  return day >= utcDay(now - (LOG_DAYS + 1) * DAY_MS) && day <= utcDay(now + 2 * DAY_MS);
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
