import { describe, expect, it } from "vitest";
import { recapPoints } from "./recap-points";

describe("recapPoints", () => {
  it("splits each line into its time and text", () => {
    expect(recapPoints("9:00\tYou won a 2v1 bot.\nOverall\tYou farmed 6.1 CS a minute.")).toEqual([
      { time: "9:00", text: "You won a 2v1 bot." },
      { time: "Overall", text: "You farmed 6.1 CS a minute." },
    ]);
  });

  it("reads an older one-paragraph recap as one point without a time", () => {
    expect(recapPoints("You won this 28-minute game.")).toEqual([
      { time: null, text: "You won this 28-minute game." },
    ]);
  });

  it("skips empty lines and a missing time", () => {
    expect(recapPoints("\n\tNo time here.\n")).toEqual([{ time: null, text: "No time here." }]);
  });
});
