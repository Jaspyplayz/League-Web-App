import Link from "next/link";
import { DiffChart, type TurningPointMarker } from "@/components/diff-chart";
import { SavedPlayers } from "@/components/saved-players";
import { SearchForm } from "@/components/search-form";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import type { DiffPoint } from "@/lib/diff-chart";
import { toSlug } from "@/lib/riot-id";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";

// A well-known public Riot ID (Faker), so visitors can try a lookup in one click.
const EXAMPLE_PLAYER = { region: "kr", gameName: "Hide on bush", tagLine: "KR1" };

// Made-up sample game for the hero picture: gold difference, one value per minute.
const SAMPLE_GOLD_DIFF: DiffPoint[] = [
  0, 0, 20, 60, 120, 180, 150, 90, -330, -480, -760, -1290, -1350, -1300, -1420, -1400,
  -1100, -900, -950, -600, -300, -250, 580, 650, 500, -100, -500, -1100, -1800, -2300,
  -2600, -2900,
].map((diff, minute) => ({ minute, diff }));

const SAMPLE_MARKERS: TurningPointMarker[] = [
  { minute: 8, label: "8:10 Died to a jungle gank", tone: "behind" },
];

const STEPS = [
  {
    title: "Role matchup, minute by minute",
    body: "Gold, CS, XP and damage against the player in your role, jungler included, built from Riot's match timeline data.",
  },
  {
    title: "Turning points in plain words",
    body: "Turnpoint finds the swings that decided your game and says what happened, like a death to a gank, a lost objective or a missed camp.",
  },
  {
    title: "Patterns across 20 games",
    body: "Recent games roll up into recurring weaknesses, so you know what to practice next instead of guessing.",
  },
];

export default function Home() {
  return (
    <main>
      <section className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 px-6 pb-14 pt-16 sm:pt-[72px]">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
          <Eyebrow>Match analysis for League of Legends</Eyebrow>
          <h1 className="font-display text-[clamp(52px,7vw,92px)] font-bold uppercase leading-[0.92] tracking-[0.005em]">
            Find the minute
            <br />
            your game turned.
          </h1>
          <p className="max-w-[520px] text-lg text-muted">
            Look up any player by Riot ID. Turnpoint compares them to the opponent in their
            role, top to support and jungle included, minute by minute, and points to the
            moments that decided the game.
          </p>
          <SearchForm />
          <div className="flex flex-wrap items-center gap-2.5 text-sm text-faint">
            <span>Try it with</span>
            <Link
              href={`/player/${EXAMPLE_PLAYER.region}/${toSlug(EXAMPLE_PLAYER)}`}
              className="rounded-full border border-line-strong px-3.5 py-2 font-mono text-ink-soft transition-colors hover:border-ahead hover:text-ink"
            >
              {EXAMPLE_PLAYER.gameName}#{EXAMPLE_PLAYER.tagLine}
            </Link>
            <span>or</span>
            <Link
              href={SAMPLE_MATCH_HREF}
              className="rounded-full border border-line-strong px-3.5 py-2 text-ink-soft transition-colors hover:border-ahead hover:text-ink"
            >
              See a sample analysis
            </Link>
          </div>
          <SavedPlayers />
        </div>

        <Panel className="flex min-w-0 flex-[1_1_440px] flex-col gap-4 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[22px] font-semibold uppercase tracking-[0.02em]">
              Gold vs your opponent
            </h2>
            <span className="font-mono text-[13px] text-faint">Sample game · Ahri vs Syndra · Mid</span>
          </div>
          <DiffChart
            points={SAMPLE_GOLD_DIFF}
            markers={SAMPLE_MARKERS}
            description="Sample game. Gold difference against the opponent in the same role over 31 minutes: slightly ahead until 8 minutes, then behind, briefly ahead at 22 minutes, and 2,900 gold behind at the end."
          />
          <div className="flex items-start gap-3.5 rounded-xl bg-page px-4 py-3.5">
            <div
              aria-hidden="true"
              className="flex size-7 flex-none items-center justify-center rounded-full border-2 border-behind font-mono text-[13px] font-medium text-behind"
            >
              1
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-[15px] font-semibold">
                <span className="font-mono text-behind">8:10</span> Died to a jungle gank
              </p>
              <p className="text-sm text-muted">
                You pushed past your river ward with Lee Sin unaccounted for. That death cost
                420 gold of lead, and you stayed behind until the Dragon fight at 22:05.
              </p>
            </div>
          </div>
        </Panel>
      </section>

      <section
        id="how"
        className="mx-auto flex max-w-[1200px] scroll-mt-6 flex-col gap-7 px-6 pb-[88px] pt-8"
      >
        <SectionHeading>How it works</SectionHeading>
        <ol className="flex flex-wrap gap-4">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-2xl border border-line bg-surface p-7"
            >
              <span aria-hidden="true" className="font-mono text-sm text-ahead">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="text-[15px] text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <Link href="/how-it-works" className="text-body text-ahead-soft hover:text-ahead-bright">
          How the win chance and game score models work →
        </Link>
      </section>
    </main>
  );
}
