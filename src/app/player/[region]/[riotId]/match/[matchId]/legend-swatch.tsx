// A colored square and its label, for chart legends.
export function LegendSwatch({ className, children }: { className: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-3 rounded-[3px] ${className}`} />
      {children}
    </span>
  );
}
