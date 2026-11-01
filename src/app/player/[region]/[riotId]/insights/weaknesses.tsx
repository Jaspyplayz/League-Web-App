import type { Weakness } from "@/lib/analyzer/trends";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading } from "@/components/ui/panel-heading";
import { FocusButton } from "./focus";

// The "recurring weakness" panel: up to three patterns that show up in most
// of your recent games, worst first. It's a plain panel, not a red box: red
// means the opponent or behind, and this is about your own habits. Each one can be picked
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
        className={`${panelClass} flex flex-col gap-1.5 p-4 sm:px-5`}
      >
        <PanelHeading id="weaknesses-heading">No recurring weakness</PanelHeading>
        <p className="text-body text-quiet">
          Nothing goes wrong in most of your last {games} games: no habit of falling behind early,
          dying the same way, or losing leads. The trends below show where the closer calls are.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="weaknesses-heading"
      className={`${panelClass} flex flex-col gap-2 p-4 sm:px-5`}
    >
      <PanelHeading id="weaknesses-heading">
        {weaknesses.length === 1 ? "Recurring weakness" : "Recurring weaknesses"}
      </PanelHeading>
      <ul className="flex flex-col">
        {weaknesses.map((w) => (
          <li
            key={w.id}
            className="flex items-center justify-between gap-4 border-t border-divider py-3 first:border-t-0 first:pt-1 last:pb-0"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-body font-semibold">{w.title}</p>
              <p className="text-body text-quiet">{w.detail}</p>
            </div>
            <FocusButton player={player} id={w.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
