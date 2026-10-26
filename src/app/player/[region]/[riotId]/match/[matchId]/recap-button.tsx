"use client";

import { useState, useTransition } from "react";
import { writeRecapAction } from "@/app/account/actions";
import type { Recap } from "@/lib/recap";
import { RecapText } from "./recap-text";

type Props = { region: string; matchId: string; puuid: string };

// The "Write recap" button. Runs in the browser to show "Writing…" while
// Claude works (a few seconds), then the recap in place of the button.
export function RecapButton({ region, matchId, puuid }: Props) {
  const [recap, setRecap] = useState<Recap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function write() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await writeRecapAction(region, matchId, puuid);
        if (result.status === "written") setRecap(result.recap);
        else setError(result.message);
      } catch {
        // Usually a new version of the site went live since this page loaded.
        setError("Couldn't write the recap. Reload the page and try again.");
      }
    });
  }

  if (recap) return <RecapText headline={recap.headline} detail={recap.detail} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">
        Get a few short points on what decided this game, written by AI from the stats on this page.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={write}
          disabled={isPending}
          className="soft-round-sm min-h-10 bg-ahead px-5 text-sm font-semibold text-page transition-colors hover:bg-ahead-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Writing…" : "Write recap"}
        </button>
        <p role="status" className="text-sm text-behind">
          {error}
        </p>
      </div>
    </div>
  );
}
