import type { ComponentProps } from "react";

// Heading for a panel or a smaller page section ("At 10 minutes", "Turning
// points"). Same style as SectionHeading, one size down: Rubik in sentence
// case, as the Review board look has no all-caps or condensed type.
export function PanelHeading({ className = "", ...props }: ComponentProps<"h2">) {
  return <h2 className={`text-[17px] font-semibold leading-snug ${className}`} {...props} />;
}

// A small label for one part of a panel, like each chart and list in "How
// the game went" on the match page.
export function SubHeading({ className = "", ...props }: ComponentProps<"h3">) {
  return <h3 className={`text-note font-medium text-quiet ${className}`} {...props} />;
}
