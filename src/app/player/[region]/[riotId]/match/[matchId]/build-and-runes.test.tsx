import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PickerPlayer } from "@/components/player-picker";
import type { BuildView } from "@/lib/match-builds";
import { BuildAndRunes } from "./build-and-runes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const build: BuildView = {
  items: [{ minute: 0, items: [{ id: 1055, name: "Doran's Blade", iconUrl: null }] }],
  skills: [1, 3, 2, 1, 1, 4],
};
const players: PickerPlayer[] = [
  {
    participantId: 1,
    teamId: 100,
    ally: true,
    won: true,
    label: "Ahri",
    icon: null,
  },
];

function render(dataDragonFailed: boolean): string {
  return renderToStaticMarkup(
    <BuildAndRunes
      builds={{ 1: build }}
      runePages={{ 1: <p>Electrocute</p> }}
      players={players}
      defaultPlayerId={1}
      dataDragonFailed={dataDragonFailed}
    />,
  );
}

describe("Build and runes", () => {
  it("shows the build and runes when Data Dragon loaded", () => {
    const html = render(false);
    expect(html).toContain("Item build");
    expect(html).toContain("Doran&#x27;s Blade");
    expect(html).toContain("Electrocute");
    expect(html).not.toContain('role="alert"');
  });

  it("shows a problem panel in place of the items and runes when Data Dragon failed", () => {
    const html = render(true);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Items and runes can&#x27;t load from Riot right now");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Item build");
    expect(html).not.toContain("Electrocute");
    // The skill order doesn't need Data Dragon, so it still shows.
    expect(html).toContain("Skill order");
    expect(html).toMatch(/<th scope="row"[^>]*>Q<\/th>/);
  });
});
