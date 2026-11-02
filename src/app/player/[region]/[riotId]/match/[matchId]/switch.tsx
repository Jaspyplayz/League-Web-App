// Pressed buttons in a strip, for choosing what the board or the replay shows.

// The match page has two looks for the pressed button. The board's lifts it
// to the panel's fill; the replay's fills it with the text colour, as the
// Review board's main buttons are. Making them one would change how one of
// them looks, so that's a design call, not a tidy-up.
const LOOKS = {
  lifted: {
    strip: "flex gap-0.5 p-0.5",
    button: "min-h-10 px-2.5 text-note sm:min-h-8",
    pressed: "bg-panel font-semibold text-main",
  },
  solid: {
    strip: "inline-flex gap-1 p-1 text-note",
    button: "min-h-8 px-3 py-1",
    pressed: "bg-main font-medium text-page",
  },
};

export function Switch<T extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
  look,
  className,
}: {
  label: string;
  options: { value: T; name: string }[];
  value: T;
  onChange: (value: T) => void;
  look: keyof typeof LOOKS;
  // The strip's fill, one step off what it sits on, and any other classes
  // the whole strip needs.
  className: string;
}) {
  const { strip, button, pressed } = LOOKS[look];
  return (
    <div role="group" aria-label={label} className={`${strip} rounded-md ${className}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`${button} rounded-sm ${o.value === value ? pressed : "text-quiet hover:text-main"}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}
