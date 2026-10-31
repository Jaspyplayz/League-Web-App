"use client";

import * as Sentry from "@sentry/nextjs";
import { Rubik } from "next/font/google";
import { useEffect } from "react";
import { TryAgainButton } from "@/components/ui/try-again-button";
import { applyTheme, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Global error pages don't get the root layout, so this one loads the site's
// colours (globals.css above) and its font itself.
const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin"] });

// Last-resort error screen: Next.js shows this when an error escapes every
// other boundary, including the root layout. It replaces the whole page, so it
// renders its own <html> and <body>, and with no header it draws its own logo.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // The root layout's theme script doesn't run here. When the server draws
  // this page, the copy in <head> picks light or dark before paint; when the
  // browser draws it after a crash, that script never runs, so this does.
  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${rubik.variable} h-full antialiased`}
    >
      <head>
        <title>Something went wrong · Turnpoint</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-3.5 px-4 py-8 sm:py-12">
          {/* A plain link, not next/link: the app around this page has crashed,
              so going home should load the site fresh. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="flex w-fit items-center gap-2.5 text-lg font-semibold">
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-md bg-main text-base font-bold text-page"
            >
              T
            </span>
            Turnpoint
          </a>
          <h1 className="mt-3.5 text-2xl font-semibold sm:text-[28px]">Something went wrong</h1>
          <p className="text-body text-quiet">
            The site hit an error we didn&apos;t expect. It&apos;s been reported.
          </p>
          <div className="mt-2">
            <TryAgainButton onRetry={retry} />
          </div>
        </main>
      </body>
    </html>
  );
}
