"use client";

import { useActionState } from "react";
import { searchPlayer } from "@/app/actions";
import { REGIONS } from "@/lib/regions";

export function SearchForm() {
  const [state, action, pending] = useActionState(searchPlayer, { error: null });

  return (
    <form action={action} className="flex w-full max-w-xl flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="region">
          Region
        </label>
        <select
          id="region"
          name="region"
          defaultValue="na"
          className="h-12 rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {Object.entries(REGIONS).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="riotId">
          Riot ID
        </label>
        <input
          id="riotId"
          name="riotId"
          required
          placeholder="GameName#TAG"
          autoComplete="off"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "search-error" : undefined}
          className="h-12 flex-1 rounded-lg border border-zinc-300 bg-white px-4 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-lg bg-foreground px-6 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </div>
      {state.error && (
        <p id="search-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
