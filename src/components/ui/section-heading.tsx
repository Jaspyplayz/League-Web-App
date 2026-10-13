import type { ComponentProps } from "react";

// Condensed uppercase heading for page sections ("How it works", "Recent games").
export function SectionHeading({ className = "", ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={`font-display text-4xl font-bold uppercase tracking-[0.01em] ${className}`}
      {...props}
    />
  );
}
