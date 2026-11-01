import { SearchForm } from "@/components/search-form";
import { REGIONS, type Region } from "@/lib/regions";
import type { RiotId } from "@/lib/riot-id";

// Names the Riot ID and region that were searched, then offers the search
// again, filled in, so a typo is one edit away (JAS-93).
export function PlayerNotFound({ region, id }: { region: Region; id: RiotId }) {
  const typed = `${id.gameName}#${id.tagLine}`;
  return (
    <div className="flex max-w-[640px] flex-col gap-3.5">
      <h1 className="text-2xl font-semibold sm:text-title">
        No player called {typed} on {REGIONS[region].label}
      </h1>
      <p className="text-body text-quiet">
        Check the spelling and the tag after the #, or try another region.
      </p>
      <div className="mt-2.5">
        <SearchForm startWith={{ region, riotId: typed }} />
      </div>
    </div>
  );
}
