import type { Metadata } from "next";
import Link from "next/link";
import { Panel, panelClass } from "@/components/ui/panel";
import { REPO_URL } from "@/components/site-header";
import { MIN_PHASE_MINUTES, PHASES } from "@/lib/analyzer/phase-score";
import { rankModelHelps } from "@/lib/analyzer/win-chance";
import { SCORE_MODEL } from "@/lib/game-score";
import { PHASE_MODEL } from "@/lib/phase-score";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import { WIN_CHANCE_MODEL } from "@/lib/win-chance";
import {
  checkRows,
  count,
  glanceRows,
  GOLDEN_GAMES,
  percent,
  phaseRows,
  phaseSpan,
  RANK_LEAD,
  rankRows,
  riotLimit,
  weightBars,
  type Models,
} from "./figures";
import { JumpToSection } from "./jump-to-section";
import { SECTIONS, type SectionId } from "./sections";
import { WhatIfCalculator, type RankWeights } from "./what-if-calculator";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Turnpoint gets its data, finds turning points, and trains its three models, with how each did on games it never saw.",
};

const LINK = "text-main underline decoration-quiet underline-offset-[3px] hover:decoration-main";
// A row in a list or table inside a panel: a thin line above every row but
// the first.
const ROW_LINE = "border-t border-divider first:border-t-0";

