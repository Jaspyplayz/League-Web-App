"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { secondButtonClass } from "./ui/state-panel";
import { TryAgainButton } from "./ui/try-again-button";

// What a page shows when it throws an error nobody planned for, under the
// site's header. Expected problems (a player who isn't found, Riot being slow)
// have their own panels, so reaching this means a bug. Used by the error.tsx
// files, which Next.js renders in place of the page that failed.
export function UnexpectedError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // Errors caught here never reach the browser's console handler, so they're
  // sent to Sentry by hand. That's what makes "It's been reported" true.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:py-12">
      <div className="flex max-w-[640px] flex-col gap-3.5">
        <h1 className="text-2xl font-semibold sm:text-[28px]">Something went wrong</h1>
        <p className="text-body text-quiet">
          This page hit an error we didn&apos;t expect. It&apos;s been reported.
        </p>
        <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
          <TryAgainButton onRetry={retry} />
          <Link href="/" className={secondButtonClass}>
            Back to the home page
          </Link>
        </div>
      </div>
    </main>
  );
}
