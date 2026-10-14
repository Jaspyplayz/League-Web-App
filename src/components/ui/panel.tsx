import type { ComponentProps } from "react";

// The card's classes on their own, for elements that aren't a <div> (a list,
// a list item, a paragraph). Use Panel or this instead of copying the
// classes, so every card on the site has the same corners and border.
export const panelClass = "rounded-[14px] border border-line-strong bg-surface";

// The raised dark card used for every box of content: charts, stats,
// match rows. Pass extra classes to set padding and layout. Use this instead
// of copying its classes, so every card on the site has the same corners.
export function Panel({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div className={`${panelClass} ${className}`} {...props} />
  );
}
