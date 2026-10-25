import { SubHeading } from "@/components/ui/panel-heading";
import { panelClass } from "@/components/ui/panel";
import { plural } from "@/lib/analyzer/format";
import type { SkillFocus, SkillTrack } from "@/lib/analyzer/skill";

export function SkillCompare({ focus }: { focus: SkillFocus | null }) {
  if (focus === null) return null;
  if (focus.status === "level") {
    return <p className={`${panelClass} px-5 py-4 text-body text-muted`}>{focus.sentence}</p>;
  }

  return (
    <div className={`${panelClass} flex flex-col gap-3 px-5 py-4`}>
      <SubHeading>Skill to improve</SubHeading>
      <p className="font-semibold text-ink">{focus.label}</p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-behind">
          You <span className="font-mono">{focus.youText}</span>
        </p>
        <p className="text-sm text-ink-soft">
          {focus.rankName} <span className="font-mono">{focus.rankText}</span>
        </p>
      </div>
      <p className="font-mono text-xs text-faint">{plural(focus.games, "game")}</p>
      <SkillLine track={focus.track} />
      <p className="font-mono text-behind">{focus.gap.text}</p>
      <p className="text-body text-muted">{focus.sentence}</p>
    </div>
  );
}

function SkillLine({ track }: { track: SkillTrack }) {
  return (
    <div aria-hidden="true" className="relative h-6">
      <div className="absolute top-1/2 right-1.5 left-1.5 h-1 -translate-y-1/2 bg-line" />
      {track.zero !== null && <Mark at={track.zero} className="h-4 w-px bg-faint" />}
      <Mark at={track.rank} className="size-2 rounded-full bg-ink-soft" />
      <Mark at={track.you} className="size-2.5 rounded-full bg-behind" />
    </div>
  );
}

function Mark({ at, className }: { at: number; className: string }) {
  return (
    <span
      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${className}`}
      style={{ left: `calc(0.375rem + (100% - 0.75rem) * ${at})` }}
    />
  );
}
