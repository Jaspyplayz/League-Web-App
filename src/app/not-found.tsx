import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { Eyebrow } from "@/components/ui/eyebrow";

// Shown for any address that doesn't exist, and whenever a page calls
// notFound() (a misspelled region, a broken Riot ID in the link, a match that
// isn't on Riot's servers). Instead of a dead end, it offers the search box,
// since most people land here from a typo in a player or match link.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-12">
      <Eyebrow>404</Eyebrow>
      <h1 className="text-3xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="max-w-[560px] text-muted">
        The link may have a typo in the region, the Riot ID or the match. Search for the
        player again below, or head back to the home page.
      </p>
      <SearchForm />
      <Link href="/" className="text-sm text-muted hover:underline">
        ← Back to the home page
      </Link>
    </main>
  );
}
