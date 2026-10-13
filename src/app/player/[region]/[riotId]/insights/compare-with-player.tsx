import Form from "next/form";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { PanelHeading } from "@/components/ui/panel-heading";
import type { BenchmarkComparison as Comparison } from "@/lib/analyzer/compare";
import type { DataDragon } from "@/lib/ddragon";
import { REGIONS } from "@/lib/regions";
import { BenchmarkComparison } from "./benchmark-comparison";
import type { Choice, ChosenPlayer } from "./chosen-player";

const fieldLabel = "font-mono text-[11px] uppercase tracking-[0.12em] text-faint";
const note = "rounded-[14px] border border-line-strong bg-surface px-5 py-4 text-muted";

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
  dd,
}: {
  chosen: ChosenPlayer | null;
  // Null when nothing could be compared (or no one is picked yet).
  comparison: Comparison | null;
  clearHref: string; // this page without ?vs=
  dd: DataDragon | null;
}) {
  return (
    <section aria-labelledby="compare-player-heading" className="flex flex-col gap-3.5">
      <PanelHeading id="compare-player-heading">
        {chosen?.status === "ok" ? `You vs ${chosen.name}` : "Compare with a player"}
      </PanelHeading>
      <PlayerForm choice={chosen?.choice ?? null} clearHref={clearHref} />
      {chosen && <Result chosen={chosen} comparison={comparison} dd={dd} />}
    </section>
  );
}

function PlayerForm({ choice, clearHref }: { choice: Choice | null; clearHref: string }) {
  return (
    <Form action="" aria-label="Compare with a player" className="flex max-w-[600px] flex-col gap-2">
      <div className="flex flex-wrap gap-2 rounded-[14px] border border-line-strong bg-surface p-2 focus-within:border-ahead">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col px-3 py-1.5 max-sm:basis-full">
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
            className="min-w-0 bg-transparent py-0.5 text-lg text-ink outline-none placeholder:text-placeholder focus-visible:outline-none"
          />
        </div>
        <div className="flex flex-col border-line-strong px-3 py-1.5 max-sm:basis-full max-sm:border-t sm:border-l">
          <label htmlFor="vsRegion" className={fieldLabel}>
            Region
          </label>
          <select
            id="vsRegion"
            name="vsRegion"
            defaultValue={choice?.region ?? "kr"}
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
          className="inline-flex min-h-[52px] flex-[0_0_auto] items-center justify-center rounded-[10px] bg-ahead px-6 font-semibold text-page transition-colors hover:bg-ahead-soft max-sm:w-full"
        >
          Compare
        </button>
      </div>
      <p className="px-1 text-sm text-faint">
        Any player works, such as a pro&apos;s solo queue account. Their last 20 ranked solo games
        are used.
        {choice && (
          <>
            {" "}
            <a href={clearHref} className="text-muted underline underline-offset-2">
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
        return <p className={note}>Loading {chosen.name}&apos;s games…</p>;
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
