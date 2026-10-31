import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu, MenuSignOut } from "./account-menu";
import { HeaderLink } from "./header-link";
import { HeaderMenu } from "./header-menu";
import { HeaderSearch, HeaderSearchUnlessHome } from "./header-search";
import { HEADER_LINKS, headerLinkClass } from "./header-style";
import { LogoMark } from "./logo";
import { ThemeSwitch } from "./theme-switch";

export const REPO_URL = "https://github.com/Jaspyplayz/League-Web-App";

// The header on every page (JAS-86, take D). On wide screens it's one 68px
// bar in three columns: the logo and two links on the left, the player
// search in the middle, and the theme switch and your account on the right.
// The side columns never shrink below their contents, so on narrower wide
// screens the search gives up the room instead.
// On phones the links move into a menu button, and the search becomes a
// second row under the logo. Home has no search here; its own big box is
// the first thing on the page.
//
// The parts that read the address (the links, the search) or your cookies
// (the account) wait inside <Suspense>, so the rest of the header is
// prerendered and arrives with the first byte of every page.
export function SiteHeader() {
  return (
    // relative: the phone menu drops down from the header's bottom edge.
    <header className="relative border-b border-divider">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 lg:grid lg:h-[68px] lg:grid-cols-[1fr_minmax(0,460px)_1fr] lg:px-10 lg:py-0">
        <div className="-ml-1.5 flex items-center gap-0.5 lg:ml-0 lg:gap-1">
          <HeaderMenu
            signOut={
              <Suspense fallback={null}>
                <MenuSignOut />
              </Suspense>
            }
          />
          <Link
            href="/"
            aria-label="Turnpoint home"
            className="flex items-center gap-2.5 whitespace-nowrap rounded-md text-[17px] font-semibold tracking-[-0.01em] text-main lg:mr-5 lg:text-[19px]"
          >
            <LogoMark className="size-6 lg:size-7" />
            Turnpoint
          </Link>
          <nav aria-label="Main" className="hidden gap-0.5 lg:flex">
            {HEADER_LINKS.map((link) => (
              // Until the address is known, the link shows without the
              // "you're here" fill.
              <Suspense
                key={link.href}
                fallback={
                  <Link href={link.href} className={headerLinkClass(false)}>
                    {link.label}
                  </Link>
                }
              >
                <HeaderLink href={link.href}>{link.label}</HeaderLink>
              </Suspense>
            ))}
          </nav>
        </div>

        {/* Pages whose address is only known per visit (a player, a match)
            show the search while the address loads; only home hides it. */}
        <Suspense fallback={<HeaderSearch />}>
          <HeaderSearchUnlessHome />
        </Suspense>

        <div className="ml-auto flex items-center gap-1.5 lg:col-start-3 lg:justify-self-end">
          <ThemeSwitch />
          {/* Who's signed in depends on the visitor's cookies, so it streams
              in after the rest of the header. The placeholder holds its
              space meanwhile so nothing jumps. */}
          <Suspense fallback={<span aria-hidden="true" className="h-11 w-11 lg:h-10 lg:w-20" />}>
            <AccountMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
