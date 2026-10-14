"use client";

import { useState, type ReactNode } from "react";
import { matchesChampion } from "@/lib/champion-search";

// The profile's match list with a champion search box above it, like op.gg's
// "Search a champion". The rows are still rendered on the server and passed
// in as ready-made pieces (`row`); this component only remembers what was
// typed and hides the rows whose champion doesn't match. It searches the
// games already on the page, so typing costs no Riot calls.
export function FilterableMatchList({
  games,
}: {
  // `row` is a <MatchRow> with its own key.
  games: { champion: string; row: ReactNode }[];
}) {
  const [query, setQuery] = useState("");
  const shown = games.filter((g) => matchesChampion(g.champion, query));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 self-start rounded-lg border border-line-strong bg-surface px-3 focus-within:border-ahead">
        <SearchIcon />
        <label htmlFor="champion-search" className="sr-only">
          Search a champion
        </label>
        <input
          id="champion-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a champion"
          autoComplete="off"
          className="min-h-10 w-48 bg-transparent text-sm text-ink outline-none placeholder:text-placeholder focus-visible:outline-none"
        />
      </div>
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-2">{shown.map((g) => g.row)}</ul>
      ) : (
        <p className="text-zinc-600 dark:text-zinc-400">No games on &ldquo;{query}&rdquo; here.</p>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className="text-faint"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
