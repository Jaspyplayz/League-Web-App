"use client";

import { useState, type ReactNode } from "react";
import { panelClass } from "@/components/ui/panel";
import { EmptyPanel, secondButtonClass } from "@/components/ui/state-panel";
import { matchesChampion } from "@/lib/champion-search";

// The Champions tab's panel: the season line and "Search a champion" on top,
// the table under them. The table's pieces are rendered on the server
// (champion-table.tsx) and passed in; this only remembers what was typed and
// leaves out the champions whose name doesn't match. It searches the
// champions already on the page, so typing costs no Riot calls.

type Champion = {
  name: string; // as players spell it ("Wukong", not "MonkeyKing")
  group: ReactNode; // the champion's <ChampionRowGroup>, with its own key
};

export function ChampionSearch({
  heading,
  head,
  champions,
}: {
  heading: ReactNode;
  head: ReactNode; // the table's <thead> and the "All champions" row
  champions: Champion[];
}) {
  const [query, setQuery] = useState("");

  return (
    <section
      aria-label="Champions this season"
      className={`${panelClass} flex flex-col gap-3 pt-4 pb-2`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3 px-4">
        {heading}
        <label className="flex h-10 items-center gap-2 rounded-md bg-raised px-3 text-quiet focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-ahead/45 max-sm:h-11 max-sm:w-full sm:w-64">
          <SearchIcon />
          <span className="sr-only">Search a champion</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a champion"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-main outline-none placeholder:text-quiet focus-visible:outline-none"
          />
        </label>
      </div>
      <ChampionRows head={head} champions={champions} query={query} onClear={() => setQuery("")} />
    </section>
  );
}

// The table with only the champions matching `query`, or the empty panel
// when none do. Kept apart from the search box so a test can render it with
// a query already typed.
export function ChampionRows({
  head,
  champions,
  query,
  onClear,
}: {
  head: ReactNode;
  champions: Champion[];
  query: string;
  onClear: () => void;
}) {
  const shown = champions.filter((c) => matchesChampion(c.name, query));

  if (shown.length === 0) {
    return (
      <EmptyPanel
        title={`No champion matches “${query.trim()}”`}
        action={
          <button type="button" onClick={onClear} className={secondButtonClass}>
            Clear search
          </button>
        }
      >
        The search looks through the {champions.length}{" "}
        {champions.length === 1 ? "champion" : "champions"} played in these games.
      </EmptyPanel>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-body tabular-nums">
        {head}
        {shown.map((c) => c.group)}
      </table>
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
