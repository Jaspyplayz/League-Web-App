import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { SignInLink } from "./sign-in-link";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

function render(pathname: string, hideOnSignInPage?: boolean): string {
  vi.mocked(usePathname).mockReturnValue(pathname);
  return renderToStaticMarkup(<SignInLink className="x" hideOnSignInPage={hideOnSignInPage} />);
}

describe("SignInLink", () => {
  it("hides the header's button on the sign-in page, where it would lead back to itself", () => {
    expect(render("/sign-in", true)).toBe("");
  });

  it("brings the player back to the page they were on after signing in", () => {
    expect(render("/how-it-works", true)).toContain('href="/sign-in?next=%2Fhow-it-works"');
  });

  it("still shows a plain link on the sign-in page when not asked to hide", () => {
    expect(render("/sign-in")).toContain('href="/sign-in"');
  });
});
