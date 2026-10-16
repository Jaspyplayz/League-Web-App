// The saved or just-written recap, with a note that AI wrote it.
export function RecapText({ headline, detail }: { headline: string; detail: string }) {
  return (
    <>
      <p className="text-body font-semibold text-ink">{headline}</p>
      <p className="text-ink-soft">{detail}</p>
      <p className="text-note text-faint">
        Written by AI (Claude) from the stats on this page. It can get things wrong.
      </p>
    </>
  );
}
