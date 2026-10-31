import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RiotErrorNotice } from "@/components/riot-error-notice";
import { RiotApiError } from "@/lib/riot/client";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import { EmptyPanel, ProblemPanel } from "./state-panel";

// The Riot client is server-only; the tests only build its error objects.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Riot's status page is a live call; these tests are about the panel.
vi.mock("@/components/riot-status", () => ({ RiotStatus: () => null }));

// Classes that would colour a problem: blue and red mean you and the
// opponent, and amber was the old warning box.
const ALARM_COLOURS = /\b(?:text|bg|border)-(?:ahead|behind|amber|red|blue|yellow|orange)\b/;

describe("the empty panel", () => {
  it("names what's missing and offers one way forward", () => {
    const html = renderToStaticMarkup(
      <EmptyPanel title="No Ranked Solo/Duo games in the last two months" action={<a href="?">Show every mode</a>}>
        Games show up here a few minutes after they end.
      </EmptyPanel>,
    );
    expect(html).toContain("No Ranked Solo/Duo games in the last two months");
    expect(html).toContain("Show every mode");
    expect(html).not.toContain('role="alert"');
  });
});

describe("the problem panel", () => {
  it("draws a neutral ! circle with what happened and what to do", () => {
    const html = renderToStaticMarkup(
      <ProblemPanel title="Riot's servers didn't answer" actions={<button>Try again</button>}>
        <p>This is usually brief.</p>
      </ProblemPanel>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/aria-hidden="true"[^>]*>!<\/span>/);
    expect(html).toContain("Riot&#x27;s servers didn&#x27;t answer");
    expect(html).not.toMatch(ALARM_COLOURS);
  });
});

describe("Riot's errors", () => {
  const render = (kind: RiotApiError["kind"], retryAfter?: number) =>
    renderToStaticMarkup(<RiotErrorNotice error={new RiotApiError(kind, "test", retryAfter)} />);

  it("counts a rate limit down on Try again", () => {
    expect(render("rate-limited", 30)).toContain("Try again in 30s");
  });

  it("offers Try again and the example game when Riot didn't answer", () => {
    const html = render("unavailable");
    expect(html).toContain(">Try again<");
    expect(html).toContain(SAMPLE_MATCH_HREF);
  });

  it("doesn't offer Try again for a broken key, which retrying can't fix", () => {
    const html = render("bad-key");
    expect(html).not.toContain("Try again");
    expect(html).toContain(SAMPLE_MATCH_HREF);
  });

  it("sends a player with no profile in the region home, not to the example game", () => {
    const html = render("not-found");
    expect(html).not.toContain(SAMPLE_MATCH_HREF);
    expect(html).toContain('href="/"');
  });

  it("never colours a problem amber, red or blue", () => {
    for (const kind of ["rate-limited", "bad-key", "not-found", "unavailable"] as const) {
      expect(render(kind, 5)).not.toMatch(ALARM_COLOURS);
    }
  });
});
