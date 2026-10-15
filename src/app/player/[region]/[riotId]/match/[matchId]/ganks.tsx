import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { formatClock, formatGap, plural } from "@/lib/analyzer/format";
import type { Gank, GankLog, GankOutcome } from "@/lib/analyzer/ganks";

const OUTCOME_TEXT: Record<GankOutcome, string> = {
  kill: "Kill",
  death: "Died",
  trade: "Trade",
  "no kill": "No kill",
};

// Early gank log for junglers: every lane fight and lane visit before 14:00,
// yours on the left and the enemy jungler's on the right. It lays out the
// numbers (who joined, how the lane was doing) and leaves the judging to you.
export function Ganks({ ganks, enemyJungler }: { ganks: GankLog; enemyJungler: string }) {
  return (
    <section
      aria-labelledby="ganks-heading"
      className={`${panelClass} flex flex-col gap-[18px] p-6`}
    >
      <div className="flex flex-col gap-1.5">
        <PanelHeading id="ganks-heading">Early ganks</PanelHeading>
        <p className="text-sm text-muted">
          Lane fights each jungler took part in before 14:00, with how many players joined on each
          side and how the lane was doing just before. &quot;No kill&quot; means the jungler was
          standing in a lane at one of Riot&apos;s once-a-minute snapshots with no kill nearby, so
          short visits can be missed and taking a wave counts too.
        </p>
      </div>
      <div className="flex flex-wrap gap-5">
        <GankList title="Your ganks" ganks={ganks.yours} yours />
        <GankList title={`${enemyJungler}'s ganks`} ganks={ganks.theirs} yours={false} />
      </div>
    </section>
  );
}

function GankList({ title, ganks, yours }: { title: string; ganks: Gank[]; yours: boolean }) {
  return (
    <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-body font-semibold">{title}</h3>
        <span className="font-mono text-note text-faint">{summary(ganks)}</span>
      </div>
      {ganks.length === 0 ? (
        <p className="text-sm text-muted">None before 14:00.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-[10px] border border-line">
          {ganks.map((g) => (
            <li
              key={`${g.timestamp}-${g.lane}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5"
            >
              <span className="w-11 font-mono text-body text-muted">
                {formatClock(g.timestamp)}
              </span>
              <span className="w-9 font-mono text-label uppercase tracking-[0.1em] text-ink-soft">
                {g.lane}
              </span>
              <span className={`w-16 text-sm font-semibold ${outcomeColor(g.outcome, yours)}`}>
                {OUTCOME_TEXT[g.outcome]}
              </span>
              <span className="min-w-0 flex-1 text-sm text-muted">{details(g)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Colored by what it meant for your team: blue when it went your way, red
// when it didn't. An enemy jungler's kill is red.
function outcomeColor(outcome: GankOutcome, yours: boolean): string {
  if (outcome === "kill") return yours ? "text-ahead" : "text-behind";
  if (outcome === "death") return yours ? "text-behind" : "text-ahead";
  return "text-ink-soft";
}

// "2 vs 1 · lane 600 ahead · both junglers"
function details(g: Gank): string {
  const parts: string[] = [];
  if (g.outcome !== "no kill") parts.push(`${g.ganking} vs ${g.defending}`);
  if (g.laneLead !== null) parts.push(`lane ${formatGap(g.laneLead, 0).text.toLowerCase()}`);
  if (g.otherJungler) parts.push("both junglers");
  return parts.join(" · ");
}

// "4 ganks · 2 with a kill"
function summary(ganks: Gank[]): string {
  const kills = ganks.filter((g) => g.outcome === "kill" || g.outcome === "trade").length;
  return ganks.length ? `${plural(ganks.length, "gank")} · ${kills} with a kill` : "";
}
