import type { ComponentProps } from "react";

// Small uppercase monospace label that sits above a heading or field.
export function Eyebrow({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`font-mono text-[13px] uppercase tracking-[0.14em] text-ahead-soft ${className}`}
      {...props}
    />
  );
}
