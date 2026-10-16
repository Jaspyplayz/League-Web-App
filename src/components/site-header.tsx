import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "./account-menu";
import { LogoMark } from "./logo";
import { GitHubIcon } from "./icons";

export const REPO_URL = "https://github.com/Jaspyplayz/League-Web-App";

const navLink =
  "flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] text-ink-soft transition-colors hover:bg-surface hover:text-ink";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-4"
      >
        <Link href="/" className="flex items-center gap-2.5 text-ink">
          <LogoMark />
          <span className="font-display text-[26px] font-bold uppercase tracking-[0.02em]">
            Turnpoint
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-1">
          <Link href="/how-it-works" className={navLink}>
            How it works
          </Link>
          <a href={REPO_URL} className={navLink}>
            <GitHubIcon />
            GitHub
          </a>
          <Link href="/settings" className={navLink}>
            Settings
          </Link>
          {/* Who's signed in depends on the visitor's cookies, so it streams in
              after the rest of the header, which stays prerendered. */}
          <Suspense>
            <AccountMenu linkClassName={navLink} />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
