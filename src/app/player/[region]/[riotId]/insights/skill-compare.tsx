import { SubHeading } from "@/components/ui/panel-heading";
import { plural } from "@/lib/analyzer/format";
import type { SkillFocus, SkillTrack } from "@/lib/analyzer/skill";

// "Skill to improve": the one stat you're furthest behind the rank in, as a
// raised box at the top of "You vs [rank]". You're behind by definition, so
// your number and the gap are red.
export function SkillCompare({ focus }: { focus: SkillFocus | null }) {
  if (focus === null) return null;
  if (focus.status === "level") {
    return <p className="rounded-md bg-raised px-4 py-3.5 text-body text-quiet">{focus.sentence}</p>;
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-raised px-4 py-3.5">
      <div className="flex flex-col gap-0.5">
        <SubHeading>Skill to improve</SubHeading>
        <p className="text-xl font-semibold">{focus.label}</p>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dt className="text-note text-quiet">You</dt>
          <dd className="text-xl font-semibold text-behind">{focus.youText}</dd>
        </div>
        <div>
          <dt className="text-note text-quiet">{focus.rankName}</dt>
          <dd className="text-xl font-semibold">{focus.rankText}</dd>
        </div>
        <div>
          <dt className="text-note text-quiet">Gap, {plural(focus.games, "game")}</dt>
          <dd className="text-xl font-semibold text-behind">{focus.gap.text}</dd>
        </div>
      </dl>
      <SkillLine track={focus.track} />
      <p className="text-note text-quiet">{focus.sentence}</p>
    </div>
  );
}

// Where you and the rank sit on one line, with a tick at zero when the
// stat can go negative (a gold lead, say).
function SkillLine({ track }: { track: SkillTrack }) {
  return (
    <div aria-hidden="true" className="relative h-6">
      <div className="absolute top-1/2 right-1.5 left-1.5 h-1 -translate-y-1/2 rounded-sm bg-divider" />
      {track.zero !== null && <Mark at={track.zero} className="h-4 w-px bg-quiet" />}
      <Mark at={track.rank} className="size-2 rounded-full bg-main" />
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
