import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countDown, TryAgainButton } from "./try-again-button";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("the Try again countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks down once a second and stops at zero", () => {
    const onTick = vi.fn();
    countDown(3, onTick);

    vi.advanceTimersByTime(999);
    expect(onTick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTick).toHaveBeenLastCalledWith(2);
    vi.advanceTimersByTime(2_000);
    expect(onTick.mock.calls).toEqual([[2], [1], [0]]);

    vi.advanceTimersByTime(5_000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it("stops when cancelled", () => {
    const onTick = vi.fn();
    const stop = countDown(10, onTick);
    vi.advanceTimersByTime(1_000);
    stop();
    vi.advanceTimersByTime(10_000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});

describe("Try again", () => {
  it("can be pressed straight away when there's no wait", () => {
    const html = renderToStaticMarkup(<TryAgainButton />);
    expect(html).toContain(">Try again<");
    expect(html).not.toContain(`disabled=""`);
  });

  it("shows the seconds left on the button during a rate limit", () => {
    const html = renderToStaticMarkup(<TryAgainButton waitSeconds={7} />);
    expect(html).toContain("Try again in 7s");
    expect(html).toContain(`disabled=""`);
  });
});
