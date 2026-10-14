"use client";

import Image from "next/image";
import { maxOrder } from "@/lib/analyzer/build";
import type { BuildItem, BuildView as Build } from "@/lib/match-builds";

const KEYS = ["Q", "W", "E", "R"];

// One player's build in the Build tab: items in the order they were bought,
// grouped by minute, then the order they levelled their abilities. Runs in
// the browser because the build is fetched when the tab is first opened.
export function BuildView({ build }: { build: Build }) {
  const maxed = maxOrder(build.skills);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <h4 className="font-mono text-[10px] tracking-[0.1em] text-faint uppercase">Item build</h4>
        {build.items.length === 0 ? (
          <p className="text-[13px] text-faint">No items bought.</p>
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
                  <span className="font-mono text-[10px] text-faint">{batch.minute} min</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <h4 className="flex items-center gap-3 font-mono text-[10px] tracking-[0.1em] text-faint uppercase">
          Skill order
          {maxed.length > 0 && (
            <span className="font-sans text-[13px] tracking-normal text-ink-soft normal-case">
              Max {maxed.map((slot) => KEYS[slot - 1]).join(" > ")}
            </span>
          )}
        </h4>
        {build.skills.length === 0 ? (
          <p className="text-[13px] text-faint">No skill data.</p>
        ) : (
          <SkillGrid skills={build.skills} />
        )}
      </section>
    </div>
  );
}

// A row per ability and a column per level-up, like op.gg: the cell for the
// ability taken at that level shows the level number.
function SkillGrid({ skills }: { skills: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 font-mono text-[11px]">
        <tbody>
          {KEYS.map((key, row) => (
            <tr key={key}>
              <th scope="row" className="w-5 pr-1 text-left font-semibold text-ink-soft">
                {key}
              </th>
              {skills.map((slot, level) => (
                <td
                  key={level}
                  className={`size-5 rounded-[4px] text-center ${slot === row + 1 ? "bg-ahead/80 text-page" : "bg-line"}`}
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
    return <div title={item.name} className="size-6 shrink-0 rounded bg-line" />;
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
      className="shrink-0 rounded bg-line"
    />
  );
}
