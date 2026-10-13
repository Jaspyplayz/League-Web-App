"use client"; // Error boundaries must be Client Components

// Shown if something on the player page throws an error we didn't plan for.
// Expected problems (player not found, rate limits) have their own messages,
// so reaching this page means a bug.
export default function PlayerError({ retry }: { error: Error; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        This page hit an unexpected error while loading.
      </p>
      <button
        type="button"
        onClick={retry}
        className="h-11 w-fit rounded-lg bg-foreground px-5 font-medium text-background hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
