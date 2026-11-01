"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { searchPlayer } from "@/app/actions";
import { isRegion, REGIONS, type Region } from "@/lib/regions";
import { parseRiotId } from "@/lib/riot-id";
import { noteSearch } from "./saved-players";
import { SavedPlayersBox, useSavedPlayersBox } from "./saved-players-box";

// What both player searches share, the big one on home and the small one in
// the header: sending the form, the error it can come back with, and the box
// of saved players that opens under it. The box shows from clicking into the
// form until you click or tab out of it, press Escape, search, or pick a
// player. `errorId` ties the Riot ID box to the error for screen readers.
export function usePlayerSearch(errorId: string, startingRiotId = "") {
  const [state, action, pending] = useActionState(searchPlayer, { error: null });
  // What's typed in the Riot ID box, to narrow the saved players.
  const [query, setQuery] = useState(startingRiotId);
  const [wanted, setWanted] = useState(false);
  // Picking a saved player leaves the last search's error behind, and the
  // header's form stays on screen across pages.
  const [errorDismissed, setErrorDismissed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const saved = useSavedPlayersBox(wanted);
  const boxOpen = wanted && !pending && saved.hasAny;
  // One or the other, since they'd sit in the same spot. The error comes back
  // when the box closes. While a new search runs, it's the last search's error.
  const error = boxOpen || errorDismissed || pending ? null : state.error;

  // A click outside closes the box. Blur can't catch it: a tap outside on an
  // iPhone leaves the input focused.
  useEffect(() => {
    if (!wanted) return;
    function closeIfOutside(event: PointerEvent) {
      if (!formRef.current?.contains(event.target as Node)) setWanted(false);
    }
    document.addEventListener("pointerdown", closeIfOutside);
    return () => document.removeEventListener("pointerdown", closeIfOutside);
  }, [wanted]);

  // Sends the form from here, because React resets a form it sends itself, and
  // that puts the region picker back where it started after a rejected search
  // (JAS-135). A browser without JavaScript never gets here and uses `action`.
  // Noting the search lets the profile page tell this player came from one and
  // add them to Recent.
  function sendSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const region = String(form.get("region") ?? "");
    const riotId = parseRiotId(String(form.get("riotId") ?? ""));
    if (isRegion(region) && riotId) noteSearch({ region, ...riotId });
    setWanted(false);
    setErrorDismissed(false);
    startTransition(() => action(form));
  }

  const formProps = {
    ref: formRef,
    action,
    onSubmit: sendSearch,
    role: "search",
    onFocus: () => setWanted(true),
    onBlur: (event: React.FocusEvent<HTMLFormElement>) => {
      // Tabbing out closes the box; focus moving inside the form keeps it open.
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
        setWanted(false);
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== "Escape" || !wanted) return;
      // Back to the Riot ID box first, since focus on a row would otherwise be
      // lost. In this order the focus can't reopen the box.
      inputRef.current?.focus();
      setWanted(false);
    },
  };

  const riotIdProps = {
    ref: inputRef,
    name: "riotId",
    required: true,
    autoComplete: "off",
    value: query,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      setWanted(true);
    },
    // Focus alone misses a click after Escape, when the input kept focus.
    onClick: () => setWanted(true),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  };

  const box = boxOpen && (
    <SavedPlayersBox
      saved={saved}
      query={query}
      onPick={() => {
        setWanted(false);
        // Next.js keeps this page's state, so Back shows the form as left here.
        setQuery(startingRiotId);
        setErrorDismissed(true);
      }}
      // A row that leaves takes keyboard focus with it, so hand it back.
      onRowGone={() => inputRef.current?.focus()}
    />
  );

  return { error, pending, formProps, riotIdProps, boxOpen, box };
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
// readers instead of visible labels (JAS-92). `startWith` fills it in, so a
// player who mistyped a Riot ID can fix one letter instead of typing it again.
export function SearchForm({ startWith }: { startWith?: { region: Region; riotId: string } }) {
  const { error, pending, formProps, riotIdProps, boxOpen, box } = usePlayerSearch(
    "search-error",
    startWith?.riotId,
  );
  const phone = usePhone();

  return (
    <form {...formProps} aria-label="Player lookup" className="flex w-full flex-col gap-2">
      <div className="relative">
        <div
          className={`flex h-14 w-full items-center gap-1 bg-panel pr-2 pl-2 ${
            boxOpen ? "rounded-t-md outline-1 outline-divider" : "rounded-md"
          } focus-within:outline-2 focus-within:outline-quiet ${error ? "outline-[1.5px] outline-main" : ""}`}
        >
          <span className="relative shrink-0">
            <select
              id="region"
              name="region"
              defaultValue={startWith?.region ?? "na"}
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
        {box && <div className="absolute inset-x-0 top-full z-30">{box}</div>}
      </div>
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
