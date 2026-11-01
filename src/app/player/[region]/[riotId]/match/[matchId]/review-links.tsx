"use client";

import { createContext, useContext } from "react";

// How Game review reaches the rest of the match page: "Watch in replay" and
// "Start review in the replay" move the replay (on the Replay tab) to a play,
// and "Add to notes" puts a line in your notes box. The tabs hold this
// (analysis-tabs.tsx) since they decide which tab shows, and the replay and
// notes box read it.
//
// Each request is a new object, so pressing the same button twice still
// counts as a new request.
export type ReplayRequest = { ms: number };
export type NoteRequest = { line: string };

export type ReviewLinks = {
  replayRequest: ReplayRequest | null;
  noteRequest: NoteRequest | null;
  watch: (ms: number) => void;
  addNote: (line: string) => void;
};

export const ReviewLinksContext = createContext<ReviewLinks | null>(null);

// Null outside the tabs, like the notes box on a game too short to analyze.
export function useReviewLinks(): ReviewLinks | null {
  return useContext(ReviewLinksContext);
}
