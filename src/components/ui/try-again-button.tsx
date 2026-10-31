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
  const [pending, startTransition] = useTransition();
  // Bumped with each refresh. A refresh keeps this button's state, so if Riot
  // is still rate limiting, a new key makes the countdown start over from the
  // new wait instead of leaving the button pressable at 0.
  const [attempt, setAttempt] = useState(0);

  function retry() {
    if (onRetry) return onRetry();
    startTransition(() => {
      router.refresh();
      setAttempt((n) => n + 1);
    });
  }

  return (
    <CountdownButton key={attempt} waitSeconds={waitSeconds} disabled={pending} onClick={retry} />
  );
}

function CountdownButton({
  waitSeconds,
  disabled,
  onClick,
}: {
  waitSeconds: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(waitSeconds);

  useEffect(() => {
    if (waitSeconds <= 0) return;
    return countDown(waitSeconds, setSecondsLeft);
  }, [waitSeconds]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={secondsLeft > 0 || disabled}
      // The button sits in the problem panel, which is a live region. Without
      // this a screen reader could read every tick ("28s", "27s"...).
      aria-live="off"
      className={mainButtonClass}
    >
      {secondsLeft > 0 ? `Try again in ${secondsLeft}s` : "Try again"}
    </button>
  );
}
