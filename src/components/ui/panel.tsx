import type { ComponentProps } from "react";

// The raised dark card used for every box of content: charts, stats,
// match rows. Pass extra classes to set padding and layout. Use this instead
// of copying its classes, so every card on the site has the same corners.
export function Panel({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div className={`rounded-[14px] border border-line-strong bg-surface ${className}`} {...props} />
  );
}
