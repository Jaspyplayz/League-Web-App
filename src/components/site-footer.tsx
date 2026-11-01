import Link from "next/link";
import { REPO_URL } from "./site-header";
import { linkClass } from "./ui/state-panel";

export function SiteFooter() {
  return (
    <footer className="border-t border-divider">
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-4 px-6 pb-10 pt-7 text-note text-quiet">
        {/* Riot's API terms require this notice on every page. */}
        <p className="max-w-[760px]">
          Turnpoint isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or
          opinions of Riot Games or anyone officially involved in producing or managing Riot
          Games properties. Riot Games and all associated properties are trademarks or
          registered trademarks of Riot Games, Inc.
        </p>
        <p>
          Built by Jasper ·{" "}
          <a href={REPO_URL} className={linkClass}>
            Source on GitHub
          </a>{" "}
          ·{" "}
          <Link href="/privacy" className={linkClass}>
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className={linkClass}>
            Terms
          </Link>
        </p>
      </div>
    </footer>
  );
}
