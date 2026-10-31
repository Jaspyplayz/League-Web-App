import { devices } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { browserFor, PHONE_WIDTH } from "./shot-device";

describe("browserFor", () => {
  it("takes --phone shots 390px wide, the width the design rules check", () => {
    const phone = browserFor(true);
    expect(PHONE_WIDTH).toBe(390);
    expect(phone.viewport?.width).toBe(390);
    expect(phone.screen?.width).toBe(390);
  });

  it("keeps the rest of Pixel 7: touch, a phone browser and its pixel ratio", () => {
    const phone = browserFor(true);
    const pixel7 = devices["Pixel 7"];
    expect(phone.isMobile).toBe(true);
    expect(phone.hasTouch).toBe(true);
    expect(phone.deviceScaleFactor).toBe(pixel7.deviceScaleFactor);
    expect(phone.userAgent).toBe(pixel7.userAgent);
    expect(phone.viewport?.height).toBe(pixel7.viewport.height);
  });

  it("leaves desktop shots as they were", () => {
    expect(browserFor(false)).toEqual(devices["Desktop Chrome"]);
  });
});
