import type { Weakness } from "@/lib/analyzer/trends";
import { FocusButton } from "./focus";
import { panelClass } from "@/components/ui/panel";

// The "recurring weakness" card from the mockup: up to three patterns that
// show up in most of your recent games, worst first. Each one can be picked
// as your focus, which <FocusPanel> then tracks game by game.
export function Weaknesses({
  weaknesses,
  games,
  player,
}: {
  weaknesses: Weakness[];
  games: number;
  // Whose focus the buttons set (see playerKey in src/lib/focus.ts).
  player: string;
}) {
  if (weaknesses.length === 0) {
    return (
      <section
        aria-labelledby="weaknesses-heading"
        className={`${panelClass} flex flex-col gap-2.5 p-[22px]`}
      >
        <h2
          id="weaknesses-heading"
          className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-ahead-soft"
        >
          No recurring weakness
        </h2>
        <p className="text-[15px]">
          Nothing goes wrong in most of your last {games} games: no habit of falling behind early,
          dying the same way, or losing leads. The trends below show where the closer calls are.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="weaknesses-heading"
      className="soft-round flex flex-col gap-4 border border-behind/30 bg-behind/[0.07] p-[22px]"
    >
      <div className="flex items-center gap-2.5">
        <WarningIcon />
        <h2
          id="weaknesses-heading"
          className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-behind"
        >
          {weaknesses.length === 1 ? "Recurring weakness" : "Recurring weaknesses"}
        </h2>
      </div>
      <ul className="flex flex-col gap-3.5">
        {weaknesses.map((w) => (
          <li key={w.id} className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <p className="font-semibold">{w.title}</p>
              <p className="text-[15px] text-ink-soft">{w.detail}</p>
            </div>
            <FocusButton player={player} id={w.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function WarningIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-behind"
    >
      <path d="M12 3 L22 20 H2 Z" />
      <path d="M12 10v4M12 17.5v.5" />
    </svg>
  );
}
