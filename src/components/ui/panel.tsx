import type { ComponentProps } from "react";

// The card's classes on their own, for elements that aren't a <div> (a list,
// a list item, a paragraph). One shape for every card in the Review board
// look: one fill step off the page, 6px corners and no visible outline.
// The 1px border stays, transparent, because a few panels colour it to show
// focus or hover (the search box's focus-within:border-ahead); without it
// they would lose that ring.
export const panelClass = "rounded-md border border-transparent bg-panel";

// Same card. Home and Ask already imported this name.
export const softPanelClass = panelClass;

// The card used for every box of content: charts, stats, match rows. Pass
// extra classes to set padding and layout.
export function Panel({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div className={`${panelClass} ${className}`} {...props} />
  );
}
