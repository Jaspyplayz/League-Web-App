import { describe, expect, it } from "vitest";
import { queueIds, readQueueFilter } from "./queue-filters";

describe("readQueueFilter", () => {
  it("reads the tab from the URL", () => {
    expect(readQueueFilter("solo").filter).toEqual({ queue: 420 });
    expect(readQueueFilter("ranked").filter).toEqual({ type: "ranked" });
  });

  it("falls back to All for anything unexpected", () => {
    expect(readQueueFilter(undefined).id).toBe("all");
    expect(readQueueFilter("urf").id).toBe("all");
    expect(readQueueFilter(["solo", "flex"]).id).toBe("all");
  });
});

describe("queueIds", () => {
  it("lists the queues a filter covers", () => {
    expect(queueIds({ queue: 450 })).toEqual([450]);
    expect(queueIds({ type: "ranked" })).toEqual([420, 440]);
    expect(queueIds({})).toBeNull();
  });
});
