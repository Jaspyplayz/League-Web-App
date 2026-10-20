import { ChampionIcon } from "@/components/game-icons";
import { panelClass } from "@/components/ui/panel";
import { PanelHeading, SubHeading } from "@/components/ui/panel-heading";
import {
  MIN_RECAP_DEATHS,
  type Ability,
  type DamageSplit,
  type DeathRecap,
} from "@/lib/analyzer/death-recap";
import { plural } from "@/lib/analyzer/format";
import {
  championName,
  getChampionSpells,
  summonerSpellNamed,
  type DataDragon,
} from "@/lib/ddragon";

// "What keeps killing you": your death recaps added up across games
// (src/lib/analyzer/death-recap.ts). It leads with the one ability to respect,
// then the enemy champions in the most of your deaths and the kind of damage
// that killed you, which says what to build against.
export async function DeathRecapSection({
  recap,
  dd,
}: {
  recap: DeathRecap;
  dd: DataDragon | null;
}) {
  // Ability names come from each champion's own Data Dragon file, so only
  // the champions on the card are looked up.
  const spellLists = await Promise.all(
    recap.threats.map((t) => (dd ? getChampionSpells(dd, t.championName) : null)),
  );
  const spells = new Map(recap.threats.map((t, i) => [t.championName, spellLists[i]]));
  const abilityName = (champion: string, ability: Ability, spellName: string) =>
    nameOf(ability, spellName, spells.get(champion) ?? null, dd);
  const name = (champion: string) => championName(dd, champion);

  return (
    <section aria-labelledby="death-recap-heading" className="flex flex-col gap-3.5">
      <PanelHeading id="death-recap-heading">What keeps killing you</PanelHeading>
      {recap.deaths < MIN_RECAP_DEATHS ? (
        <p className={`px-5 py-4 text-[15px] text-muted ${panelClass}`}>
          <FillingIn recap={recap} />
        </p>
      ) : (
        <div className={`flex flex-col gap-5 p-5 ${panelClass}`}>
          {recap.respect && (
            <p className="text-[15px] text-ink-soft">
              Respect {name(recap.respect.championName)}&apos;s{" "}
              <strong className="font-semibold text-ink">
                {abilityName(
                  recap.respect.championName,
                  recap.respect.ability,
                  recap.respect.spellName,
                )}
              </strong>
              . It hit you in {recap.respect.deaths} of your {plural(recap.respect.of, "death")} to{" "}
              {name(recap.respect.championName)}.
            </p>
          )}
          <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
            <div className="flex min-w-0 flex-col gap-3">
              <SubHeading>In the most of your {plural(recap.deaths, "death")}</SubHeading>
              <ul className="flex flex-col gap-4">
                {recap.threats.map((threat) => (
                  <li key={threat.championName} className="flex gap-3">
                    <ChampionIcon
                      dd={dd}
                      name={threat.championName}
                      size={40}
                      className="rounded-lg"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <p className="text-sm">
                        <span className="font-semibold text-ink">{name(threat.championName)}</span>{" "}
                        <span className="text-muted">
                          in {threat.deaths} of {recap.deaths} · {Math.round(threat.share * 100)}%
                          of the damage
                        </span>
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {threat.abilities.slice(0, 3).map((a) => (
                          <li
                            key={`${a.ability}:${a.spellName}`}
                            className="rounded-sm border border-line px-2 py-0.5 text-xs text-ink-soft"
                          >
                            {abilityName(threat.championName, a.ability, a.spellName)}{" "}
                            <span className="font-mono text-faint">
                              {a.deaths}/{threat.deaths}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <DamageTypes
              damage={recap.damage}
              towerDeaths={recap.towerDeaths}
              deaths={recap.deaths}
            />
          </div>
        </div>
      )}
      {recap.deaths >= MIN_RECAP_DEATHS && (
        <p className="text-[13px] text-faint">
          From Riot&apos;s death recaps: the damage you took in the last seconds before each
          death. Crowd control isn&apos;t in them. The numbers after each ability are the deaths
          it hit you in, out of your deaths to that champion.
          {recap.undetailed > 0 &&
            ` ${plural(recap.undetailed, "death")} from games saved before Turnpoint kept death recaps ${recap.undetailed === 1 ? "is" : "are"} left out.`}
        </p>
      )}
    </section>
  );
}

// Before there are enough recaps to call anything a pattern.
function FillingIn({ recap }: { recap: DeathRecap }) {
  if (recap.deaths === 0 && recap.undetailed === 0) {
    return <>You didn&apos;t die in any of these games.</>;
  }
  const have =
    recap.deaths === 0
      ? "None of these deaths has a death recap yet."
      : `${plural(recap.deaths, "death")} with a death recap so far, and this needs ${MIN_RECAP_DEATHS}.`;
  return (
    <>
      {have} Turnpoint only started keeping Riot&apos;s death recaps recently, so this fills in as
      you play new games.
    </>
  );
}

const DAMAGE_TYPES = [
  { key: "physical", label: "Physical", counter: "armor" },
  { key: "magic", label: "Magic", counter: "magic resist" },
  { key: "true", label: "True", counter: null },
] as const;

// Physical, magic and true damage as shares of all the champion damage that
// killed you. When one kind is most of it, the matching resist does the most.
function DamageTypes({
  damage,
  towerDeaths,
  deaths,
}: {
  damage: DamageSplit;
  towerDeaths: number;
  deaths: number;
}) {
  const all = damage.physical + damage.magic + damage.true;
  const main = DAMAGE_TYPES.find((t) => all > 0 && damage[t.key] / all >= MOSTLY);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SubHeading>What the damage was</SubHeading>
      <ul className="flex flex-col gap-2.5">
        {DAMAGE_TYPES.map(({ key, label }) => {
          const share = all > 0 ? damage[key] / all : 0;
          return (
            <li key={key} className="flex items-center gap-3 text-sm">
              <span className="w-16 flex-none text-ink-soft">{label}</span>
              <div className="h-2 flex-1 rounded-sm bg-line" aria-hidden="true">
                <div className="h-2 rounded-sm bg-behind" style={{ width: `${share * 100}%` }} />
              </div>
              <span className="w-10 flex-none text-right font-mono text-faint">
                {Math.round(share * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
      {main?.counter && (
        <p className="text-note text-muted">
          Mostly {main.label.toLowerCase()} damage, so {main.counter} covers the most of it.
        </p>
      )}
      {towerDeaths >= 2 && (
        <p className="text-note text-muted">
          A tower was hitting you in {towerDeaths} of these {deaths} deaths.
        </p>
      )}
    </div>
  );
}

// One kind of damage is "most of it" from this share.
const MOSTLY = 0.6;

const SLOT_INDEX: Partial<Record<Ability, number>> = { Q: 0, W: 1, E: 2, R: 3 };

// "Dark Sphere (Q)", or just "Q" when Data Dragon isn't loaded.
function nameOf(
  ability: Ability,
  spellName: string,
  spells: string[] | null,
  dd: DataDragon | null,
): string {
  switch (ability) {
    case "basic":
      return "Basic attacks";
    case "summoner":
      return (dd && summonerSpellNamed(dd, spellName)?.name) ?? "Summoner spell";
    case "other":
      return "Passive and items";
    default: {
      const spell = spells?.[SLOT_INDEX[ability] ?? -1];
      return spell ? `${spell} (${ability})` : ability;
    }
  }
}
