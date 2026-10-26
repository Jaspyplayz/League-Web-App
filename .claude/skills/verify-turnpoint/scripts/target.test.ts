import { describe, expect, it } from "vitest";
import { pickTarget } from "./target";

const PREVIEW = "https://league-web-84jkcgt00-jaspy-s-team.vercel.app";
const noLookup = () => {
  throw new Error("looked up a preview");
};

describe("pickTarget", () => {
  it("sends the bypass secret to no --base URL, even a Vercel one", () => {
    expect(pickTarget({ base: `${PREVIEW}/` }, noLookup)).toEqual({ base: PREVIEW });
    expect(pickTarget({ base: "https://someone-else.vercel.app" }, noLookup)).toEqual({ base: "https://someone-else.vercel.app" });
  });

  it("sends it only to the preview Vercel reported for --pr", () => {
    expect(pickTarget({ pr: "182" }, (pr) => (pr === "182" ? `${PREVIEW}/` : ""))).toEqual({ base: PREVIEW, preview: PREVIEW });
  });

  it("refuses --pr and --base together", () => {
    expect(pickTarget({ pr: "182", base: "https://someone-else.vercel.app" }, noLookup)).toEqual({ error: "Pass --pr or --base, not both." });
  });
});
