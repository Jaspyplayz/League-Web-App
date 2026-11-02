import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

const SPEEDS = [10, 30, 60].map((x) => ({ value: x, name: `${x}×` }));

function speeds(onChange = vi.fn()) {
  return Switch({ label: "Playback speed", options: SPEEDS, value: 30, onChange, look: "solid", className: "bg-panel" });
}

// There's no browser in these tests, so this walks what the switch returns to
// find its buttons.
type ButtonProps = { onClick: () => void; "aria-pressed": boolean; children: string };
function buttons(node: ReactNode): ReactElement<ButtonProps>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === "button") return [node as ReactElement<ButtonProps>];
  return buttons(node.props.children);
}

describe("the switch", () => {
  it("is a named group with only the chosen option pressed", () => {
    const html = renderToStaticMarkup(speeds());
    expect(html).toContain('role="group" aria-label="Playback speed"');
    expect(buttons(speeds()).map((b) => [b.props.children, b.props["aria-pressed"]])).toEqual([
      ["10×", false],
      ["30×", true],
      ["60×", false],
    ]);
  });

  it("hands back the option that was clicked", () => {
    const onChange = vi.fn();
    buttons(speeds(onChange))[2].props.onClick();
    expect(onChange).toHaveBeenCalledWith(60);
  });
});
