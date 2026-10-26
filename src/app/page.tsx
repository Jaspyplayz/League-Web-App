import { DiffChart, type TurningPointMarker } from "@/components/diff-chart";
import { HomeBrief } from "@/components/home-brief";
import { HomeOpener } from "@/components/home-opener";
import { SearchForm } from "@/components/search-form";
import { Eyebrow } from "@/components/ui/eyebrow";
import { softPanelClass } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import type { DiffPoint } from "@/lib/diff-chart";
import { staticBriefs } from "@/lib/home-ledger";

// Made-up sample game for the hero picture: gold difference, one value per minute.
const SAMPLE_GOLD_DIFF: DiffPoint[] = [
  0, 0, 20, 60, 120, 180, 150, 90, -330, -480, -760, -1290, -1350, -1300, -1420, -1400,
  -1100, -900, -950, -600, -300, -250, 580, 650, 500, -100, -500, -1100, -1800, -2300,
  -2600, -2900,
].map((diff, minute) => ({ minute, diff }));

const SAMPLE_MARKERS: TurningPointMarker[] = [
  { minute: 8, label: "8:10 Died to a gank", tone: "behind" },
];

export default function Home() {
  const briefs = staticBriefs();
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
        </div>

        <div className={`${softPanelClass} flex min-w-0 flex-[1_1_440px] flex-col gap-4 p-6`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[22px] font-semibold uppercase tracking-[0.02em]">
              Gold vs your opponent
            </h2>
            <span className="font-mono text-[13px] text-faint">Illustration · not a real game</span>
          </div>
          <DiffChart
            points={SAMPLE_GOLD_DIFF}
            markers={SAMPLE_MARKERS}
            description="Illustration, not a real game. Gold difference against the opponent in the same role over 31 minutes: slightly ahead until 8 minutes, then behind, briefly ahead at 22 minutes, and 2,900 gold behind at the end."
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
                <span className="font-mono text-behind">8:10</span> Died to a gank
              </p>
              <p className="text-sm text-muted">
                Lee Sin ganked you in your lane. You went from +90 to −1,290 gold against Syndra
                between 7:00 and 11:00.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how"
        aria-labelledby="home-start-heading"
        className="mx-auto flex max-w-[1200px] scroll-mt-6 flex-col gap-7 px-6 pb-[88px] pt-8"
      >
        <SectionHeading id="home-start-heading">Look at a game</SectionHeading>
        <ul className="flex flex-wrap gap-4">
          <li className="min-w-0 flex-[1.15_1_320px]">
            <HomeBrief brief={briefs.sample} />
          </li>
          <li className="min-w-0 flex-[1_1_280px]">
            <HomeBrief brief={briefs.habit} />
          </li>
          <li className="min-w-0 flex-[1_1_280px]">
            <HomeOpener />
          </li>
        </ul>
      </section>
    </main>
  );
}
