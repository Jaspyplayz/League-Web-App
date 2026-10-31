"use client";

import { useActionState, useState } from "react";
import { searchPlayer } from "@/app/actions";
import { isRegion, REGIONS } from "@/lib/regions";
import { parseRiotId } from "@/lib/riot-id";
import { ArrowRightIcon } from "./icons";
import { noteSearch, SavedPlayersMenu } from "./saved-players";

// What both player searches share, the big one on home and the small one in
// the header: sending the form, the error it can come back with, and the
// saved players menu that drops down under it. The menu shows from clicking
// into the form until you click or tab out of it, press Escape, or pick a
// player. `errorId` ties the Riot ID box to the error for screen readers.
export function usePlayerSearch(errorId: string) {
  const [state, action, pending] = useActionState(searchPlayer, { error: null });
  // What's typed in the Riot ID box, to narrow the saved players menu.
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // Runs in the browser just before the form is sent, so the profile page can
  // tell this player came from a search and add them to Recent.
  function rememberSearch(event: React.FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const region = String(form.get("region") ?? "");
    const riotId = parseRiotId(String(form.get("riotId") ?? ""));
    if (isRegion(region) && riotId) noteSearch({ region, ...riotId });
  }

  const formProps = {
    action,
    onSubmit: rememberSearch,
    role: "search",
    onFocus: () => setMenuOpen(true),
    onBlur: (event: React.FocusEvent<HTMLFormElement>) => {
      // Focus moving between fields of this form keeps the menu open.
      if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLFormElement>) => {
      if (event.key === "Escape") setMenuOpen(false);
    },
  };

  const riotIdProps = {
    name: "riotId",
    required: true,
    autoComplete: "off",
    value: query,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      setMenuOpen(true);
    },
    onClick: () => setMenuOpen(true),
    "aria-invalid": state.error ? true : undefined,
    "aria-describedby": state.error ? errorId : undefined,
  };

  const menu = menuOpen && !pending && (
    <SavedPlayersMenu query={query} onPick={() => setMenuOpen(false)} />
  );

  return { error: state.error, pending, formProps, riotIdProps, menu };
}

// The region choices, shown by their short codes ("NA") with the full name on
// hover.
export function RegionOptions() {
  return Object.entries(REGIONS).map(([key, { label }]) => (
    <option key={key} value={key} title={label}>
      {key.toUpperCase()}
    </option>
  ));
}

const fieldLabel = "text-note font-medium text-quiet";

// The big search on the home page (and the not-found page).
export function SearchForm() {
  const { error, pending, formProps, riotIdProps, menu } = usePlayerSearch("search-error");

  return (
    <form
      {...formProps}
      aria-label="Player lookup"
      className="relative flex max-w-[600px] flex-col gap-2"
    >
      <div className="flex flex-wrap gap-2 rounded-md border border-transparent bg-panel p-2 focus-within:border-ahead">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col px-3 py-1.5 max-sm:basis-full">
          <label htmlFor="riotId" className={fieldLabel}>
            Riot ID
          </label>
          <input
            id="riotId"
            placeholder="GameName#TAG"
            {...riotIdProps}
            className="min-w-0 bg-transparent py-0.5 text-lg text-main outline-none placeholder:text-placeholder focus-visible:outline-none"
          />
        </div>
        <div className="flex flex-col border-divider px-3 py-1.5 max-sm:basis-full max-sm:border-t sm:border-l">
          <label htmlFor="region" className={fieldLabel}>
            Region
          </label>
          <select
            id="region"
            name="region"
            defaultValue="na"
            className="bg-panel py-0.5 text-lg text-main outline-none focus-visible:outline-none"
          >
            <RegionOptions />
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[52px] flex-[0_0_auto] items-center justify-center gap-2 rounded-md bg-ahead px-6 font-semibold text-page transition-colors hover:bg-ahead-soft disabled:opacity-60 max-sm:w-full"
        >
          {pending ? "Looking up…" : "Analyze"}
          <ArrowRightIcon />
        </button>
      </div>
      {menu}
      {error && (
        <p id="search-error" role="alert" className="px-1 text-sm text-behind">
          {error}
        </p>
      )}
    </form>
  );
}
