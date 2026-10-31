// The browser `npm run shot` (scripts/shot.ts) takes its screenshots in.

import { devices, type BrowserContextOptions } from "@playwright/test";

// The design rules (.claude/rules/design.md) check every restyle at 390px
// wide, the width of most iPhones. Pixel 7 is 412px, so --phone keeps its
// touch, phone browser and pixel ratio and narrows the page and screen to 390.
export const PHONE_WIDTH = 390;

const pixel7 = devices["Pixel 7"];

const PHONE: BrowserContextOptions = {
  ...pixel7,
  viewport: { ...pixel7.viewport, width: PHONE_WIDTH },
  // Pixel 7's screen is 412 × 915. Playwright's type for a device leaves the
  // screen out, so its height is written here.
  screen: { width: PHONE_WIDTH, height: 915 },
};

export function browserFor(phone: boolean): BrowserContextOptions {
  return phone ? PHONE : devices["Desktop Chrome"];
}
