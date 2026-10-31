"use client"; // Error boundaries must be Client Components

import { UnexpectedError } from "@/components/unexpected-error";

// Shown if something on the player page throws an error we didn't plan for.
// Expected problems (player not found, rate limits) have their own messages,
// so reaching this page means a bug.
export default function PlayerError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <UnexpectedError {...props} />;
}
