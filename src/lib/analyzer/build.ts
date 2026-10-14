// Each player's build, for the match panel's Build tab: what they bought and
// when, and the order they levelled their abilities, like op.gg shows.

import type { TrimmedEvent } from "./trim";

// Items bought within the same minute, in the order they were bought.
export type ItemBatch = { minute: number; itemIds: number[] };

export type PlayerBuild = {
  items: ItemBatch[];
  // One skill slot per level-up, in order: 1 = Q, 2 = W, 3 = E, 4 = R.
  skills: number[];
};

// Builds for every player in the game, keyed by participantId (1 to 10).
export function playerBuilds(events: TrimmedEvent[]): Record<number, PlayerBuild> {
  // Purchases per player, so an undo can take back the one it cancels.
  const purchases = new Map<number, { itemId: number; timestamp: number }[]>();
  const skills = new Map<number, number[]>();
  for (let id = 1; id <= 10; id++) {
    purchases.set(id, []);
    skills.set(id, []);
  }

  for (const e of events) {
    if (e.type === "ITEM_PURCHASED") {
      purchases.get(e.participantId)?.push({ itemId: e.itemId, timestamp: e.timestamp });
    } else if (e.type === "ITEM_UNDO" && e.beforeId > 0 && e.afterId === 0) {
      // Undoing a purchase: drop the latest purchase of that item.
      const list = purchases.get(e.participantId) ?? [];
      const last = list.findLastIndex((p) => p.itemId === e.beforeId);
      if (last !== -1) list.splice(last, 1);
    } else if (e.type === "SKILL_LEVEL_UP") {
      skills.get(e.participantId)?.push(e.skillSlot);
    }
  }

  const builds: Record<number, PlayerBuild> = {};
  for (let id = 1; id <= 10; id++) {
    builds[id] = { items: groupByMinute(purchases.get(id) ?? []), skills: skills.get(id) ?? [] };
  }
  return builds;
}

function groupByMinute(list: { itemId: number; timestamp: number }[]): ItemBatch[] {
  const batches: ItemBatch[] = [];
  for (const { itemId, timestamp } of list) {
    const minute = Math.floor(timestamp / 60_000);
    const last = batches.at(-1);
    if (last?.minute === minute) last.itemIds.push(itemId);
    else batches.push({ minute, itemIds: [itemId] });
  }
  return batches;
}

// The order abilities were maxed, like "Q > E > W": basic abilities ranked
// by when they got their 5th point. Abilities that never reached 5 come
// after, most points first. R is left out, since it's always taken at 6.
export function maxOrder(skills: number[]): number[] {
  const points = new Map<number, number>();
  const maxedAt = new Map<number, number>();
  skills.forEach((slot, i) => {
    const count = (points.get(slot) ?? 0) + 1;
    points.set(slot, count);
    if (count === 5) maxedAt.set(slot, i);
  });
  return [1, 2, 3]
    .filter((slot) => points.has(slot))
    .sort(
      (a, b) =>
        (maxedAt.get(a) ?? Infinity) - (maxedAt.get(b) ?? Infinity) ||
        (points.get(b) ?? 0) - (points.get(a) ?? 0),
    );
}
