"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { askAction } from "@/app/account/actions";
import { LoadingBlock, StatusLine } from "@/components/ui/loading";
import { linkClass, mainButtonClass } from "@/components/ui/state-panel";
import { MAX_QUESTION_LENGTH, type Allowance } from "@/lib/ask-rules";
import type { AskedQuestion } from "@/lib/ask-store";
import { AskNote } from "./ask-note";

type Props = {
  region: string;
  riotId: string; // the slug from the address, "Name-TAG"
  playerPath: string;
  history: AskedQuestion[];
  historyFailed: boolean; // the past questions couldn't be read, so history is empty for now
  // From allowance() in src/lib/ask-rules.ts: how many questions are left
  // today, or why none are (the account's day, its month or the site's
  // month), which shows in place of the question box.
  allowance: Allowance;
  examples?: string[]; // buttons that fill in a question; the match page names its game in them
};

const DEFAULT_EXAMPLES = [
  "What do my losses have in common?",
  "How do my early games go on my most played champion?",
  "When do I usually die, and how?",
];

const WAITING = "Reading the games. This can take up to a minute.";

// The question box and the answers under it. Runs in the browser to show
// that Claude is reading the games while it does, which can take up to a
// minute: a grey answer where the answer will go, and a line saying so.
export function AskBox({
  region,
  riotId,
  playerPath,
  history,
  historyFailed,
  allowance,
  examples = DEFAULT_EXAMPLES,
}: Props) {
  const [text, setText] = useState("");
  // The question being answered, shown above its grey answer while Claude
  // reads the games.
  const [asking, setAsking] = useState("");
  const [answers, setAnswers] = useState(history);
  const [remaining, setRemaining] = useState(allowance.ok ? allowance.left : 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setAsking(text.trim());
    startTransition(async () => {
      try {
        const result = await askAction(region, riotId, text);
        if (result.status === "answered") {
          setAnswers((list) => [result.question, ...list]);
          setRemaining(result.left);
          setText("");
        } else {
          // A question Claude couldn't answer can still count.
          if (result.left !== undefined) setRemaining(result.left);
          setError(result.message);
        }
      } catch {
        // Usually a new version of the site went live since this page loaded.
        setError("Couldn't ask. Reload the page and try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {!allowance.ok ? (
        <AskNote title={allowance.message} />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="ask-question" className="text-sm text-quiet">
            Your question about this player&apos;s games. Only you see your questions.
          </label>
          <textarea
            id="ask-question"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_QUESTION_LENGTH}
            rows={3}
            placeholder="e.g. Why do I lose games on Viego?"
            className="w-full resize-y rounded-md border border-transparent bg-raised px-4 py-3 text-main placeholder:text-placeholder focus:border-ahead"
          />
          <div className="flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setText(example)}
                className="min-h-9 rounded-md bg-raised px-3 py-1.5 text-left text-sm text-main hover:bg-divider"
              >
                {example}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPending || text.trim() === "" || remaining <= 0}
              className={mainButtonClass}
            >
              {isPending ? "Thinking…" : "Ask"}
            </button>
            <p className="ml-auto text-sm tabular-nums text-quiet">
              {/* At 0 the limit may be the month's, not the day's; a reload says which. */}
              {remaining > 0
                ? `${remaining} ${remaining === 1 ? "question" : "questions"} left today`
                : "No questions left for now"}
            </p>
          </div>
        </form>
      )}

      <AskStatus error={error} asking={isPending ? asking : null} />

      {/* Where the past questions go, so it still shows under a new answer (#167). */}
      {historyFailed && (
        <AskNote title="Couldn't load your past questions." problem>
          Reload to try again.
        </AskNote>
      )}
      {answers.length > 0 && (
        <ol className="flex flex-col gap-4">
          {answers.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 rounded-md bg-raised p-5">
              <p className="font-semibold text-main">{item.question}</p>
              <p className="whitespace-pre-line text-body">{item.answer}</p>
              {item.games.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-quiet">Games read:</span>
                  {item.games.map((game) => (
                    <Link
                      key={game.matchId}
                      href={`${playerPath}/match/${game.matchId}`}
                      className={`font-medium ${linkClass}`}
                    >
                      {game.label}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-note text-quiet">
        Answers are written by AI from the stats Turnpoint shows, and can be wrong.
      </p>
    </div>
  );
}

// What's happening with the question just sent: Claude reading the games, or
// why it wasn't answered. Exported for its test, since the waiting and failed
// states only appear after pressing Ask.
export function AskStatus({
  error,
  asking,
}: {
  error: string | null;
  // The question being answered, or null when none is.
  asking: string | null;
}) {
  return (
    <>
      {/* Screen readers hear the waiting line, or why a question wasn't
          answered, from this line, which is always there so they notice it
          change. The waiting line on screen below is hidden from them, so
          it isn't read twice; the note stays, so it can be found again. */}
      <p role="status" className="sr-only">
        {error ?? (asking !== null ? WAITING : "")}
      </p>
      {/* A question that couldn't be answered. The messages say what
          happened and what to do, like "Couldn't answer right now. Try again
          in a moment." The question stays in the box to send again. */}
      {error && <AskNote title={error} problem />}
      {/* While Claude reads the games: the question, then a grey answer
          where its answer will go. */}
      {asking !== null && (
        <div className="flex flex-col gap-3 rounded-md bg-raised p-5">
          <p className="font-semibold text-main">{asking}</p>
          <div aria-hidden="true">
            <StatusLine label={WAITING} slow={false} />
          </div>
          <div aria-hidden="true" className="flex flex-col gap-2 motion-safe:animate-pulse">
            <LoadingBlock className="h-3.5 w-full" />
            <LoadingBlock className="h-3.5 w-11/12" />
            <LoadingBlock className="h-3.5 w-3/5" />
          </div>
        </div>
      )}
    </>
  );
}
