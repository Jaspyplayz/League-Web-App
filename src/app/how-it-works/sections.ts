// How it works' sections, in the order JAS-90 drew them. The wide screen's
// "On this page" list and the phone's "Jump to a section" select both read
// this, and each id is the section's anchor on the page.
export const SECTIONS = [
  { id: "models", title: "The models at a glance" },
  { id: "data", title: "1. The data" },
  { id: "turning-points", title: "2. Turning points" },
  { id: "win-chance", title: "3. Win chance" },
  { id: "phases", title: "4. Early, mid and late ratings" },
  { id: "game-score", title: "5. Game score" },
  { id: "checks", title: "6. How it’s checked" },
  { id: "limits", title: "7. What it won’t do" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
