import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AskedQuestion } from "@/lib/ask-store";
import { AskBox } from "./ask-box";

vi.mock("@/app/account/actions", () => ({ askAction: vi.fn() }));

const props = { region: "na", riotId: "Jaspy-CA1", playerPath: "/player/na/Jaspy-CA1", left: 5 };
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
    expect(html).toContain("Couldn&#x27;t load your past questions. Reload to try again.");
  });
});
