"use client";

import { usePathname } from "next/navigation";
import { useId, useSyncExternalStore } from "react";
import { isRegion, type Region } from "@/lib/regions";
import { hoverFade } from "./header-style";
import { ChevronDownIcon, SearchIcon } from "./icons";
import { RegionOptions, usePlayerSearch } from "./search-form";

// The header's search (JAS-86): a region chip, the Riot ID box and a search
// button in one field. On wide screens it fills the header's middle column;
// on phones it's a full-width second row. Home has its own big search, so
// the header leaves this out there.
export function HeaderSearchUnlessHome() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  // On a player's pages, start on that player's region, the likeliest one
  // for the next search. key= starts a fresh form when the region changes.
  const region = regionInPath(pathname);
  return <HeaderSearch key={region} region={region} />;
}

// "/player/kr/..." starts on KR; anywhere else on NA, as home does.
function regionInPath(pathname: string): Region {
  const segment = pathname.split("/")[2] ?? "";
  return pathname.startsWith("/player/") && isRegion(segment) ? segment : "na";
}

// The wide header's placeholder doesn't fit a phone's field, so phones get
// the short one, as in the mockup. 1024px is where Tailwind's lg: starts. The server can't see the screen, so it
// sends the wide one and a phone swaps it right after the page loads.
const WIDE = "(min-width: 1024px)";

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePlaceholder(): string {
  const wide = useSyncExternalStore(subscribeToWidth, () => window.matchMedia(WIDE).matches, () => true);
  return wide ? "Search a player: GameName#TAG" : "GameName#TAG";
}

// Smaller than the header's other icon buttons, to fit inside the field.
const searchButton = `inline-flex size-9 shrink-0 items-center justify-center rounded-md text-quiet disabled:opacity-60 lg:size-8 ${hoverFade}`;

export function HeaderSearch({ region = "na" }: { region?: Region }) {
  // useId, not fixed ids, because the not-found page shows the big search
  // too and two boxes can't share one id.
  const errorId = useId();
  const { error, pending, formProps, riotIdProps, menu } = usePlayerSearch(errorId);
  const placeholder = usePlaceholder();

  return (
    <form
      {...formProps}
      aria-label="Search a player"
      // The field's outline turns blue while you type in it, as on home.
      className="relative order-last mb-1.5 flex h-11 basis-full items-center gap-0.5 rounded-md border border-transparent bg-panel px-1 has-[input:focus-visible]:border-ahead lg:order-none lg:col-start-2 lg:mb-0 lg:h-10"
    >
      <span className="relative flex shrink-0 items-center">
        <select
          name="region"
          defaultValue={region}
          aria-label="Region"
          className="h-[34px] appearance-none rounded-sm bg-select pr-6 pl-2.5 text-note font-semibold text-main lg:h-8"
        >
          <RegionOptions />
        </select>
        <span className="pointer-events-none absolute right-2 text-quiet">
          <ChevronDownIcon />
        </span>
      </span>
      <input
        aria-label="Riot ID"
        enterKeyHint="search"
        placeholder={placeholder}
        {...riotIdProps}
        className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-base text-main outline-none placeholder:text-quiet focus-visible:outline-none lg:text-[15px]"
      />
      <button
        type="submit"
        disabled={pending}
        aria-label={pending ? "Looking up" : "Search"}
        className={searchButton}
      >
        <SearchIcon size={18} />
      </button>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="absolute inset-x-0 top-full z-20 mt-2 rounded-md bg-panel px-3 py-2 text-note text-behind shadow-lg"
        >
          {error}
        </p>
      ) : (
        menu
      )}
    </form>
  );
}
