import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalSetting } from "@/components/use-local-setting";
import { FOCUS_KEY, saveFocus } from "@/lib/focus";
import { FocusButton, FocusPanel } from "./focus";

// The real hook, wrapped so a test can stand in for the browser's side.
vi.mock("@/components/use-local-setting", async (real) => ({
  useLocalSetting: vi.fn((await real<typeof import("@/components/use-local-setting")>()).useLocalSetting),
}));

const player = "kr/hide on bush#kr1";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(useLocalSetting).mockReset();
});

// Players' browsers already hold their focus under this name, so reading
// another one would lose it.
it("shows the focus this browser saved under turnpoint:focus", () => {
  const saved = saveFocus(null, player, { id: "behind-at-10", setAt: Date.UTC(2026, 9, 1) });
  vi.mocked(useLocalSetting).mockImplementation((key) => (key === "turnpoint:focus" ? saved : null));
  expect(renderToStaticMarkup(<FocusButton player={player} id="behind-at-10" />)).toContain("Your focus");
});

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
