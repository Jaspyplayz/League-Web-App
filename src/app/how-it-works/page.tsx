import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { REPO_URL } from "@/components/site-header";
import {
  rankModelHelps,
  WIN_CHANCE_FEATURES,
  whatIfChance,
  withRank,
  type Evaluation,
} from "@/lib/analyzer/win-chance";
import { SCORE_MODEL } from "@/lib/game-score";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import { WIN_CHANCE_MODEL } from "@/lib/win-chance";
import { WhatIfCalculator, type RankWeights } from "./what-if-calculator";

export const metadata: Metadata = {
  title: "How it works",
  description: "How Turnpoint gets its data, finds turning points, and trains its two models.",
};

// A plain-language tour of what's behind the numbers. The model figures are
// read from the saved model files, so this page stays right after a retrain.
export default function HowItWorksPage() {
  const winChance = WIN_CHANCE_MODEL;
  const byMinute = winChance.evaluation.byMinute;
  // The weights that matter, biggest first; the ones near 0 are explained below.
  const weights = WIN_CHANCE_FEATURES.map((f, i) => ({
    label: f.label,
    weight: winChance.weights[i],
  }))
    .filter((w) => Math.abs(w.weight) >= 0.05)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  // Ranks whose own model clearly beat the all-ranks model, so the match
  // page uses it. Only the weights go to the browser, not the test results.
  const usedRanks = winChance.ranks.filter(rankModelHelps);
  const ranks: RankWeights[] = [
    { label: winChance.rank, weights: winChance.weights },
    ...usedRanks.map((r) => ({ label: r.label, weights: r.weights })),
  ];
  // What 3,000 gold and 2,000 XP ahead at 20:00 is worth, by rank.
  const lead = { minute: 20, goldLead: 3000, xpLead: 2000, dragonLead: 0, inhibitorLead: 0, baron: 0 } as const;
  const at20 = (e: Evaluation) => e.byMinute.find((m) => m.minute === 20)?.accuracy ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-12 px-6 pb-[88px] pt-14">
      <div className="flex flex-col gap-3">
        <Eyebrow>Under the hood</Eyebrow>
        <h1 className="font-display text-5xl font-bold uppercase tracking-[0.01em]">
          How Turnpoint works
        </h1>
        <p className="text-body text-muted">
          Where the numbers come from, how the two trained models work, and how good they are. Want
          to see it first?{" "}
          <Link href={SAMPLE_MATCH_HREF} className="text-ahead-soft hover:text-ahead-bright">
            Open a sample analysis
          </Link>
          .
        </p>
      </div>

      <Section title="1. The data">
        <p>
          Everything comes from Riot Games&apos; official API: match results, and a timeline of
          every game with each player&apos;s gold, XP, CS and position once a minute, plus every
          kill and objective. Riot allows 100 requests every 2 minutes, so every request goes
          through one rate-limited client that waits its turn and retries when Riot says &quot;slow
          down&quot;.
        </p>
        <p>
          A finished game never changes, so each match and timeline is fetched once and kept in
          Postgres forever. A player&apos;s rank and match list go stale, so those expire after a
          day or when you press Update. Most page views make no Riot calls at all.
        </p>
      </Section>

      <Section title="2. Turning points">
        <p>
          The match page compares you with the enemy player in your role, minute by minute, and
          looks for the moments the gap moved: a death, a lost objective, a missed wave. It&apos;s
          plain code, not machine learning: pure functions that take a game in and give findings
          out, each with unit tests on small made-up games.
        </p>
        <p>
          It describes what happened and leaves the judging to you. A gank into a losing lane can be
          right or wrong depending on things the data can&apos;t see.
        </p>
      </Section>

      <Section title="3. Win chance">
        <p>
          At every minute, each team&apos;s chance of winning, like the line on a sports broadcast.
          It&apos;s logistic regression: the model looks at how far ahead one team is (gold, XP,
          dragons, Baron, inhibitors and more), multiplies each lead by a weight it learned, adds
          them up and squashes the total into a chance between 0% and 100%. An even game is always
          exactly 50%.
        </p>
        <p>
          It learned its weights from{" "}
          <strong className="text-ink">
            {winChance.games.toLocaleString("en-US")} ranked games
          </strong>{" "}
          on patches {winChance.patches[0]} to {winChance.patches.at(-1)}. The ones that matter:
        </p>
        <Panel className="overflow-x-auto p-0">
          <table className="w-full text-body">
            <thead className="text-left font-mono text-label uppercase tracking-[0.12em] text-faint">
              <tr>
                <th className="px-4 py-2.5 font-normal">Lead</th>
                <th className="px-4 py-2.5 text-right font-normal">Weight</th>
              </tr>
            </thead>
            <tbody>
              {weights.map((w) => (
                <tr key={w.label} className="border-t border-line">
                  <td className="px-4 py-2">{w.label}</td>
                  <td
                    className={`px-4 py-2 text-right font-mono ${w.weight > 0 ? "text-ahead-soft" : "text-behind"}`}
                  >
                    {w.weight.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <p>
          Kills and towers get almost no weight. Not because they don&apos;t matter, but because
          they pay gold, and the gold lead already counts that gold. The negative &quot;times
          minutes / 30&quot; weight means a gold lead counts for less late in the game, when
          everyone is close to a full build.
        </p>

        <h3 className="pt-2 text-lg font-semibold text-ink">Try it yourself</h3>
        <WhatIfCalculator ranks={ranks} />

        <h3 className="pt-2 text-lg font-semibold text-ink">How good is it?</h3>
        <p>
          Tested on games it never saw during training (5-fold cross-validation, with every minute
          of a game kept in the same group so it can&apos;t peek at the result). The comparison is
          the simplest rule there is: &quot;the team with more gold wins&quot;.
        </p>
        <Panel className="overflow-x-auto p-0">
          <table className="w-full text-body">
            <thead className="text-left font-mono text-label uppercase tracking-[0.12em] text-faint">
              <tr>
                <th className="px-4 py-2.5 font-normal">Minute</th>
                <th className="px-4 py-2.5 text-right font-normal">Model</th>
                <th className="px-4 py-2.5 text-right font-normal">More gold wins</th>
              </tr>
            </thead>
            <tbody>
              {byMinute.map((m) => (
                <tr key={m.minute} className="border-t border-line">
                  <td className="px-4 py-2 font-mono">{m.minute}:00</td>
                  <td className="px-4 py-2 text-right font-mono text-ink">{percent(m.accuracy)}</td>
                  <td className="px-4 py-2 text-right font-mono">{percent(m.goldRule)}</td>
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

        {winChance.ranks.length > 0 && (
          <>
            <h3 className="pt-2 text-lg font-semibold text-ink">Does rank matter?</h3>
            <p>
              Maybe leads are worth less in Iron, where games get thrown more often. To check, each
              rank (and Emerald+ and Master+) got a model of its own, trained only on games at that
              rank, and both were tested on that rank&apos;s games they hadn&apos;t seen.
            </p>
            <Panel className="overflow-x-auto p-0">
              <table className="w-full text-body">
                <thead className="text-left font-mono text-label uppercase tracking-[0.12em] text-faint">
                  <tr>
                    <th className="px-4 py-2.5 font-normal">Rank</th>
                    <th className="px-4 py-2.5 text-right font-normal">Games</th>
                    <th className="px-4 py-2.5 text-right font-normal">Own model at 20:00</th>
                    <th className="px-4 py-2.5 text-right font-normal">All ranks at 20:00</th>
                    <th className="px-4 py-2.5 text-right font-normal">3k gold up at 20:00</th>
                  </tr>
                </thead>
                <tbody>
                  {winChance.ranks.map((r) => (
                    <tr key={r.key} className="border-t border-line">
                      <td className="px-4 py-2">{r.label}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {r.games.toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-ink">
                        {percent(at20(r.evaluation))}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{percent(at20(r.allRanks))}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {percent(whatIfChance(withRank(winChance, r), lead))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <p>
              {usedRanks.length === 0
                ? "No rank's own model did clearly better than the all-ranks model, so every game uses the all-ranks one. A lead is worth about the same in Iron as in Challenger, and the all-ranks model learned from far more games."
                : `Where a rank's own model did clearly better (${usedRanks.map((r) => r.label).join(", ")}), the match page uses it for players at that rank, and you can pick it in the calculator above. Everywhere else, the all-ranks model was just as good and learned from far more games.`}
            </p>
          </>
        )}
      </Section>

      <Section title="4. Game score">
        <p>
          Every player gets a score from 0 to 100, with MVP for the best player on the winning team
          and ACE for the best on the losing team. It&apos;s also logistic regression, on ten
          end-of-game stats (KDA, deaths, kill participation, damage, gold share, CS, vision,
          objective damage and more), trained to predict who won.
        </p>
        <p>
          Two details make it fair across roles. Each stat is first compared with what&apos;s normal
          for your role, since a support&apos;s damage is low by design. And the score is a
          percentile, not a chance of winning: 73 means you rated higher than 73% of players in your
          role in our games, so a great game in a loss still scores well.
        </p>
        <p>
          The current model was trained on {SCORE_MODEL.games.toLocaleString("en-US")} games and
          picks the winning side{" "}
          <strong className="text-ink">{percent(SCORE_MODEL.shared.accuracy)}</strong> of the time
          on games it didn&apos;t see, where a coin flip would get 50%.
        </p>
      </Section>

      <Section title="5. What it won't do">
        <p>
          No live-game help, no rank or MMR guesses, and no telling you what you should have done.
          Riot&apos;s developer policy rules those out, and they&apos;d be wrong often enough that
          you&apos;d stop trusting the rest.
        </p>
        <p>
          The code is open:{" "}
          <a href={REPO_URL} className="text-ahead-soft hover:text-ahead-bright">
            Source on GitHub
          </a>
          , with the full write-ups in{" "}
          <a
            href={`${REPO_URL}/blob/main/docs/win-chance.md`}
            className="text-ahead-soft hover:text-ahead-bright"
          >
            docs/win-chance.md
          </a>{" "}
          and{" "}
          <a
            href={`${REPO_URL}/blob/main/docs/game-score.md`}
            className="text-ahead-soft hover:text-ahead-bright"
          >
            docs/game-score.md
          </a>
          .
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 text-body leading-relaxed text-muted">
      <SectionHeading className="text-3xl text-ink">{title}</SectionHeading>
      {children}
    </section>
  );
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}
