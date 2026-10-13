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
