import type { ComponentProps } from "react";

// The card's classes on their own, for elements that aren't a <div> (a list,
// a list item, a paragraph). One shape for every card: soft-round (6px since
// JAS-97) from globals.css. border-frame is transparent now, since Review board
// panels have no outline; the contract ticket drops it from this list.
export const panelClass = "soft-round border border-frame bg-surface";

// Same card. Home and Ask already imported this name.
export const softPanelClass = panelClass;

// The raised card used for every box of content: charts, stats, match
// rows. Pass extra classes to set padding and layout.
export function Panel({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div className={`${panelClass} ${className}`} {...props} />
  );
}
