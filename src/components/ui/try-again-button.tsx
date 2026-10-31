"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { mainButtonClass } from "./state-panel";

// Counts down from `seconds`, calling onTick with the seconds left once a
// second, until it reaches 0. Returns a function that stops it early.
export function countDown(seconds: number, onTick: (left: number) => void): () => void {
  let left = seconds;
  const timer = setInterval(() => {
    left -= 1;
    onTick(left);
    if (left <= 0) clearInterval(timer);
  }, 1_000);
  return () => clearInterval(timer);
}

// Asks the server for the page again. When Riot said how long to wait (a rate
// limit), the button counts the seconds down and only works once they're up,
// since trying sooner would just hit the limit again.
//
// onRetry replaces the refresh, for error pages that get Next.js's retry().
export function TryAgainButton({
  waitSeconds = 0,
  onRetry,
}: {
  waitSeconds?: number;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(waitSeconds);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (waitSeconds <= 0) return;
    return countDown(waitSeconds, setSecondsLeft);
  }, [waitSeconds]);

  function retry() {
    if (onRetry) onRetry();
    else startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={retry}
      disabled={secondsLeft > 0 || pending}
      className={mainButtonClass}
    >
      {secondsLeft > 0 ? `Try again in ${secondsLeft}s` : "Try again"}
    </button>
  );
}
