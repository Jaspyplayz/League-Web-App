import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AskedQuestion } from "@/lib/ask-store";
import { AskBox, AskStatus } from "./ask-box";

vi.mock("@/app/account/actions", () => ({ askAction: vi.fn() }));

const props = {
  region: "na",
  riotId: "Jaspy-CA1",
  playerPath: "/player/na/Jaspy-CA1",
  allowance: { ok: true, left: 5 } as const,
};
const asked: AskedQuestion = { id: "q1", question: "Why do I lose?", answer: "You die early.", games: [], askedAt: new Date() };

describe("AskBox", () => {
  it("lists past questions", () => {
    const html = renderToStaticMarkup(<AskBox {...props} history={[asked]} historyFailed={false} />);
    expect(html).toContain("Why do I lose?");
    expect(html).not.toContain("Couldn&#x27;t load your past questions");
  });

  // #167: a failed read used to look the same as never having asked.
  it("says the past questions couldn't be loaded when the read failed", () => {
    const html = renderToStaticMarkup(<AskBox {...props} history={[]} historyFailed />);
    expect(html).toContain("Couldn&#x27;t load your past questions.");
    expect(html).toContain("Reload to try again.");
    expect(html).not.toContain("text-behind");
  });

  it("shows a limit in place of the question box, with the past questions under it", () => {
    const html = renderToStaticMarkup(
      <AskBox
        {...props}
        allowance={{ ok: false, message: "You've asked 10 questions today. Try again tomorrow." }}
        history={[asked]}
        historyFailed={false}
      />,
    );
    expect(html).toContain("You&#x27;ve asked 10 questions today. Try again tomorrow.");
    expect(html).not.toContain("ask-question");
    expect(html).toContain("Why do I lose?");
  });

  // The match page's Ask panel names its game in the examples.
  it("offers the example questions it's given", () => {
    const html = renderToStaticMarkup(
      <AskBox {...props} history={[]} historyFailed={false} examples={["What decided my Ahri game on Oct 18?"]} />,
    );
    expect(html).toContain("What decided my Ahri game on Oct 18?");
    expect(html).not.toContain("What do my losses have in common?");
  });
});

describe("AskStatus", () => {
  it("shows the question with a grey answer and the waiting line while Claude reads", () => {
    const html = renderToStaticMarkup(<AskStatus error={null} asking="Why do I lose?" />);
    expect(html).toContain("Why do I lose?");
    expect(html).toContain("Reading the games. This can take up to a minute.");
  });

  it("says why a question wasn't answered, in the text colours", () => {
    const html = renderToStaticMarkup(
      <AskStatus error="Couldn't answer right now. Try again in a moment." asking={null} />,
    );
    expect(html).toContain("Couldn&#x27;t answer right now. Try again in a moment.");
    expect(html).not.toContain("Reading the games");
    expect(html).not.toContain("text-behind");
  });

  it("shows nothing otherwise, but keeps the status line for screen readers", () => {
    const html = renderToStaticMarkup(<AskStatus error={null} asking={null} />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("Reading the games");
    // No note and no grey answer: the status line is the only thing drawn.
    expect(html).not.toContain("<div");
  });
});
