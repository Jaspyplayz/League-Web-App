"use client"; // Error boundaries must be Client Components

import { UnexpectedError } from "@/components/unexpected-error";

// Shown when any page under the root layout throws an error we didn't plan
// for. The header stays, so the visitor can search or go home from there too.
export default function PageError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <UnexpectedError {...props} />;
}
