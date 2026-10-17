import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { findPlayerByRiotId, isAnalyzable } from "@/lib/analyzer";
import { championIconUrl, championName, getDataDragon } from "@/lib/ddragon";
import { matchCard, type MatchCard } from "@/lib/match-card";
import { loadMatch, loadTimeline } from "@/lib/match-store";
import { savedSoloTier } from "@/lib/profile-store";
import { isMatchIdFor, isRegion } from "@/lib/regions";
import { settle } from "@/lib/riot/client";
import { fromSlug } from "@/lib/riot-id";
import { matchWinChance } from "@/lib/win-chance";

// The preview image Discord, X and iMessage show when someone pastes a match
// link. Next.js finds this file by its name and adds the <meta> tags for it.
//
// It only reads what's already in the database (or asks Riot once, like the
// page itself), and if anything is missing it still returns a plain Turnpoint
// card, because a broken preview looks worse than a simple one.

export const alt = "Turnpoint match analysis";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The image is drawn by Satori, which doesn't read our CSS, so these copy the
// tokens in src/app/globals.css.
const COLORS = {
  page: "#0b0e13",
  surface: "#12161d",
  line: "#262c37",
  ink: "#e8ecf2",
  muted: "#a9b2bf",
  ahead: "#5a8cff",
  behind: "#f4615a",
};

type Params = Promise<{ region: string; riotId: string; matchId: string }>;

export default async function Image({ params }: { params: Params }) {
  await connection();
  const card = await loadCard(await params);
  return new ImageResponse(card ? <Card {...card} /> : <Fallback />, size);
}

async function loadCard({
  region,
  riotId,
  matchId,
}: Awaited<Params>): Promise<(MatchCard & { icon: string | null }) | null> {
  const id = fromSlug(riotId);
  if (!isRegion(region) || !id || !isMatchIdFor(region, matchId)) return null;

  const [loaded, dd] = await Promise.all([
    settle(loadMatch(region, matchId)),
    getDataDragon().catch(() => null),
  ]);
  if (!loaded.ok) return null;
  const match = loaded.value;
  // Unlike the page, no PUUID lookup for renamed players: a preview isn't
  // worth a Riot call, and the fallback card is fine.
  const me = findPlayerByRiotId(match, id.gameName, id.tagLine);
  if (!me) return null;

  const [timeline, tier] = await Promise.all([
    isAnalyzable(match) ? settle(loadTimeline(region, match)) : null,
    savedSoloTier(me.puuid),
  ]);
  // The same rank's model as the match page, so the card's swings match it.
  const winChance = timeline?.ok ? matchWinChance(match, timeline.value, me.teamId, tier) : null;
  return {
    ...matchCard(
      match,
      me,
      `${id.gameName}#${id.tagLine}`,
      championName(dd, me.championName),
      winChance,
    ),
    icon: dd ? championIconUrl(dd, me.championName) : null,
  };
}

function Card({
  riotId,
  champion,
  details,
  result,
  kda,
  score,
  swing,
  chances,
  icon,
}: MatchCard & { icon: string | null }) {
  const resultColor =
    result === "Victory" ? COLORS.ahead : result === "Defeat" ? COLORS.behind : COLORS.muted;
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        {icon && <img src={icon} width={150} height={150} alt="" style={{ borderRadius: 20 }} />}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 30, color: COLORS.muted }}>{riotId}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
            <span style={{ fontSize: 72, fontWeight: 700, color: resultColor }}>{result}</span>
            <span style={{ fontSize: 36, color: COLORS.ink }}>{champion}</span>
          </div>
          <div style={{ fontSize: 28, color: COLORS.muted }}>{[details, kda].join(" · ")}</div>
        </div>
        {score && (
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "16px 28px",
              borderRadius: 20,
              border: `2px solid ${COLORS.line}`,
              background: COLORS.surface,
            }}
          >
            <span style={{ fontSize: 22, color: COLORS.muted }}>{score.badge ?? "Score"}</span>
            <span style={{ fontSize: 64, fontWeight: 700, color: COLORS.ink }}>{score.value}</span>
          </div>
        )}
      </div>

      {chances.length > 1 && <WinChanceLine chances={chances} />}

      {swing && (
        <div style={{ display: "flex", fontSize: 30, color: COLORS.ink, gap: 14 }}>
          <span style={{ color: COLORS.muted }}>Biggest swing</span>
          <span>{swing.clock}</span>
          <span>{swing.title}</span>
          <span
            style={{
              color: swing.to > swing.from ? COLORS.ahead : COLORS.behind,
            }}
          >
            {swing.from}% → {swing.to}%
          </span>
        </div>
      )}
    </Frame>
  );
}

// Your team's win chance as a simple line, 50% in the middle.
function WinChanceLine({ chances }: { chances: number[] }) {
  const width = 1056;
  const height = 150;
  const x = (i: number) => (i / (chances.length - 1)) * width;
  const y = (chance: number) => height - (chance / 100) * height;
  const points = chances.map((c, i) => `${x(i)},${y(c)}`).join(" ");
  const end = chances.at(-1)!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke={COLORS.line}
        strokeWidth={2}
        strokeDasharray="8 8"
      />
      <polyline
        points={points}
        fill="none"
        stroke={end >= 50 ? COLORS.ahead : COLORS.behind}
        strokeWidth={5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Fallback() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          marginTop: 80,
        }}
      >
        <span style={{ fontSize: 80, fontWeight: 700, color: COLORS.ink }}>
          Find the minute your game turned.
        </span>
        <span style={{ fontSize: 34, color: COLORS.muted }}>
          Match analysis for League of Legends
        </span>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily: "sans-serif",
      }}
    >
      {children}
      <div
        style={{
          display: "flex",
          fontSize: 24,
          letterSpacing: 6,
          color: COLORS.ahead,
        }}
      >
        TURNPOINT
      </div>
    </div>
  );
}
