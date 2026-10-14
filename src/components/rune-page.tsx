import { RuneIcon } from "@/components/game-icons";
import { statShardName, type DataDragon } from "@/lib/ddragon";
import type { Perks } from "@/lib/riot/types";

// One player's runes, drawn like the in-game rune page: each tree with every
// row of choices, the picked runes lit and the rest faded, then the three
// stat shards. Used by the match panel's Runes tab.
export function RunePage({ dd, perks }: { dd: DataDragon | null; perks: Perks | undefined }) {
  const primary = perks?.styles.find((s) => s.description === "primaryStyle");
  const secondary = perks?.styles.find((s) => s.description === "subStyle");
  if (!perks || !primary || !secondary) {
    return <p className="text-[13px] text-faint">No runes in this game mode.</p>;
  }

  const shards = [perks.statPerks.offense, perks.statPerks.flex, perks.statPerks.defense];
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-5">
      <Tree dd={dd} styleId={primary.style} picked={primary.selections.map((s) => s.perk)} />
      {/* The second tree never offers keystones, so its first row is skipped. */}
      <Tree
        dd={dd}
        styleId={secondary.style}
        picked={secondary.selections.map((s) => s.perk)}
        skipKeystones
      />
      <div className="flex flex-col gap-2">
        <h4 className="font-mono text-[10px] tracking-[0.1em] text-faint uppercase">Shards</h4>
        <ul className="flex flex-col gap-1.5 text-[13px] text-ink-soft">
          {shards.map((id, i) => (
            // The same shard can be picked twice, so key by position.
            <li key={i}>{statShardName(id)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Tree({
  dd,
  styleId,
  picked,
  skipKeystones = false,
}: {
  dd: DataDragon | null;
  styleId: number;
  picked: number[];
  skipKeystones?: boolean;
}) {
  const style = dd?.runeStyles[styleId];
  // Without Data Dragon there's no tree to draw, so just show what was picked.
  const rows = style ? style.slots.slice(skipKeystones ? 1 : 0) : picked.map((id) => [id]);

  return (
    <div className="flex flex-col gap-2.5">
      <h4 className="flex items-center gap-2 text-[13px] font-semibold">
        <RuneIcon dd={dd} runeId={styleId} size={20} />
        {style?.name ?? "Runes"}
      </h4>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          {row.map((runeId) => {
            const isPicked = picked.includes(runeId);
            // Keystones are the big runes at the top of the main tree.
            const size = !skipKeystones && i === 0 ? 34 : 26;
            return (
              <RuneIcon
                key={runeId}
                dd={dd}
                runeId={runeId}
                size={size}
                className={isPicked ? "ring-2 ring-ahead-soft" : "opacity-30 grayscale"}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
