"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { DiffChart, type TurningPointMarker } from "./diff-chart";
import type { DiffPoint } from "@/lib/diff-chart";

// Chart units per screen pixel. DiffChart's text is 22 units, so this draws
// it at 11px, like home's prototype (JAS-92).
const UNITS_PER_PX = 2;

// Until the browser measures the box, draw for a 640px by 150px one: home's
// chart on a laptop, so nothing moves there once the page wakes up.
const GUESS = { width: 640, height: 150 };

// The gold chart at a fixed height in pixels, at whatever width it's given.
// DiffChart on its own grows taller as it gets wider; home wants it exactly
// 150px (180px on phones, set by `className`) so "Open this game" stays on a
// laptop's first screen. The box sets the size and this measures it.
export function FittedDiffChart({
  className,
  ...chart
}: {
  className: string;
  points: DiffPoint[];
  markers: TurningPointMarker[];
  description: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(GUESS);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      <DiffChart
        {...chart}
        width={size.width * UNITS_PER_PX}
        height={size.height * UNITS_PER_PX}
      />
    </div>
  );
}
