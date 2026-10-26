"use client";

import { useState, useTransition } from "react";
import { saveMatchNoteAction } from "@/app/account/actions";
import { MAX_NOTE_LENGTH, withNoteLine, type SaveNoteResult } from "@/lib/match-note";
import { useReviewLinks } from "./review-links";

type Props = { region: string; matchId: string; savedText: string };

// The text box and Save button. Runs in the browser to show "Saving…",
// "Saved" and the character count as you type.
export function NotesForm({ region, matchId, savedText }: Props) {
  const [text, setText] = useState(savedText);
  // The last text the server accepted, to tell whether there's anything new.
  const [saved, setSaved] = useState(savedText);
  const [result, setResult] = useState<SaveNoteResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const unchanged = text.trim() === saved.trim();

  // "Add to notes" in the 60-second review adds a line to the box. Checking
  // against the last request seen while drawing, rather than in an effect,
  // is React's way to react to a changed prop or context.
  const noteRequest = useReviewLinks()?.noteRequest ?? null;
  const [seenRequest, setSeenRequest] = useState(noteRequest);
  if (noteRequest !== seenRequest) {
    setSeenRequest(noteRequest);
    if (noteRequest) setText((current) => withNoteLine(current, noteRequest.line));
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const sent = text;
    startTransition(async () => {
      try {
        const next = await saveMatchNoteAction(region, matchId, sent);
        if (next.status === "saved") setSaved(sent);
        setResult(next);
      } catch {
        // Usually a new version of the site went live since this page loaded.
        setResult({ status: "failed", message: "Couldn't save. Reload the page and try again." });
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label htmlFor="match-note" className="text-sm text-muted">
        Only you can see these.
      </label>
      <textarea
        id="match-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_NOTE_LENGTH}
        rows={4}
        placeholder="What would you do differently? e.g. ward river before 3:15, back on the cannon wave"
        className="soft-round w-full resize-y border border-line-strong bg-page px-4 py-3 text-ink placeholder:text-placeholder focus:border-ahead"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending || unchanged}
          className="soft-round-sm min-h-10 bg-ahead px-5 text-sm font-semibold text-page transition-colors hover:bg-ahead-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save note"}
        </button>
        <p role="status" className="text-sm">
          {result?.status === "failed" ? (
            <span className="text-behind">{result.message}</span>
          ) : (
            result?.status === "saved" && unchanged && <span className="text-muted">Saved</span>
          )}
        </p>
        <p className="ml-auto font-mono text-xs text-faint">
          {text.length} / {MAX_NOTE_LENGTH}
        </p>
      </div>
    </form>
  );
}
