import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileTabs } from "./profile-tabs";

describe("ProfileTabs", () => {
  const html = renderToStaticMarkup(<ProfileTabs playerPath="/player/kr/Faker-KR1" current="insights" />);
  const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);

  it("has three tabs, Matches, Champions and Insights, with no Log", () => {
    expect(links).toEqual([
      ["/player/kr/Faker-KR1", "Matches"],
      ["/player/kr/Faker-KR1/champions", "Champions"],
      ["/player/kr/Faker-KR1/insights", "Insights"],
    ]);
  });

  it("marks the open tab for screen readers", () => {
    expect(html).toMatch(/aria-current="page"[^>]*>Insights</);
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });
});
