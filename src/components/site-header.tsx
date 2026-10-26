import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "./account-menu";
import { GearIcon, SearchIcon } from "./icons";
import { LogoMark } from "./logo";
import { NavTab } from "./nav-tab";
import { navTabClass } from "./nav-tab-style";

export const REPO_URL = "https://github.com/Jaspyplayz/League-Web-App";

// Soft square icon buttons for search and settings. 12px on a 40px
// button stays a square, which a 20px radius would turn into a circle.
const iconButton =
  "soft-round-sm flex size-10 items-center justify-center border border-frame text-ink-soft transition-colors hover:bg-surface hover:text-ink";

// The "client bar": like the top of the League client. The logo (which also
// takes you home) and a How it works tab on the left; search, settings and
// your account on the right. GitHub lives in the footer.
export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <nav
        aria-label="Main"
        className="mx-auto flex min-h-16 max-w-[1200px] flex-wrap items-stretch gap-x-6 gap-y-2 px-6"
      >
        <Link href="/" className="flex items-center gap-2.5 text-ink">
          <LogoMark />
          <span className="font-display text-[26px] font-bold uppercase tracking-[0.04em]">
            Turnpoint
          </span>
        </Link>
        {/* NavTab reads the URL to underline the page you're on; until it
            loads, the same link shows without the underline. */}
        <Suspense
          fallback={
            <Link href="/how-it-works" className={navTabClass(false)}>
              How it works
            </Link>
          }
        >
          <NavTab href="/how-it-works">How it works</NavTab>
        </Suspense>

        <div className="ml-auto flex items-center gap-2.5 py-3">
          {/* The search box is on the home page; this jumps straight to it. */}
          <Link href="/#riotId" aria-label="Search for a player" className={iconButton}>
            <SearchIcon />
          </Link>
          <Link href="/settings" aria-label="Settings" className={iconButton}>
            <GearIcon />
          </Link>
          {/* Who's signed in depends on the visitor's cookies, so it streams in
              after the rest of the header, which stays prerendered. The
              placeholder holds its space meanwhile so nothing jumps. */}
          <Suspense fallback={<span aria-hidden="true" className="h-10 w-24" />}>
            <AccountMenu />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
