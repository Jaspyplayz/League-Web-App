"use client";

import { HomeBrief } from "@/components/home-brief";
import { useRecentPlayers } from "@/components/saved-players";
import { openerBrief, resolveOpener } from "@/lib/home-ledger";

export function HomeOpener() {
  const recent = useRecentPlayers();
  return <HomeBrief brief={openerBrief(resolveOpener(recent))} />;
}
