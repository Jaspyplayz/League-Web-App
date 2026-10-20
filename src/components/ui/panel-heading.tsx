import type { ComponentProps } from "react";

// Heading for a panel or a smaller page section ("At 10 minutes", "Turning
// points"). Same style as SectionHeading, one size down.
export function PanelHeading({ className = "", ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={`font-display text-[28px] font-bold uppercase leading-tight tracking-[0.01em] ${className}`}
      {...props}
    />
  );
}

// A small uppercase label for one part of a panel, like each chart and list
// in "How the game went" on the match page.
export function SubHeading({ className = "", ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={`font-mono text-label font-medium uppercase tracking-[0.12em] text-muted ${className}`}
      {...props}
    />
  );
}
