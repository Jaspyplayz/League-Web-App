"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { searchPlayer } from "@/app/actions";
import { isRegion, REGIONS } from "@/lib/regions";
import { parseRiotId } from "@/lib/riot-id";
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

// The big search on the home page (and the not-found page), 56px tall: the
// region as a pill with a caret, the Riot ID box, and Search in the text
// colour, like the main button. The fields carry their names for screen
// readers instead of visible labels (JAS-92).
export function SearchForm() {
  const { error, pending, formProps, riotIdProps, menu } = usePlayerSearch("search-error");
  const phone = usePhone();

  return (
    <form {...formProps} aria-label="Player lookup" className="relative flex w-full flex-col gap-2">
      <div
        className={`flex h-14 w-full items-center gap-1 rounded-md bg-panel pr-2 pl-2 focus-within:outline-2 focus-within:outline-quiet ${
          error ? "outline-[1.5px] outline-main" : ""
        }`}
      >
        <span className="relative shrink-0">
          <select
            id="region"
            name="region"
            defaultValue="na"
            aria-label="Region"
            className="h-9 cursor-pointer appearance-none rounded-full bg-raised pr-8 pl-3.5 text-sm font-semibold text-main outline-none focus-visible:outline-2 focus-visible:outline-main"
          >
            <RegionOptions />
          </select>
          <svg
            viewBox="0 0 10 10"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-2.5 -translate-y-1/2 text-quiet"
          >
            <path d="M1 3l4 4 4-4z" fill="currentColor" />
          </svg>
        </span>
        <input
          id="riotId"
          aria-label="Riot ID"
          // The long hint is cut off in a phone's narrow box (JAS-92).
          placeholder={phone ? "Name#TAG" : "Riot ID, like Hide on bush#KR1"}
          {...riotIdProps}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-main outline-none placeholder:text-placeholder sm:text-lg"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 shrink-0 items-center rounded-md bg-main px-4 text-body font-semibold text-page transition-opacity duration-320 ease-out hover:opacity-90 hover:duration-120 motion-reduce:transition-none disabled:opacity-60"
        >
          {pending ? "Looking up…" : "Search"}
        </button>
      </div>
      {menu}
      {error && (
        // The "!" mark sits outside the alert, so the alert's text is only the message.
        <div className="flex items-start gap-2 px-1">
          <span
            aria-hidden="true"
            className="mt-px grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-quiet text-xs font-bold text-quiet"
          >
            !
          </span>
          <p id="search-error" role="alert" className="text-sm text-main">
            {error}
          </p>
        </div>
      )}
    </form>
  );
}

// Below Tailwind's sm breakpoint. False on the server, so the page arrives
// with the long hint and a phone swaps it once it wakes up.
function usePhone() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(max-width: 639px)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}
