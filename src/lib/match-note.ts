// Pure helpers for the private notes a signed-in player keeps on a match.
// The database side is in match-note-store.ts; the box is on the match page.

// About a page of text. Plenty for "what I'd do differently", and it keeps
// one account from filling the free database tier.
export const MAX_NOTE_LENGTH = 2000;

export type CleanedNote = { ok: true; text: string } | { ok: false };

// Checks a note before saving. Anyone can call the save action with
// anything, so this doesn't trust the textarea's maxLength. Browsers send
// line breaks as "\r\n", which would count twice, so those become "\n"
// first. An empty note is valid: saving one deletes the note.
export function cleanNote(value: unknown): CleanedNote {
  if (typeof value !== "string") return { ok: false };
  const text = value.replace(/\r\n?/g, "\n").trim();
  return text.length <= MAX_NOTE_LENGTH ? { ok: true, text } : { ok: false };
}

// What the save action tells the notes box.
export type SaveNoteResult = { status: "saved" } | { status: "failed"; message: string };
