import Form from "next/form";
import { PanelSkeleton } from "@/components/loading-skeleton";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { PanelHeading } from "@/components/ui/panel-heading";
import type { BenchmarkComparison as Comparison } from "@/lib/analyzer/compare";
import type { DataDragon } from "@/lib/ddragon";
import { REGIONS } from "@/lib/regions";
import { BenchmarkComparison } from "./benchmark-comparison";
import type { Choice, ChosenPlayer } from "./chosen-player";
import { panelClass } from "@/components/ui/panel";
import { secondButtonClass } from "@/components/ui/state-panel";

const fieldLabel = "text-note text-quiet";
const input = "h-11 min-w-0 rounded-md bg-raised px-2.5 text-body text-main sm:h-10";
const note = "text-body text-quiet";

// "Compare with a player": type any Riot ID, such as a pro's solo queue
// account, and see your games next to their last 20 ranked solo games.
//
// The form is a plain GET form, so submitting it just adds ?vs=...&vsRegion=...
// to the URL and the server does the rest. next/form makes that a client-side
// navigation instead of a full page load.
export function CompareWithPlayer({
  chosen,
  comparison,
  clearHref,
  keep,
  dd,
}: {
  chosen: ChosenPlayer | null;
  // Null when nothing could be compared (or no one is picked yet).
  comparison: Comparison | null;
  clearHref: string; // this page without ?vs=
  // The filters at the top, carried along so comparing doesn't reset them.
  keep: Record<string, string>;
  dd: DataDragon | null;
}) {
  return (
    <section
      aria-labelledby="compare-player-heading"
      className={`${panelClass} flex flex-col gap-4 p-4 sm:px-5`}
    >
      <PanelHeading id="compare-player-heading">
        {chosen?.status === "ok" ? `You vs ${chosen.name}` : "Compare with a player"}
      </PanelHeading>
      <PlayerForm choice={chosen?.choice ?? null} clearHref={clearHref} keep={keep} />
      {chosen && <Result chosen={chosen} comparison={comparison} dd={dd} />}
    </section>
  );
}

function PlayerForm({
  choice,
  clearHref,
  keep,
}: {
  choice: Choice | null;
  clearHref: string;
  keep: Record<string, string>;
}) {
  return (
    <Form action="" aria-label="Compare with a player" className="flex flex-col gap-2.5">
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex min-w-0 max-w-[360px] flex-[1_1_220px] flex-col gap-1 max-sm:max-w-none">
          <label htmlFor="vs" className={fieldLabel}>
            Their Riot ID
          </label>
          <input
            id="vs"
            name="vs"
            required
            defaultValue={choice?.input}
            placeholder="Hide on bush#KR1"
            autoComplete="off"
            className={`${input} placeholder:text-placeholder`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="vsRegion" className={fieldLabel}>
            Region
          </label>
          <select
            id="vsRegion"
            name="vsRegion"
            defaultValue={choice?.region ?? "kr"}
            className={`${input} min-w-24`}
          >
            {Object.entries(REGIONS).map(([key, { label }]) => (
              <option key={key} value={key} title={label}>
                {key.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={`${secondButtonClass} sm:h-10`}>
          Compare
        </button>
      </div>
      <p className="text-note text-quiet">
        Any player works, such as a pro&apos;s solo queue account. Their last 20 ranked solo games
        are used.
        {choice && (
          <>
            {" "}
            <a href={clearHref} className="text-main underline underline-offset-2">
              Clear
            </a>
          </>
        )}
      </p>
    </Form>
  );
}

function Result({
  chosen,
  comparison,
  dd,
}: {
  chosen: ChosenPlayer;
  comparison: Comparison | null;
  dd: DataDragon | null;
}) {
  const where = chosen.choice.region.toUpperCase();
  switch (chosen.status) {
    case "invalid":
      return (
        <p role="alert" className={note}>
          &ldquo;{chosen.choice.input}&rdquo; isn&apos;t a Riot ID. Use the GameName#TAG format.
        </p>
      );
    case "not-found":
      return (
        <p role="alert" className={note}>
          No player called {chosen.choice.input} on {where}. Check the spelling, the tag and the
          region.
        </p>
      );
    case "error":
      return <RiotErrorNotice error={chosen.error} />;
    case "ok":
      if (comparison) {
        return (
          <BenchmarkComparison
            comparison={comparison}
            against={{ kind: "player", name: chosen.name, href: chosen.href }}
            dd={dd}
          />
        );
      }
      // Their games are still coming in; the progress bar at the top covers it.
      if (chosen.waiting > 0) {
        return <PanelSkeleton label={`Loading ${chosen.name}'s games`} />;
      }
      return (
        <p className={note}>
          {chosen.games.length === 0
            ? `${chosen.name} has no recent ranked solo games on ${where} to compare with.`
            : `Too few of ${chosen.name}'s recent ranked solo games are in your roles to compare with.`}
        </p>
      );
  }
}
