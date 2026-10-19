import { describe, expect, it } from "vitest";
import type { StatusEntry } from "@/lib/riot/types";
import { currentIssues } from "./riot-status";

function entry(
  titles: Record<string, string>,
  maintenance_status: StatusEntry["maintenance_status"] = null,
): StatusEntry {
  return {
    maintenance_status,
    titles: Object.entries(titles).map(([locale, content]) => ({ locale, content })),
  };
}

describe("currentIssues", () => {
  it("lists incidents and in-progress maintenance in English", () => {
    const status = {
      incidents: [entry({ fr_FR: "Problèmes de connexion", en_US: "Login issues" })],
      maintenances: [
        entry({ en_US: "Ranked disabled" }, "in_progress"),
        entry({ en_US: "Patch 26.21 downtime" }, "scheduled"),
      ],
    };
    expect(currentIssues(status)).toEqual(["Login issues", "Ranked disabled"]);
  });

  it("falls back to another English locale, then any title", () => {
    const status = {
      incidents: [entry({ de_DE: "Störung", en_GB: "Match history delayed" }), entry({ ko_KR: "점검" })],
      maintenances: [],
    };
    expect(currentIssues(status)).toEqual(["Match history delayed", "점검"]);
  });

  it("drops duplicates and empty titles", () => {
    const status = {
      incidents: [entry({ en_US: "Login issues" }), entry({ en_US: "Login issues" }), entry({})],
      maintenances: [],
    };
    expect(currentIssues(status)).toEqual(["Login issues"]);
  });
});
