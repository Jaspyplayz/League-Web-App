// Reads the points of a saved AI recap (see src/lib/recap.ts). Each point is
// saved as one line of the recap's `detail`, "12:00<tab>what happened".
// Recaps written before points had times are one paragraph with no tab, and
// come back as a single point without a time.

export type RecapPoint = { time: string | null; text: string };

export function recapPoints(detail: string): RecapPoint[] {
  return detail
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab === -1) return { time: null, text: line.trim() };
      return { time: line.slice(0, tab).trim() || null, text: line.slice(tab + 1).trim() };
    });
}
