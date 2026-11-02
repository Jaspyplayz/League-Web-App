import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FOCUS_KEY, saveFocus } from "@/lib/focus";
import { FocusButton, FocusPanel } from "./focus";

const player = "kr/hide on bush#kr1";

afterEach(() => vi.unstubAllGlobals());

// The server can't see this browser's focus, so it renders as if none were
// picked, and the browser fills it in after the page loads.
describe("focus on the server", () => {
  function savedFocus() {
    const saved = saveFocus(null, player, { id: "behind-at-10", setAt: Date.UTC(2026, 9, 1) });
    vi.stubGlobal("localStorage", { getItem: (key: string) => (key === FOCUS_KEY ? saved : null) });
  }

  it("offers the focus button, even for the weakness this browser picked", () => {
    savedFocus();
    const html = renderToStaticMarkup(<FocusButton player={player} id="behind-at-10" />);
    expect(html).toContain("Focus on this");
    expect(html).not.toContain("Your focus");
  });

  it("leaves the focus panel out", () => {
    savedFocus();
    const html = renderToStaticMarkup(
      <FocusPanel player={player} games={[]} current={[]} playerPath="/player/kr/Hide%20on%20bush-KR1" />,
    );
    expect(html).toBe("");
  });
});
