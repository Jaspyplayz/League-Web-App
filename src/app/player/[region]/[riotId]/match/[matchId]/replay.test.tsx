import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import stompGame from "@/lib/analyzer/fixtures/stomp.json";
import { analyzeMatch } from "@/lib/analyzer/index";
import { replayChances } from "@/lib/analyzer/plays";
import type { TrimmedTimeline } from "@/lib/analyzer/trim";
import type { Match } from "@/lib/riot/types";
import { matchWinChance } from "@/lib/win-chance";
import { Replay } from "./replay";
import { GRADE_CHIP } from "./replay-plays";
import { TempoReadout } from "./tempo";

// One of the golden tests' real games (src/lib/analyzer/fixtures), seen from
// Talon, red side's jungler, so it has plays and the tempo strip.
const game = stompGame as unknown as { match: Match; timeline: TrimmedTimeline };
const ME = 7;
const analysis = analyzeMatch(game.match, game.timeline, `golden-player-${ME}`)!;
const me = game.match.info.participants.find((p) => p.participantId === ME)!;
const winChance = matchWinChance(game.match, game.timeline, me.teamId, null)!;
const chances = replayChances(game.timeline, analysis.replay, winChance.model, ME)!;
const people = game.match.info.participants.map((p) => ({
  participantId: p.participantId,
  teamId: p.teamId,
  name: p.championName,
  iconUrl: null,
  tag: null,
}));

function renderReplay(tempo: typeof analysis.tempo) {
  return renderToStaticMarkup(
    <Replay
      replay={analysis.replay}
      chances={chances}
      tempo={tempo}
      people={people}
      items={{}}
      winningTeamId={game.match.info.participants.find((p) => p.win)!.teamId}
      mapUrl={null}
      docsHref="/docs/replay"
      tempoDocsHref="/docs/tempo"
    />,
  );
}

describe("Replay", () => {
  // JAS-109: the play list, the play bar and the timeline show grades the way
  // the Review board does, not as the old pills.
  it("shows every play's grade as a grade mark", () => {
    const html = renderReplay(null);
    // Grade marks are SVG circles; the timeline's dots are plain spans, so
    // they can't stand in for the list's marks.
    const marks = html.match(/<svg[^>]*data-grade="[A-Za-z]+"/g) ?? [];
    expect(marks.length).toBeGreaterThanOrEqual(chances.plays.length);
    for (const play of chances.plays) {
      expect(html).toMatch(new RegExp(`<svg[^>]*data-grade="${play.grade}"`));
    }
    for (const pill of Object.values(GRADE_CHIP)) expect(html).not.toContain(pill);
  });

  // The beta note above the replay says it's a beta, so the replay itself
  // has no badge; Jungle tempo keeps its own.
  it("has no Beta badge of its own", () => {
    expect(renderReplay(null)).not.toContain(">Beta<");
  });

  it("keeps the Beta mark on Jungle tempo", () => {
    const html = renderToStaticMarkup(
      <TempoReadout
        tempo={analysis.tempo!}
        t={600_000}
        names={Object.fromEntries(people.map((p) => [p.participantId, p.name]))}
        myTeamId={me.teamId}
        docsHref="/docs/tempo"
      />,
    );
    expect(html).toContain("Jungle tempo");
    expect(html).toContain(">Beta<");
  });
});
