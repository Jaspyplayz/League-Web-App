import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HeaderSearch } from "./header-search";
import { SearchForm } from "./search-form";

vi.mock("@/app/actions", () => ({ searchPlayer: vi.fn() }));

// The Riot ID box's starting text, read from the input's own tag.
function riotIdValue(html: string): string | undefined {
  const input = html.match(/<input[^>]*name="riotId"[^>]*>/)?.[0];
  return input?.match(/value="([^"]*)"/)?.[1];
}

function selectedRegion(html: string): string | undefined {
  return html.match(/<option[^>]*selected[^>]*>([^<]*)</)?.[1];
}

describe("SearchForm", () => {
  it("starts with what the player typed, so a typo takes one letter to fix", () => {
    const html = renderToStaticMarkup(<SearchForm startWith={{ region: "kr", riotId: "Faker#KR2" }} />);
    expect(riotIdValue(html)).toBe("Faker#KR2");
    expect(selectedRegion(html)).toBe("KR");
  });

  it("starts empty on NA everywhere else", () => {
    const html = renderToStaticMarkup(<SearchForm />);
    expect(riotIdValue(html)).toBe("");
    expect(selectedRegion(html)).toBe("NA");
  });
});

describe("HeaderSearch", () => {
  it("starts empty, even on a player's region", () => {
    const html = renderToStaticMarkup(<HeaderSearch region="kr" />);
    expect(riotIdValue(html)).toBe("");
    expect(selectedRegion(html)).toBe("KR");
  });
});
