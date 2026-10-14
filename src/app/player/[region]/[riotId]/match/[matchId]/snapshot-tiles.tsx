import { formatSigned } from "@/lib/analyzer/format";
import type { Metric, Snapshot } from "@/lib/analyzer/matchup";
import { PanelHeading } from "@/components/ui/panel-heading";
import { panelClass } from "@/components/ui/panel";

const TILE_LABELS: Record<Metric, string> = {
  gold: "Gold",
  cs: "CS",
  xp: "XP",
  damage: "Damage to champions",
};

// "At 10 minutes": one tile per stat, with the difference and a bar each
// for you and your opponent.
export function SnapshotTiles({ snapshot }: { snapshot: Snapshot }) {
  const id = `at-${snapshot.minute}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3.5">
      <PanelHeading id={id}>At {snapshot.minute} minutes</PanelHeading>
      <ul className="flex flex-wrap gap-3">
        {(Object.keys(TILE_LABELS) as Metric[]).map((metric) => (
          <Tile
            key={metric}
            label={TILE_LABELS[metric]}
            you={snapshot.you[metric]}
            opponent={snapshot.opponent[metric]}
          />
        ))}
      </ul>
    </section>
  );
}

function Tile({ label, you, opponent }: { label: string; you: number; opponent: number }) {
  const diff = you - opponent;
  const color = diff > 0 ? "text-ahead" : diff < 0 ? "text-behind" : "text-muted";
  // Bars are relative to whoever has more, so the bigger one is always full.
  const max = Math.max(you, opponent, 1);

  return (
    <li className={`${panelClass} flex min-w-0 flex-[1_1_220px] flex-col gap-2.5 px-5 py-[18px]`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted">{label}</span>
        <span className={`font-mono text-2xl font-medium ${color}`}>{formatSigned(diff)}</span>
      </div>
      <div className="flex flex-col gap-1.5 font-mono text-xs text-faint">
        <Bar who="You" value={you} pct={(you / max) * 100} color="bg-ahead" />
        <Bar who="Opp" value={opponent} pct={(opponent / max) * 100} color="bg-behind" />
      </div>
    </li>
  );
}

function Bar({
  who,
  value,
  pct,
  color,
}: {
  who: string;
  value: number;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[34px] flex-none">{who}</span>
      <div className="h-1.5 flex-1 rounded-sm bg-line" aria-hidden="true">
        <div className={`h-1.5 rounded-sm ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 flex-none text-right text-ink-soft">
        {Math.round(value).toLocaleString("en-US")}
      </span>
    </div>
  );
}
