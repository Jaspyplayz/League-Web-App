// Summoner's Rift, under the champions on the replay's map (replay-map.tsx):
// Riot's own minimap picture from Data Dragon, over a drawing of this
// season's walls (rift.ts) in the same colors. The drawing shows while the
// picture loads, or for good when Data Dragon can't be reached. The walls
// learned from the games line up with the picture's (docs/replay.md), so
// champions walking around them stay on its paths.
//
// Both fill the map's box. Riot's map coordinates run from 0 to about 14,900
// on both axes, with the blue base at the bottom left. The drawing uses the
// same units, flipped vertically because SVG's y axis points down.

import Image from "next/image";
import { MAP_SIZE } from "@/lib/analyzer/map";
import { RIFT_OUTLINE } from "@/lib/analyzer/rift";

const SIZE = MAP_SIZE;

// The walls' outline has a loop around the edge of the ground and one around
// each wall, so with a square around the whole map, "evenodd" fills what's
// outside the ground and inside the walls.
const WALLS = `M-200 -200H${SIZE + 200}V${SIZE + 200}H-200Z${RIFT_OUTLINE}`;

// Where Riot's picture sits, in map units: found by moving and scaling it
// until its walls lined up best with the learned ones.
const PICTURE = { left: 50, top: 125, size: 14_700 };
const share = (units: number) => `${(units / SIZE) * 100}%`;

export function MapBackground({ pictureUrl }: { pictureUrl: string | null }) {
  return (
    <>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
        className="absolute inset-0 size-full"
      >
        {/* Classes rather than fill="var(--color-rift-ground)": Tailwind
            only keeps the colors its classes use. */}
        <rect width={SIZE} height={SIZE} className="fill-rift-ground" />
        {/* The outline runs where champions stop, at their middle, so a
            thin stroke takes the walls out to about where the game draws
            them. */}
        <path
          d={WALLS}
          className="fill-rift-wall stroke-rift-wall"
          fillRule="evenodd"
          strokeWidth={100}
          strokeLinejoin="round"
        />
      </svg>
      {pictureUrl && (
        // `unoptimized` like the other game images: Data Dragon serves it
        // from a fast CDN. Pictures load lazily, so it waits until the
        // replay is on screen.
        <Image
          src={pictureUrl}
          alt=""
          width={512}
          height={512}
          unoptimized
          className="absolute"
          style={{
            left: share(PICTURE.left),
            top: share(PICTURE.top),
            width: share(PICTURE.size),
            height: share(PICTURE.size),
          }}
        />
      )}
    </>
  );
}
