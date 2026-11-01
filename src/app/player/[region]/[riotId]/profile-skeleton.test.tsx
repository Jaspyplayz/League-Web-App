import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileSkeleton } from "./profile-skeleton";

describe("ProfileSkeleton", () => {
  const html = renderToStaticMarkup(<ProfileSkeleton label="Looking up Faker#KR1 on Korea" />);

  it("says who is being looked up, for screen readers too", () => {
    expect(html).toMatch(/role="status"[\s\S]*Looking up Faker#KR1 on Korea/);
  });

  // What's already known shows for real; the rest is grey blocks.
  it("shows the tab names for real, with Matches open", () => {
    expect(html).toMatch(/bg-select[^"]*">Matches</);
    expect(html).toContain(">Champions<");
    expect(html).toContain(">Insights<");
    expect(html).toContain("bg-divider");
  });
});
