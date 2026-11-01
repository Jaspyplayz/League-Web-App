import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { Suspense } from "react";
import { HomeExampleLoading, HomeExamplePanel } from "@/components/home-example";
import { LogoMark } from "@/components/logo";
import { SearchForm } from "@/components/search-form";
import { MAP_SIZE } from "@/lib/analyzer/map";
import { RIFT_OUTLINE } from "@/lib/analyzer/rift";
import { championName, getDataDragon } from "@/lib/ddragon";
import { summarizeExample, type HomeExample } from "@/lib/home-example";
import { readSavedGame } from "@/lib/match-store";
import { SAMPLE_MATCH } from "@/lib/sample-match";

// Home (JAS-115): one centred screen, so a first visit sees a real game
// without scrolling. The logo, one sentence, the big search, then the
// example game, whose chart and button both open it. On a 1366×768 laptop
// "Open this game" ends above the browser's 640px or so of page.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-4 pt-6 pb-16 sm:px-6">
      <RiftWalls />
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="flex items-center gap-3 sm:gap-4">
          <LogoMark className="size-9 sm:size-14" />
          <span className="text-4xl leading-none font-semibold tracking-tight sm:text-6xl">
            Turnpoint
          </span>
        </h1>
        <p className="max-w-[580px] text-base text-quiet sm:text-lg">
          Look up any player by Riot ID and see each game minute by minute against the opponent
          in their role.
        </p>
      </div>

      <div className="mt-4">
        <SearchForm />
      </div>

      <div className="mt-6">
        <Suspense fallback={<HomeExampleLoading />}>
          <Example />
        </Suspense>
      </div>
    </main>
  );
}

// Read when someone visits, not at build time: the build has no database,
// and a failed read baked into the page would stay until the next deploy.
async function Example() {
  await connection();
  const example = await loadExample().catch(() => null);
  return <HomeExamplePanel example={example} />;
}

// The sample game never changes, so one read serves every visit for an hour
// instead of two database reads per visit. It throws rather than returning
// null because Next.js doesn't keep a thrown result: after a failed read,
// the next visit tries the database again.
async function loadExample(): Promise<HomeExample> {
  "use cache";
  cacheLife("hours");

  const [game, dd] = await Promise.all([
    readSavedGame(SAMPLE_MATCH.matchId),
    getDataDragon().catch(() => null),
  ]);
  const example =
    game && summarizeExample(game.match, game.timeline, SAMPLE_MATCH, (name) => championName(dd, name));
  if (!example) throw new Error("The example game couldn't be read from the database.");
  return example;
}

// The faint Rift-wall texture JAS-77 kept for home: this season's walls (the
// replay's outline, learned from where champions stood) as thin lines behind
// the page, fading out towards the bottom. Decoration only.
function RiftWalls() {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none fixed inset-0 -z-10 size-full text-main [mask-image:linear-gradient(to_bottom,black_0%,black_45%,transparent_95%)]"
    >
      <path
        d={RIFT_OUTLINE}
        fill="currentColor"
        fillOpacity={0.018}
        stroke="currentColor"
        strokeOpacity={0.07}
        strokeWidth={22}
        strokeLinejoin="round"
        fillRule="evenodd"
      />
    </svg>
  );
}
