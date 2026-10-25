import { toSlug } from "@/lib/riot-id";
import { SAMPLE_MATCH, SAMPLE_MATCH_HREF } from "@/lib/sample-match";
import type { SavedPlayer } from "@/lib/saved-players";

export type SampleBrief = {
  href: typeof SAMPLE_MATCH_HREF;
  kicker: "Cached match";
  title: "See a sample analysis";
  body: string;
};

export type HabitBrief = {
  href: "/how-it-works";
  kicker: "One habit";
  title: "Level 6 first";
  body: string;
};

export type StaticBriefs = { sample: SampleBrief; habit: HabitBrief };

const briefs: StaticBriefs = {
  sample: {
    href: SAMPLE_MATCH_HREF,
    kicker: "Cached match",
    title: "See a sample analysis",
    body: `This is ${SAMPLE_MATCH.gameName}'s real Syndra game from the database. The gold chart above is an illustration of a different game.`,
  },
  habit: {
    href: "/how-it-works",
    kicker: "One habit",
    title: "Level 6 first",
    body: "Insights counts whether you hit level 6 before the player in your role, and how often those games were won. The rate appears only after looking a player up. This card opens how the models work.",
  },
};

export function staticBriefs(): StaticBriefs {
  return briefs;
}

export type PublicExample = Pick<typeof SAMPLE_MATCH, "region" | "gameName" | "tagLine">;

export type Opener =
  | { source: "example"; player: PublicExample }
  | { source: "recent"; player: SavedPlayer };

export function resolveOpener(recent: readonly SavedPlayer[]): Opener {
  if (recent.length === 0) return { source: "example", player: SAMPLE_MATCH };
  return { source: "recent", player: recent[0] };
}

export type OpenerBrief =
  | { kicker: "Try a lookup"; title: string; href: string; body: string }
  | { kicker: "Recently viewed"; title: string; href: string; body: string };

export type HomeBriefModel = SampleBrief | HabitBrief | OpenerBrief;

export function openerBrief(opener: Opener): OpenerBrief {
  const { player } = opener;
  const title = `${player.gameName}#${player.tagLine}`;
  const href = `/player/${player.region}/${toSlug(player)}`;
  if (opener.source === "example") {
    return {
      kicker: "Try a lookup",
      title,
      href,
      body: "Opening the profile loads it from Riot, unlike the sample game.",
    };
  }
  return {
    kicker: "Recently viewed",
    title,
    href,
    body: "This is the last player this browser looked up. Opening the profile loads their games from Riot.",
  };
}
