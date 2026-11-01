import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readQueueFilter } from "@/lib/queue-filters";
import { MatchesControls, matchesHref, readMatchesView } from "./queue-tabs";

const PATH = "/player/kr/Faker-KR1";

describe("readMatchesView", () => {
  it("reads ?view=day as By day and anything else as List", () => {
    expect(readMatchesView("day")).toBe("day");
    expect(readMatchesView(undefined)).toBe("list");
    expect(readMatchesView("log")).toBe("list");
    expect(readMatchesView(["day", "day"])).toBe("list");
  });
});

describe("matchesHref", () => {
  it("needs no query for the default queue in List", () => {
    expect(matchesHref(PATH, "all", "list")).toBe(PATH);
  });

  it("keeps both the queue and By day", () => {
    expect(matchesHref(PATH, "solo", "day")).toBe(`${PATH}?queue=solo&view=day`);
  });

  // Champions opens on Ranked Solo/Duo, so its All link needs ?queue=all.
  it("leaves out only the page's own default queue", () => {
    expect(matchesHref(`${PATH}/champions`, "solo", "list", "solo")).toBe(`${PATH}/champions`);
    expect(matchesHref(`${PATH}/champions`, "all", "list", "solo")).toBe(
      `${PATH}/champions?queue=all`,
    );
  });
});

describe("MatchesControls", () => {
  const hrefs = (html: string, label: string) =>
    [...html.matchAll(new RegExp(`<nav aria-label="${label}"[^]*?</nav>`, "g"))]
      .flatMap(([nav]) => [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&")));

  it("switches view and keeps the picked queue", () => {
    const html = renderToStaticMarkup(
      <MatchesControls playerPath={PATH} queue={readQueueFilter("flex")} view="list" />,
    );
    expect(hrefs(html, "Matches view")).toEqual([`${PATH}?queue=flex`, `${PATH}?queue=flex&view=day`]);
    expect(html).toMatch(/aria-current="page"[^>]*>List</);
  });

  // Picking a queue while By day is open stays in By day.
  it("keeps By day on every queue link", () => {
    const html = renderToStaticMarkup(
      <MatchesControls playerPath={PATH} queue={readQueueFilter("all")} view="day" />,
    );
    const queues = hrefs(html, "Game mode");
    expect(queues[0]).toBe(`${PATH}?view=day`);
    expect(queues.every((href) => href.endsWith("view=day"))).toBe(true);
    expect(html).toMatch(/aria-current="page"[^>]*>By day</);
  });
});
