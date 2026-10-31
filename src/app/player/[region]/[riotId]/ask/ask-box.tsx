"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { askAction } from "@/app/account/actions";
import { softPanelClass } from "@/components/ui/panel";
import { MAX_QUESTION_LENGTH } from "@/lib/ask-rules";
import type { AskedQuestion } from "@/lib/ask-store";

type Props = {
  region: string;
  riotId: string; // the slug from the address, "Name-TAG"
  playerPath: string;
  history: AskedQuestion[];
  historyFailed: boolean; // the past questions couldn't be read, so history is empty for now
  left: number; // questions this account can still ask today, 0 once any limit is reached
};

const EXAMPLES = [
  "What do my losses have in common?",
  "How do my early games go on my most played champion?",
  "When do I usually die, and how?",
];

// The question box and the answers under it. Runs in the browser to show
// "Thinking…" while Claude reads the games, which can take up to a minute.
export function AskBox({ region, riotId, playerPath, history, historyFailed, left }: Props) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState(history);
  const [remaining, setRemaining] = useState(left);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
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
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="ask-question" className="text-sm text-muted">
          Ask about this player&apos;s recent games. Only you see your questions.
        </label>
        <textarea
          id="ask-question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_QUESTION_LENGTH}
          rows={3}
          placeholder="e.g. Why do I lose games on Viego?"
          className="soft-round w-full resize-y border border-line-strong bg-page px-4 py-3 text-ink placeholder:text-placeholder focus:border-ahead"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
              className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:border-ahead hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending || text.trim() === "" || remaining <= 0}
            className="soft-round min-h-[52px] bg-ahead px-5 text-sm font-semibold text-page transition-colors hover:bg-ahead-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Thinking…" : "Ask"}
          </button>
          <p role="status" className="text-sm">
            {error ? (
              <span className="text-behind">{error}</span>
            ) : (
              isPending && (
                <span className="text-muted">Reading the games. This can take up to a minute.</span>
              )
            )}
          </p>
          <p className="ml-auto text-sm text-faint">
            {/* At 0 the limit may be the month's, not the day's; a reload says which. */}
            {remaining > 0
              ? `${remaining} ${remaining === 1 ? "question" : "questions"} left today`
              : "No questions left for now"}
          </p>
        </div>
      </form>

      {/* Where the past questions go, so it still shows under a new answer (#167). */}
      {historyFailed && (
        <p className="text-behind">Couldn&apos;t load your past questions. Reload to try again.</p>
      )}
      {answers.length > 0 && (
        <ol className="flex flex-col gap-4">
          {answers.map((item) => (
            <li key={item.id} className={`${softPanelClass} flex flex-col gap-3 p-6`}>
              <p className="font-semibold text-ink">{item.question}</p>
              <p className="whitespace-pre-line text-body">{item.answer}</p>
              {item.games.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-faint">Games read:</span>
                  {item.games.map((game) => (
                    <Link
                      key={game.matchId}
                      href={`${playerPath}/match/${game.matchId}`}
                      className="font-medium text-ahead-soft hover:underline"
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
      <p className="text-note text-faint">
        Answers are written by AI from the stats Turnpoint shows, and can be wrong.
      </p>
    </div>
  );
}
