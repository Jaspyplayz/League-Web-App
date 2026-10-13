import type { Weakness } from "@/lib/analyzer/trends";

// The "recurring weakness" card from the mockup: up to three patterns that
// show up in most of your recent games, worst first.
export function Weaknesses({ weaknesses, games }: { weaknesses: Weakness[]; games: number }) {
  if (weaknesses.length === 0) {
    return (
      <section
        aria-labelledby="weaknesses-heading"
        className="flex flex-col gap-2.5 rounded-2xl border border-line-strong bg-surface p-[22px]"
      >
        <h2
          id="weaknesses-heading"
          className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-ahead-soft"
        >
          No recurring weakness
        </h2>
        <p className="text-[15px]">
          Nothing goes wrong in most of your last {games} games: no habit of falling behind early,
          dying the same way, or losing leads. The trends below show where the closer calls are.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="weaknesses-heading"
      className="flex flex-col gap-4 rounded-2xl border border-behind/30 bg-behind/[0.07] p-[22px]"
    >
      <div className="flex items-center gap-2.5">
        <WarningIcon />
        <h2
          id="weaknesses-heading"
          className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-behind"
        >
          {weaknesses.length === 1 ? "Recurring weakness" : "Recurring weaknesses"}
        </h2>
      </div>
      <ul className="flex flex-col gap-3.5">
        {weaknesses.map((w) => (
          <li key={w.title} className="flex flex-col gap-0.5">
            <p className="font-semibold">{w.title}</p>
            <p className="text-[15px] text-ink-soft">{w.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WarningIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-behind"
    >
      <path d="M12 3 L22 20 H2 Z" />
      <path d="M12 10v4M12 17.5v.5" />
    </svg>
  );
}
