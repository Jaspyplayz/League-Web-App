"use client";

import Image from "next/image";
import { maxOrder } from "@/lib/analyzer/build";
import type { BuildItem, BuildView as Build } from "@/lib/match-builds";

const KEYS = ["Q", "W", "E", "R"];

// One player's build: items in the order they were bought, grouped by
// minute, then the order they levelled their abilities. Shown in Build and
// runes on the match page's Stats tab and, until JAS-106 removes it, in the
// Build tab of a profile's match row, which fetches the build when opened.
export function BuildView({ build }: { build: Build }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <h4 className="text-note font-semibold">Item build</h4>
        {build.items.length === 0 ? (
          <p className="text-note text-quiet">No items bought.</p>
        ) : (
          <ol className="flex flex-wrap items-start gap-x-1.5 gap-y-3">
            {build.items.map((batch, i) => (
              <li key={i} className="flex items-start gap-1.5">
                {i > 0 && (
                  <span aria-hidden="true" className="pt-1 text-placeholder">
                    ›
                  </span>
                )}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex gap-0.5">
                    {batch.items.map((item, j) => (
                      <ItemImage key={j} item={item} />
                    ))}
                  </div>
                  <span className="text-xs text-quiet tabular-nums">{batch.minute} min</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <SkillOrder skills={build.skills} />
    </div>
  );
}

// The order a player levelled their abilities, with which they maxed first.
// Its own export because it needs no Data Dragon: Build and runes still shows
// it when the item and rune pictures fail to load.
export function SkillOrder({ skills }: { skills: number[] }) {
  const maxed = maxOrder(skills);
  return (
    <section className="flex flex-col gap-2.5">
      <h4 className="flex items-center gap-3 text-note font-semibold">
        Skill order
        {maxed.length > 0 && (
          <span className="font-normal text-quiet">
            Max {maxed.map((slot) => KEYS[slot - 1]).join(" > ")}
          </span>
        )}
      </h4>
      {skills.length === 0 ? (
        <p className="text-note text-quiet">No skill data.</p>
      ) : (
        <SkillGrid skills={skills} />
      )}
    </section>
  );
}

// A row per ability and a column per level-up, like op.gg: the cell for the
// ability taken at that level shows the level number. Those cells are in the
// text colour, not blue, because this can be any player's build.
function SkillGrid({ skills }: { skills: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-xs tabular-nums">
        <tbody>
          {KEYS.map((key, row) => (
            <tr key={key}>
              <th scope="row" className="w-5 pr-1 text-left font-semibold">
                {key}
              </th>
              {skills.map((slot, level) => (
                <td
                  key={level}
                  className={`size-5 rounded-sm text-center ${slot === row + 1 ? "bg-main text-page" : "bg-raised"}`}
                >
                  {slot === row + 1 ? level + 1 : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemImage({ item }: { item: BuildItem }) {
  if (!item.iconUrl) {
    return <div title={item.name} className="size-6 shrink-0 rounded-sm bg-raised" />;
  }
  // Same as ItemIcon: Data Dragon serves small PNGs, so skip the optimizer.
  return (
    <Image
      src={item.iconUrl}
      alt={item.name}
      title={item.name}
      width={24}
      height={24}
      unoptimized
      className="shrink-0 rounded-sm bg-raised"
    />
  );
}
