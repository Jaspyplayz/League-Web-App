import { winRate, type RecentRecord } from "@/lib/match-summary";
import { panelClass } from "@/components/ui/panel";

// The "Last 20 games" box beside the match list, like the summary at the top
// of op.gg's and DeepLoL's match history: a win rate ring, the overall
// numbers, and bars for how often each role was played.
export function RecentSummary({
  record,
  roles,
}: {
  record: RecentRecord;
  roles: { role: string; games: number }[];
}) {
  const mostPlayed = Math.max(1, ...roles.map((r) => r.games));

  return (
    <section className={`${panelClass} flex flex-col gap-4 p-4`}>
      <h2 className="font-mono text-xs tracking-widest text-faint uppercase">
        Last {record.games} games
      </h2>

      <div className="flex items-center gap-4">
        <WinRateRing wins={record.wins} losses={record.losses} />
        <div className="flex flex-col gap-0.5">
          <p className="text-2xl font-semibold">
            <span className="text-ahead">{record.wins}W</span>{" "}
            <span className="text-behind">{record.losses}L</span>
          </p>
          <p className="font-mono text-sm text-muted">{record.kda.toFixed(2)} KDA</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="CS per min" value={record.csPerMin.toFixed(1)} />
        <Stat
          label="Kill participation"
          value={`${Math.round(record.killParticipation * 100)}%`}
        />
      </dl>

      {/* Only shown when the games had roles; ARAM-only lists have none. */}
      {roles.some((r) => r.games > 0) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-faint">Roles</h3>
          <ul className="flex h-24 items-end gap-3">
            {roles.map(({ role, games }) => (
              <li
                key={role}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                aria-label={`${role}: ${games} ${games === 1 ? "game" : "games"}`}
              >
                <div className="flex w-full flex-1 items-end rounded-sm bg-line" aria-hidden="true">
                  <div
                    className="w-full rounded-sm bg-ahead"
                    style={{ height: `${(games / mostPlayed) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] text-faint" aria-hidden="true">
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
        className="fill-ink font-mono text-sm font-semibold"
      >
        {percent}%
      </text>
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className="font-mono text-lg">{value}</dd>
    </div>
  );
}
