import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { secondButtonClass } from "@/components/ui/state-panel";
import { SAMPLE_MATCH_HREF } from "@/lib/sample-match";

// Shown for any address that doesn't exist, and whenever a page calls
// notFound() (a misspelled region, a broken Riot ID in the link, a match that
// isn't on Riot's servers). Instead of a dead end, it offers the search box,
// since most people land here from a typo in a player or match link, plus the
// example game and the home page. No "404" label: the heading says it.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:py-16">
      <div className="flex max-w-[640px] flex-col gap-3.5">
        <h1 className="text-2xl font-semibold sm:text-[28px]">We couldn&apos;t find that page</h1>
        <p className="text-body text-quiet">
          The link may have a typo in the region, the Riot ID or the match. Search for the
          player again, or open the example game.
        </p>
        <div className="mt-2.5">
          <SearchForm />
        </div>
        <div className="mt-1.5 flex flex-col gap-2.5 sm:flex-row">
          <Link href={SAMPLE_MATCH_HREF} className={secondButtonClass}>
            See the example game
          </Link>
          <Link href="/" className={secondButtonClass}>
            Back to the home page
          </Link>
        </div>
      </div>
    </main>
  );
}
