import type { ComponentProps } from "react";

// The card's classes on their own, for elements that aren't a <div> (a list,
// a list item, a paragraph). Use Panel or this instead of copying the
// classes, so every card on the site has the same cut corners and steel
// border (hud-cut is defined in globals.css).
export const panelClass = "hud-cut border border-frame bg-surface";

export const softPanelClass = "soft-round border border-frame bg-surface";

// The raised dark card used for every box of content: charts, stats,
// match rows. Pass extra classes to set padding and layout. Use this instead
// of copying its classes, so every card on the site has the same corners.
export function Panel({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div className={`${panelClass} ${className}`} {...props} />
  );
}
