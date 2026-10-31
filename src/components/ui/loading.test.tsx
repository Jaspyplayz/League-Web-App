import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LoadingBlock,
  LoadingSection,
  LoadingStatus,
  SLOW_ANSWER_LINE,
  StatusLine,
  whenRiotIsSlow,
} from "./loading";

describe("the 8-second slow-answer line", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits a full 8 seconds before saying Riot is slow", () => {
    const onSlow = vi.fn();
    whenRiotIsSlow(onSlow);

    vi.advanceTimersByTime(7_999);
    expect(onSlow).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSlow).toHaveBeenCalledOnce();
  });

  it("says nothing if the section finished loading first", () => {
    const onSlow = vi.fn();
    const stop = whenRiotIsSlow(onSlow);

    vi.advanceTimersByTime(5_000);
    stop();
    vi.advanceTimersByTime(10_000);
    expect(onSlow).not.toHaveBeenCalled();
  });
});

describe("the loading status line", () => {
  it("starts with only what's being fetched", () => {
    const html = renderToStaticMarkup(<LoadingStatus label="Looking up Faker#KR1 on Korea" />);
    expect(html).toContain("Looking up Faker#KR1 on Korea");
    expect(html).not.toContain(SLOW_ANSWER_LINE);
  });

  it("adds the slow line once Riot is slow", () => {
    const html = renderToStaticMarkup(<StatusLine label="Analyzing the game" slow />);
    expect(html).toContain("Analyzing the game");
    expect(html).toContain("Riot is slow to answer. Still trying.");
  });
});

describe("a loading section", () => {
  it("reads the status line to screen readers and hides the grey blocks from them", () => {
    const html = renderToStaticMarkup(
      <LoadingSection label="Looking up Faker#KR1 on Korea">
        <LoadingBlock className="h-12 w-64" />
      </LoadingSection>,
    );
    expect(html).toMatch(/role="status"><p[^>]*>.*Looking up Faker#KR1 on Korea/);
    // A busy live region holds its changes back, so the slow line would go unread.
    expect(html).not.toContain("aria-busy");
    expect(html).toMatch(/aria-hidden="true" class="[^"]*bg-divider[^"]*h-12 w-64/);
  });
});
