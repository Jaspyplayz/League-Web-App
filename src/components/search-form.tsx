"use client";

import { useActionState } from "react";
import { searchPlayer } from "@/app/actions";
import { isRegion, REGIONS } from "@/lib/regions";
import { parseRiotId } from "@/lib/riot-id";
import { ArrowRightIcon } from "./icons";
import { noteSearch } from "./saved-players";
import { panelClass } from "@/components/ui/panel";

const fieldLabel = "font-mono text-[11px] uppercase tracking-[0.12em] text-faint";

export function SearchForm() {
  const [state, action, pending] = useActionState(searchPlayer, { error: null });

  // Runs in the browser just before the form is sent, so the profile page can
  // tell this player came from a search and add them to Recent.
  function rememberSearch(event: React.FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const region = String(form.get("region") ?? "");
    const riotId = parseRiotId(String(form.get("riotId") ?? ""));
    if (isRegion(region) && riotId) noteSearch({ region, ...riotId });
  }

  return (
    <form action={action} onSubmit={rememberSearch} role="search" aria-label="Player lookup" className="flex max-w-[600px] flex-col gap-2">
      <div className={`${panelClass} flex flex-wrap gap-2 p-2 focus-within:border-ahead`}>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col px-3 py-1.5 max-sm:basis-full">
          <label htmlFor="riotId" className={fieldLabel}>
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
            className="min-w-0 bg-transparent py-0.5 text-lg text-ink outline-none placeholder:text-placeholder focus-visible:outline-none"
          />
        </div>
        <div className="flex flex-col border-line-strong px-3 py-1.5 max-sm:basis-full max-sm:border-t sm:border-l">
          <label htmlFor="region" className={fieldLabel}>
            Region
          </label>
          <select
            id="region"
            name="region"
            defaultValue="na"
            className="bg-surface py-0.5 text-lg text-ink"
          >
            {Object.entries(REGIONS).map(([key, { label }]) => (
              <option key={key} value={key} title={label}>
                {key.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[52px] flex-[0_0_auto] items-center justify-center gap-2 rounded-[10px] bg-ahead px-6 font-semibold text-page transition-colors hover:bg-ahead-soft disabled:opacity-60 max-sm:w-full"
        >
          {pending ? "Looking up…" : "Analyze"}
          <ArrowRightIcon />
        </button>
      </div>
      {state.error && (
        <p id="search-error" role="alert" className="px-1 text-sm text-behind">
          {state.error}
        </p>
      )}
    </form>
  );
}
