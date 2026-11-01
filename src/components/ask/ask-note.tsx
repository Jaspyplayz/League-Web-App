import type { ReactNode } from "react";

// A message inside the Ask panel, where the question box or the answers would
// go: a limit, Ask not being set up, or something that failed. It's the
// states canvas's empty and problem panels (JAS-93) on the raised fill, since
// it already sits in a panel. Problems get the "!" circle. Both stay in the
// text colours: red only ever means the opponent.
export function AskNote({
  title,
  children,
  problem = false,
}: {
  title: string;
  children?: ReactNode;
  problem?: boolean;
}) {
  return (
    <div className="flex gap-3 rounded-md bg-raised p-4">
      {problem && (
        <span
          aria-hidden="true"
          className="grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] border-quiet text-note font-bold text-quiet"
        >
          !
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body font-semibold text-main">{title}</p>
        {children && <div className="text-body text-quiet">{children}</div>}
      </div>
    </div>
  );
}
