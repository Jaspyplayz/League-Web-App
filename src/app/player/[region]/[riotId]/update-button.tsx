"use client";

import { useEffect, useState, useTransition } from "react";
import { mainButtonClass } from "@/components/ui/state-panel";
import type { UpdateResult } from "@/lib/profile-store";
import { updateProfileAction } from "./actions";

type Props = {
  region: string;
  puuid: string;
  // Seconds left on the cooldown when the page was rendered; 0 if none.
  secondsUntilReady: number;
};

// The op.gg-style "Update" button: asks the server for a new profile
// snapshot, then the page re-renders with it. Runs in the browser because it
// reacts to clicks. The page gives it a `key` that changes with each new
// snapshot, so React starts it fresh (with a new cooldown) after an update.
// "Updated 6h ago" sits in the line above the buttons (profile-header.tsx).
export function UpdateButton({ region, puuid, secondsUntilReady }: Props) {
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
    // `contents` lets the button and its message join the row of buttons
    // around them, and `order-last` puts the message at the end of that row,
    // beside the buttons rather than between Update and This is me.
    <div className="contents">
      <button
        type="button"
        onClick={update}
        disabled={isPending || coolingDown}
        title={coolingDown ? "You can update again a couple of minutes after the last update" : undefined}
        className={`${mainButtonClass} gap-2 sm:h-10`}
      >
        <RefreshIcon />
        {isPending ? "Updating…" : "Update"}
      </button>
      {message && (
        // Neutral text: a failed update is a hiccup, and red means the opponent.
        <p role="status" className="order-last max-w-80 text-note text-quiet">
          {message}
        </p>
      )}
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
    </svg>
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
