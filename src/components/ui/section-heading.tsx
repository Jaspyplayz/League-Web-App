import type { ComponentProps } from "react";

// Heading for a page section ("How it works", "Recent games"): Rubik in
// sentence case, one size up from PanelHeading.
export function SectionHeading({ className = "", ...props }: ComponentProps<"h2">) {
  return <h2 className={`text-[19px] font-semibold leading-snug ${className}`} {...props} />;
}
