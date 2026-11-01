import { winRate, type RecentRecord } from "@/lib/match-summary";
import { panelClass } from "@/components/ui/panel";

// The "Last 10 games" panel above the match list, like the summary at the top
// of op.gg's and DeepLoL's match history: a win rate ring, the overall
// numbers, and bars for how often each role was played, side by side. It
// covers every game in the list, so "Show 10 more games" makes it "Last 20".
export function RecentSummary({
  record,
  roles,
}: {
  record: RecentRecord;
  roles: { role: string; games: number }[];
}) {
  const mostPlayed = Math.max(1, ...roles.map((r) => r.games));

  return (
    <section
      aria-labelledby="recent-summary-heading"
      className={`${panelClass} flex flex-wrap items-center gap-x-8 gap-y-4 px-[18px] py-4`}
    >
      <div className="flex items-center gap-4">
        <WinRateRing wins={record.wins} losses={record.losses} />
        <div className="flex flex-col gap-0.5">
          <h2 id="recent-summary-heading" className="text-note text-quiet">
            Last {record.games} games
          </h2>
          {/* In the text colour: the ring already shows wins in blue and
              losses in red. */}
          <p className="text-xl font-semibold tabular-nums">
            {record.wins}W {record.losses}L
          </p>
          <p className="text-note text-quiet tabular-nums">{record.kda.toFixed(2)} KDA</p>
        </div>
      </div>

      <dl className="flex gap-8">
        <Stat label="CS per min" value={record.csPerMin.toFixed(1)} />
        <Stat label="Kill participation" value={`${Math.round(record.killParticipation * 100)}%`} />
      </dl>

      {/* Only shown when the games had roles; ARAM-only lists have none.
          ml-auto pushes it to the right end on wide screens. */}
      {roles.some((r) => r.games > 0) && (
        <div className="flex flex-col gap-1">
          <h3 className="text-note text-quiet">Roles</h3>
          <ul className="flex h-16 items-end gap-3">
            {roles.map(({ role, games }) => (
              <li
                key={role}
                className="flex h-full w-5 flex-col items-center justify-end gap-1"
                aria-label={`${role}: ${games} ${games === 1 ? "game" : "games"}`}
              >
                {/* Quiet bars, with the most played role in the text colour.
                    At least 3px tall, so a role with no games still shows. */}
                <div
                  aria-hidden="true"
                  className={`w-full rounded-t-sm ${games === mostPlayed ? "bg-main" : "bg-quiet/45"}`}
                  style={{ height: `${Math.max(3, (games / mostPlayed) * 44)}px` }}
                />
                <span className="text-note text-quiet" aria-hidden="true">
                  {ROLE_SHORT[role] ?? role}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const ROLE_SHORT: Record<string, string> = {
  Top: "Top",
  Jungle: "Jg",
  Mid: "Mid",
  Bot: "Bot",
  Support: "Sup",
};

// A ring that fills blue for wins and red for losses, with the win rate in
// the middle. Two SVG circles drawn on top of each other: the red one is the
// whole ring, and the blue one only draws the winning share of its outline
// (that's what strokeDasharray does: "draw this much, then skip the rest").
function WinRateRing({ wins, losses }: { wins: number; losses: number }) {
  const size = 72;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const rate = winRate(wins, losses);
  const percent = Math.round(rate * 100);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${percent}% win rate`}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-behind)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-ahead)"
        strokeWidth={stroke}
        strokeDasharray={`${rate * circumference} ${circumference}`}
        // Start at 12 o'clock instead of 3 o'clock.
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-main text-body font-semibold tabular-nums"
      >
        {percent}%
      </text>
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-note text-quiet">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
