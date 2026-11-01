import Link from "next/link";
import type { ReactNode } from "react";
import type { HomeExample } from "@/lib/home-example";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import { FittedDiffChart } from "./fitted-diff-chart";
import { LoadingBlock } from "./ui/loading";
import { panelClass } from "./ui/panel";
import { mainButtonClass } from "./ui/state-panel";

// The chart's slot: 150px on wide screens so "Open this game" fits a
// laptop's first screen, 180px on phones (JAS-88, JAS-92). The loading and
// failed states keep the same slot, so the button never moves.
const CHART_SLOT = "h-[180px] sm:h-[150px]";

// Home's example game (JAS-115): the sample game's gold against the opponent,
// its biggest turning point, and two ways into it, the chart and the button.
export function HomeExamplePanel({ example }: { example: HomeExample | null }) {
  if (!example) return <ExampleFailed />;
  const { turn } = example;
  return (
    <Frame
      title={
        <>
          <span className="font-normal text-quiet">Example game: </span>
          <span className={example.won ? "text-ahead" : "text-behind"}>
            {example.won ? "Victory" : "Defeat"}
          </span>{" "}
          as {example.champion}
          <span className="text-quiet"> vs {example.opponent}</span>
        </>
      }
      details={example.details}
      chart={
        // No aria-label: the link takes its name from the chart's description,
        // since a label that leaves out the chart's visible numbers fails the
        // accessibility scan (label-content-name-mismatch).
        <Link href={SAMPLE_MATCH_HREF} className="block rounded-md">
          <FittedDiffChart
            className={CHART_SLOT}
            points={example.gold}
            markers={
              turn
                ? [{ minute: turn.minute, label: `${turn.clock} ${turn.title}`, tone: turn.ahead ? "ahead" : "behind" }]
                : []
            }
            description={example.description}
          />
        </Link>
      }
      turn={
        turn && (
          <div className="flex min-w-0 items-start gap-3">
            {/* The same mark as the chart's circle, so the eye can match them. */}
            <span
              aria-hidden="true"
              className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 text-note font-semibold ${
                turn.ahead ? "border-ahead text-ahead" : "border-behind text-behind"
              }`}
            >
              1
            </span>
            <div className="min-w-0">
              <p className="text-body font-semibold">
                <span className="tabular-nums">{turn.clock}</span> {turn.title}
              </p>
              <p className="line-clamp-2 text-note text-quiet sm:line-clamp-1">{turn.detail}</p>
            </div>
          </div>
        )
      }
    />
  );
}

// The game couldn't be read, so there's no chart. The match page can still
// fetch the game from Riot, so "Open this game" stays (JAS-93).
function ExampleFailed() {
  return (
    <Frame
      title="Example game"
      chart={
        <div className={`${CHART_SLOT} flex items-center gap-3 rounded-md bg-raised px-5`}>
          <span
            aria-hidden="true"
            className="grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] border-quiet text-note font-bold text-quiet"
          >
            !
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-body font-semibold">The example game&apos;s chart can&apos;t load right now</p>
            <p className="text-sm text-quiet">The game itself may still open. Or search for any player above.</p>
          </div>
        </div>
      }
    />
  );
}

// While the database answers: grey blocks where the game's words and chart
// go. The heading and the button are already known, so they show for real.
export function HomeExampleLoading() {
  return (
    <Frame
      title="Example game"
      details={<LoadingBlock className="h-4 w-56 max-w-full" />}
      chart={<LoadingBlock className={CHART_SLOT} />}
      turn={<LoadingBlock className="h-10 w-80 max-w-full" />}
    />
  );
}

// The panel's shape, the same in every state: title and details on one line,
// the chart, then the turning point beside "Open this game".
function Frame({
  title,
  details,
  chart,
  turn,
}: {
  title: ReactNode;
  details?: ReactNode;
  chart: ReactNode;
  turn?: ReactNode;
}) {
  return (
    <section aria-labelledby="example-title" className={`${panelClass} flex flex-col gap-2.5 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h2 id="example-title" className="text-subheading font-semibold">
          {title}
        </h2>
        {details && <div className="text-note text-quiet tabular-nums">{details}</div>}
      </div>
      {chart}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        {turn || <span />}
        <Link href={SAMPLE_MATCH_HREF} className={`${mainButtonClass} shrink-0 max-sm:w-full`}>
          Open this game
        </Link>
      </div>
    </section>
  );
}