// A plain-language tour of what's behind the numbers, for a player or a
// recruiter. Every figure comes from figures.ts, which reads the saved model
// files, so this page stays right after a retrain.
export default function HowItWorksPage() {
  const models: Models = { winChance: WIN_CHANCE_MODEL, score: SCORE_MODEL, phases: PHASE_MODEL };
  const winChance = WIN_CHANCE_MODEL;
  const unseen = SCORE_MODEL.unseen;
  const glance = glanceRows(models);
  const phases = phaseRows(PHASE_MODEL);
  const ranks = rankRows(winChance);
  // Ranks whose own model clearly beat the all-ranks model, so the match
  // page uses it. Only the weights go to the browser, not the test results.
  const usedRanks = winChance.ranks.filter(rankModelHelps);
  const calculatorRanks: RankWeights[] = [
    { label: winChance.rank, weights: winChance.weights },
    ...usedRanks.map((r) => ({ label: r.label, weights: r.weights })),
  ];
  const [early, mid, late] = PHASES.map(phaseSpan);

  return (
    <div className="mx-auto flex w-full max-w-[1048px] flex-col px-4 pb-[72px] pt-6 md:flex-row md:items-start md:gap-12 md:px-10 md:pb-24 md:pt-12">
      <nav
        aria-label="On this page"
        className="hidden flex-[0_0_200px] flex-col gap-0.5 pt-1 md:flex"
      >
        <div className="px-2.5 pb-1.5 text-note text-quiet">On this page</div>
        {SECTIONS.slice(1).map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-md px-2.5 py-1.5 text-sm text-quiet hover:bg-select hover:text-main"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <main className="flex min-w-0 max-w-[720px] flex-1 flex-col gap-10 text-body leading-normal md:gap-[52px]">
        <div className="flex flex-col gap-3">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-main">
            How Turnpoint works
          </h1>
          <p className="text-quiet">
            Where the numbers come from, the {glance.length} trained models behind them, and how
            each one was checked on games it never saw.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
            <Link
              href={SAMPLE_MATCH_HREF}
              className="flex h-10 items-center rounded-md bg-main px-4 font-semibold text-page"
            >
              Open the example game
            </Link>
            <a href={REPO_URL} className={LINK}>
              Source on GitHub
            </a>
          </div>
        </div>

        <JumpToSection />

        <Section id="models">
          <Panel className="hidden p-0 md:block">
            <table className="w-full">
              <thead className="text-left text-note text-quiet">
                <tr>
                  <th className="px-[18px] py-2 font-normal">Model</th>
                  <th className="px-[18px] py-2 font-normal">Learned from</th>
                  <th className="px-[18px] py-2 font-normal">On games it never saw</th>
                </tr>
              </thead>
              <tbody>
                {glance.map((m) => (
                  <tr key={m.name} className="border-t border-divider align-top">
                    <td className="px-[18px] py-3">
                      <span className="block font-semibold text-main">{m.name}</span>
                      <span className="block text-note">{m.gives}</span>
                    </td>
                    <td className="px-[18px] py-3">{m.learnedFrom}</td>
                    <td className="px-[18px] py-3 text-main">{m.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          {/* On a phone the three columns don't fit, so each model is a block. */}
          <ul className={`${panelClass} md:hidden`}>
            {glance.map((m) => (
              <li key={m.name} className={`flex flex-col gap-1.5 px-4 py-3.5 ${ROW_LINE}`}>
                <span className="font-semibold text-main">{m.name}</span>
                <span className="text-note">{m.gives}</span>
                <span className="text-sm text-main">
                  <span className="text-quiet">Learned from </span>
                  {m.learnedFrom}
                </span>
                <span className="text-sm text-main">
                  <span className="text-quiet">On games it never saw: </span>
                  {m.result}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="data">
          <p>
            Everything comes from Riot Games&apos; official API: match results, and a timeline of
            every game with each player&apos;s gold, XP, CS and position once a minute, plus every
            kill and objective.
          </p>
          <ol className={panelClass}>
            {[
              ["Riot’s API", "Match results and a minute-by-minute timeline of every game."],
              [
                "One rate-limited client",
                `Riot allows ${riotLimit()}, so every request waits its turn and retries when Riot says “slow down”.`,
              ],
              ["Postgres", "A finished game is fetched once and kept forever."],
              ["The analyzer", "Pure functions: a game in, turning points and ratings out."],
            ].map(([name, what]) => (
              <li
                key={name}
                className={`flex flex-wrap gap-x-3 gap-y-0.5 px-[18px] py-3 ${ROW_LINE}`}
              >
                <span className="min-w-[190px] flex-[0_0_auto] font-semibold text-main">
                  {name}
                </span>
                <span className="flex-[1_1_260px]">{what}</span>
              </li>
            ))}
          </ol>
          <p>
            A finished game never changes, so each match and timeline is fetched once and kept. A
            player&apos;s rank and match list go stale, so those expire after a day or when you
            press Update. Most page views make no Riot calls at all.
          </p>
        </Section>

        <Section id="turning-points">
          <p>
            The match page compares you with the enemy player in your role, minute by minute, and
            looks for the moments the gap moved: a death, a lost objective, a missed wave. It&apos;s
            plain code, not machine learning: pure functions that take a game in and give findings
            out.
          </p>
          <p>
            Unit tests check each finding on small made-up games, and{" "}
            <strong className="font-semibold text-main">
              golden tests on {GOLDEN_GAMES} real games
            </strong>{" "}
            catch any change to what the page says about them.
          </p>
          <p>
            It describes what happened and leaves the judging to you. A gank into a losing lane can
            be right or wrong depending on things the data can&apos;t see.
          </p>
        </Section>

        <Section id="win-chance">
          <p>
            At every minute, each team&apos;s chance of winning, like the line on a sports
            broadcast. It&apos;s logistic regression: the model looks at how far ahead one team is,
            multiplies each lead by a weight it learned, adds them up and squashes the total into a
            chance between 0% and 100%. An even game is always exactly 50%.
          </p>
          <p>
            It learned its weights from{" "}
            <strong className="font-semibold text-main">
              {count(winChance.games)} ranked games
            </strong>{" "}
            on patches {winChance.patches[0]} to {winChance.patches.at(-1)}. The leads that matter,
            blue where a lead raises your chance and red where it lowers it:
          </p>
          <ul className={`${panelClass} py-1.5`}>
            {weightBars(winChance).map((w) => (
              <li
                key={w.label}
                className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-[18px] py-[9px]"
              >
                <span className="flex-[1_1_250px] text-main">{w.label}</span>
                <span className="flex flex-[1_1_140px] items-center gap-3">
                  {/* A bar out from the centre line: right and blue helps, left and red hurts. */}
                  <span aria-hidden="true" className="relative h-2.5 flex-1">
                    <span className="absolute -bottom-[3px] -top-[3px] left-1/2 w-px bg-divider" />
                    <span
                      className={`absolute inset-y-0 rounded-sm ${w.helps ? "bg-ahead" : "bg-behind"}`}
                      style={{
                        [w.helps ? "left" : "right"]: "50%",
                        width: `${(w.share * 50).toFixed(1)}%`,
                      }}
                    />
                  </span>
                  <span
                    className={`w-14 text-right font-medium ${w.helps ? "text-ahead" : "text-behind"}`}
                  >
                    {w.value}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p>
            Kills and towers get almost no weight. Not because they don&apos;t matter, but because
            they pay gold, and the gold lead already counts that gold. The negative &quot;times
            minutes / 30&quot; weight means a gold lead counts for less late in the game, when
            everyone is close to a full build.
          </p>

          <h3 className="pt-2 text-lg font-semibold text-main">Try it yourself</h3>
          <WhatIfCalculator ranks={calculatorRanks} />

          <h3 className="pt-2 text-lg font-semibold text-main">How good is it?</h3>
          <p>
            Tested on games it never saw during training (5-fold cross-validation, with every minute
            of a game kept in the same group so it can&apos;t peek at the result). The comparison is
            the simplest rule there is: &quot;the team with more gold wins&quot;.
          </p>
          <Panel {...scrolls("Win chance accuracy by minute")}>
            <table className="w-full">
              <thead className="text-note text-quiet">
                <tr>
                  <th className="px-[18px] py-2 text-left font-normal">Minute</th>
                  <th className="px-[18px] py-2 text-right font-normal">Model</th>
                  <th className="px-[18px] py-2 text-right font-normal">More gold wins</th>
                </tr>
              </thead>
              <tbody>
                {winChance.evaluation.byMinute.map((m) => (
                  <tr key={m.minute} className="border-t border-divider">
                    <td className="px-[18px] py-2">{m.minute}:00</td>
                    <td className="px-[18px] py-2 text-right font-semibold text-main">
                      {percent(m.accuracy)}
                    </td>
                    <td className="px-[18px] py-2 text-right">{percent(m.goldRule)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <p>
            Gold explains most of a game, so the gold rule is hard to beat early. The model pulls
            ahead later, when inhibitors, Baron and Elder start deciding games. It only ever runs on
            finished games: Riot doesn&apos;t allow predictions during a live game.
          </p>
          <p>
            These numbers flatter the model. They include the last moment of each game, when the
            winner is nearly certain, so a game surrendered at 20:10 adds an easy guess to the 20:00
            row. A fairer check is planned.
          </p>

          {ranks.length > 0 && (
            <>
              <h3 className="pt-2 text-lg font-semibold text-main">Does rank matter?</h3>
              <p>
                Maybe leads are worth less in Iron, where games get thrown more often. To check,
                each rank (and Emerald+ and Master+) got a model of its own, trained only on games
                at that rank, and both were tested on that rank&apos;s games they hadn&apos;t seen.
                These are counted like the table above, so they flatter the models too.
              </p>
              <p>
                {usedRanks.length === 0
                  ? "No rank's own model did clearly better than the all-ranks model, so every game uses the all-ranks one. A lead is worth about the same in Iron as in Challenger, and the all-ranks model learned from far more games."
                  : `Where a rank's own model did clearly better (${usedRanks.map((r) => r.label).join(", ")}), the match page uses it for players at that rank, and you can pick it in the calculator above. Everywhere else, the all-ranks model was just as good and learned from far more games.`}
              </p>
              {/* A plain <details> opens and closes without any JavaScript. */}
              <details className="group">
                <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-md bg-panel px-3.5 text-sm font-medium text-main [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show the {ranks.length} rank models</span>
                  <span className="hidden group-open:inline">
                    Hide the {ranks.length} rank models
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="group-open:rotate-180"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <Panel {...scrolls("Win chance by rank")} className="mt-3.5 overflow-x-auto p-0">
                  <table className="w-full min-w-[560px]">
                    <thead className="text-note text-quiet">
                      <tr>
                        <th className="px-[18px] py-2 text-left font-normal">Rank</th>
                        <th className="px-[18px] py-2 text-right font-normal">Games</th>
                        <th className="px-[18px] py-2 text-right font-normal">
                          Own model at 20:00
                        </th>
                        <th className="px-[18px] py-2 text-right font-normal">
                          All ranks at 20:00
                        </th>
                        <th className="px-[18px] py-2 text-right font-normal">
                          +{RANK_LEAD.goldLead / 1000}k gold, +{RANK_LEAD.xpLead / 1000}k XP at{" "}
                          {RANK_LEAD.minute}:00
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranks.map((r) => (
                        <tr key={r.key} className="border-t border-divider">
                          <td className="px-[18px] py-[7px] text-main">{r.label}</td>
                          <td className="px-[18px] py-[7px] text-right">{r.games}</td>
                          <td className="px-[18px] py-[7px] text-right text-main">{r.own}</td>
                          <td className="px-[18px] py-[7px] text-right">{r.allRanks}</td>
                          <td className="px-[18px] py-[7px] text-right">{r.lead}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              </details>
            </>
          )}
        </Section>

        <Section id="phases">
          <p>
            The match page rates your early game ({early}), mid game ({mid}) and late game ({late})
            from 0 to 100. Each rating looks at that phase&apos;s stats, like KDA and your gold and
            XP lead over your opponent, compares each with what&apos;s normal for your role in that
            phase, and weighs them by how much they went with winning.
          </p>
          <p>
            Trained on{" "}
            <strong className="font-semibold text-main">
              {phases[0]?.games ?? 0} ranked games
            </strong>
            , Iron to Challenger. A phase needs {MIN_PHASE_MINUTES} minutes of game to be rated, so
            fewer games reach mid and late. How often each rating picked the winner in games it
            hadn&apos;t seen:
          </p>
          <Panel {...scrolls("Phase ratings")}>
            <table className="w-full min-w-[520px]">
              <thead className="text-note text-quiet">
                <tr>
                  <th className="px-[18px] py-2 text-left font-normal">Phase</th>
                  <th className="px-[18px] py-2 text-right font-normal">Games</th>
                  <th className="px-[18px] py-2 text-right font-normal">Picks the winner</th>
                  <th className="px-[18px] py-2 text-left font-normal">Counts most</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((p) => (
                  <tr key={p.key} className="border-t border-divider">
                    <td className="px-[18px] py-2 text-main">{p.name}</td>
                    <td className="px-[18px] py-2 text-right">{p.games}</td>
                    <td className="px-[18px] py-2 text-right font-semibold text-main">
                      {p.accuracy}
                    </td>
                    <td className="px-[18px] py-2">{p.countsMost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <p>
            Early is the hardest phase to read: a lot can still happen after it ends. Later phases
            sit closer to the result, so they predict it better.
          </p>
        </Section>

        <Section id="game-score">
          <p>
            Every player gets a score from 0 to 100, with MVP for the best player on the winning
            team and ACE for the best on the losing team. It&apos;s also logistic regression, on ten
            end-of-game stats (KDA, deaths, kill participation, damage, gold share, CS, vision,
            objective damage and more), trained to predict who won.
          </p>
          <p>
            Two details make it fair across roles. Each stat is first compared with what&apos;s
            normal for your role, since a support&apos;s damage is low by design. And the score is a
            percentile, not a chance of winning: 73 means you rated higher than 73% of players in
            your role in our games, so a great game in a loss still scores well.
          </p>
          <p>
            The current model was trained on {count(SCORE_MODEL.games)} games.
            {unseen && (
              <>
                {" "}
                On{" "}
                <strong className="font-semibold text-main">
                  {count(unseen.games)} saved games
                </strong>{" "}
                it didn&apos;t train on, it picks the winning side{" "}
                <strong className="font-semibold text-main">{percent(unseen.accuracy)}</strong> of
                the time, where a coin flip would get 50%.
              </>
            )}
          </p>
        </Section>

        <Section id="checks">
          <p>
            Numbers on a stats site are only worth trusting if something checks them. These run
            before anything ships:
          </p>
          <ul className={panelClass}>
            {checkRows(models).map((c) => (
              <li
                key={c.name}
                className={`flex flex-wrap items-baseline gap-x-5 gap-y-1 px-[18px] py-3.5 ${ROW_LINE}`}
              >
                <span className="flex flex-[1_1_380px] flex-col gap-0.5">
                  <span className="font-semibold text-main">{c.name}</span>
                  <span className="text-sm">{c.what}</span>
                </span>
                <span className="flex-[0_0_auto] text-lg font-semibold text-main">{c.figure}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="limits">
          <p>
            No live-game help, no rank or MMR guesses, and no telling you what you should have done.
            Riot&apos;s developer policy rules those out, and they&apos;d be wrong often enough that
            you&apos;d stop trusting the rest.
          </p>
          <p>
            The code is open:{" "}
            <a href={REPO_URL} className={LINK}>
              Source on GitHub
            </a>
            , with the full write-ups in{" "}
            <a href={`${REPO_URL}/blob/main/docs/win-chance.md`} className={LINK}>
              docs/win-chance.md
            </a>
            ,{" "}
            <a href={`${REPO_URL}/blob/main/docs/phase-ratings.md`} className={LINK}>
              docs/phase-ratings.md
            </a>{" "}
            and{" "}
            <a href={`${REPO_URL}/blob/main/docs/game-score.md`} className={LINK}>
              docs/game-score.md
            </a>
            .
          </p>
        </Section>
      </main>
    </div>
  );
}

// A panel holding a table that may scroll sideways on a phone. Keyboard users
// need to be able to focus it to scroll it, and a name says what's inside.
function scrolls(name: string) {
  return {
    className: "overflow-x-auto p-0",
    tabIndex: 0,
    role: "region",
    "aria-label": name,
  } as const;
}

// One section: its heading from SECTIONS, and an id the "On this page" list
// and the phone's select jump to.
function Section({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const title = SECTIONS.find((s) => s.id === id)?.title;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-6 flex-col gap-3.5 text-quiet"
    >
      <h2 id={`${id}-heading`} className="text-xl font-semibold text-main">
        {title}
      </h2>
      {children}
    </section>
  );
}
