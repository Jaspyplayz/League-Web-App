import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "@/app/global-error";
import { UnexpectedError } from "./unexpected-error";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/font/google", () => ({ Rubik: () => ({ variable: "font-rubik" }) }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const error = new Error("boom");
const retry = () => {};

describe("an error nobody planned for", () => {
  it("says something went wrong, offers Try again and a way home", () => {
    const html = renderToStaticMarkup(<UnexpectedError error={error} retry={retry} />);
    expect(html).toContain("Something went wrong");
    expect(html).toContain("This page hit an error we didn&#x27;t expect. It&#x27;s been reported.");
    expect(html).toContain(">Try again<");
    expect(html).toMatch(/href="\/"[^>]*>Back to the home page</);
  });

  it("draws the whole-site page with its own logo, since it has no header", () => {
    const html = renderToStaticMarkup(<GlobalError error={error} retry={retry} />);
    expect(html).toMatch(/<a href="\/"[^>]*>.*>T<\/span>Turnpoint<\/a>/);
    expect(html).toContain("Something went wrong");
    expect(html).toContain("The site hit an error we didn&#x27;t expect.");
    expect(html).toContain(">Try again<");
  });
});
