"use client";

import { useEffect, useState, useTransition } from "react";
import type { UpdateResult } from "@/lib/profile-store";
import { updateProfileAction } from "./actions";

type Props = {
  region: string;
  puuid: string;
  // "Updated 5m ago", worked out on the server when the page was rendered.
  updatedLabel: string;
  // Seconds left on the cooldown when the page was rendered; 0 if none.
  secondsUntilReady: number;
};

// The op.gg-style "Update" button: asks the server for a new profile
// snapshot, then the page re-renders with it. Runs in the browser because it
// reacts to clicks. The page gives it a `key` that changes with each new
// snapshot, so React starts it fresh (with a new cooldown) after an update.
export function UpdateButton({ region, puuid, updatedLabel, secondsUntilReady }: Props) {
  const [coolingDown, setCoolingDown] = useState(secondsUntilReady > 0);
  const [message, setMessage] = useState<string | null>(null);
  // isPending is true while the update runs, including the page re-render.
  const [isPending, startTransition] = useTransition();

  // Turn the button back on when the cooldown ends.
  useEffect(() => {
    if (secondsUntilReady <= 0) return;
    const timer = setTimeout(() => setCoolingDown(false), secondsUntilReady * 1000);
    return () => clearTimeout(timer);
  }, [secondsUntilReady]);

  function update() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await updateProfileAction(region, puuid);
        setMessage(messageFor(result));
      } catch {
        // Usually a new version of the site went live since this page loaded.
        setMessage("Couldn't update. Reload the page and try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={update}
        disabled={isPending || coolingDown}
        title={coolingDown ? "You can update again a couple of minutes after the last update" : undefined}
        className="soft-round-sm min-h-10 bg-ahead px-5 font-mono text-xs font-semibold tracking-[0.12em] text-page uppercase transition-colors hover:bg-ahead-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Updating…" : "Update"}
      </button>
      <p className="font-mono text-xs text-faint">Updated {updatedLabel}</p>
      {message && (
        <p role="status" className="max-w-64 text-sm text-behind sm:text-right">
          {message}
        </p>
      )}
    </div>
  );
}

// Nothing to say when it worked: the page now shows the new data.
function messageFor(result: UpdateResult): string | null {
  switch (result.status) {
    case "updated":
      return null;
    case "cooldown":
      return `Updated moments ago. Try again in ${result.secondsLeft} seconds.`;
    case "failed":
      return result.kind === "rate-limited"
        ? "Riot's request limit is used up for now. Try again in a minute."
        : "Riot didn't answer, so the profile wasn't updated. Try again soon.";
  }
}
