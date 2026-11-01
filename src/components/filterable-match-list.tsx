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
    <div className="flex flex-col gap-3.5">
      {/* 280px wide on wider screens, the full width on phones. */}
      <div className="flex h-11 items-center gap-2 rounded-md bg-panel px-3 text-quiet focus-within:outline-2 focus-within:outline-main sm:h-10 sm:max-w-[280px]">
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
          className="h-full min-w-0 flex-1 bg-transparent text-body text-main outline-none placeholder:text-quiet"
        />
      </div>
      {shown.length > 0 ? (
        // `@container`: each row lays itself out by the list's width (match-row.tsx).
        <ul className="@container flex flex-col gap-2">{shown.map((g) => g.row)}</ul>
      ) : (
        <p className="text-body text-quiet">No games on &ldquo;{query}&rdquo; here.</p>
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
      className="shrink-0"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
