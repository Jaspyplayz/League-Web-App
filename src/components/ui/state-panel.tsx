import type { ReactNode } from "react";
import { panelClass } from "./panel";

// The empty and problem panels from JAS-93's states canvas. Both sit where the
// missing content would go, so the page keeps its shape.

// The main button: text-coloured fill, page-coloured words. 44px tall so it's
// easy to hit on a phone.
export const mainButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md bg-main px-5 text-body font-semibold text-page hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

// Every other button or button-like link: a raised fill and the text colour.
export const secondButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md bg-raised px-5 text-body font-medium text-main hover:bg-divider";

// Nothing to show: one sentence naming what's missing, an optional line
// under it, and at most one way forward (a single link or button). No icon.
export function EmptyPanel({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`${panelClass} flex flex-col items-start gap-1.5 p-5`}>
      <p className="text-body font-semibold">{title}</p>
      {children && <div className="text-body text-quiet">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// Something failed: the empty panel's shape with a "!" circle. It says what
// happened (title), what to do (children) and gives a way out (actions).
// Everything is in the text colours: blue and red only ever mean you and the
// opponent, and the old amber box made a small hiccup look like an alarm.
export function ProblemPanel({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div role="alert" className={`${panelClass} flex gap-3 p-5`}>
      <span
        aria-hidden="true"
        className="grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] border-quiet text-note font-bold text-quiet"
      >
        !
      </span>
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <p className="text-body font-semibold">{title}</p>
        {children && <div className="flex flex-col gap-3 text-body text-quiet">{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

// A raised box inside a problem panel, for words that come from somewhere
// else, such as Riot's own outage note.
export function NoteBox({ children }: { children: ReactNode }) {
  return <div className="rounded-md bg-raised px-4 py-3 text-body text-quiet">{children}</div>;
}
