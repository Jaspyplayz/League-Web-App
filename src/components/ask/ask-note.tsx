import type { ReactNode } from "react";
import { ProblemMark } from "@/components/ui/state-panel";

// A message inside the Ask panel, where the question box or the answers would
// go: a limit, Ask not being set up, or something that failed. It's the
// states canvas's empty and problem panels (JAS-93, ui/state-panel.tsx) on the
// raised fill, since it already sits in a panel. It has no buttons and no
// role="alert": most of these arrive with the page, and the one that appears
// later, a question that wasn't answered, is read out by the box's status
// line. Problems get the "!" circle. All stay in the text colours: red only
// ever means the opponent.
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
      {problem && <ProblemMark />}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body font-semibold text-main">{title}</p>
        {children && <div className="text-body text-quiet">{children}</div>}
      </div>
    </div>
  );
}
