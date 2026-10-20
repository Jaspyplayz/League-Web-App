import type { ReactNode } from "react";
import { SwipeHint } from "./swipe-hint";

// Wraps one chart, or several stacked on one time axis, so on phones they keep
// a readable size and scroll sideways together instead of shrinking their
// labels. Stacked charts share the one scroller, so they stay lined up.
export function ChartScroller({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="overflow-x-auto">
        <div className="flex min-w-[600px] flex-col gap-4">{children}</div>
      </div>
      <SwipeHint />
    </>
  );
}
