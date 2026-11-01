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

  const enough = recap.championDeaths >= MIN_RECAP_DEATHS;
  return (
    <section
      aria-labelledby="death-recap-heading"
      className={`${panelClass} flex flex-col gap-4 p-4 sm:px-5`}
    >
      <PanelHeading id="death-recap-heading">What keeps killing you</PanelHeading>
      {!enough ? (
        <p className="text-body text-quiet">
          <FillingIn recap={recap} />
        </p>
      ) : (
        <>
          {recap.respect && (
            <p className="text-body">
              Respect {name(recap.respect.championName)}&apos;s{" "}
              <strong className="font-semibold">
                {abilityName(
                  recap.respect.championName,
                  recap.respect.ability,
                  recap.respect.spellName,
                )}
              </strong>
              . It hit you in {recap.respect.deaths} of the {plural(recap.respect.of, "death")}{" "}
              {name(recap.respect.championName)} was in.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <SubHeading>In the most of your {plural(recap.deaths, "death")}</SubHeading>
            <ul className="grid gap-x-6 gap-y-4 md:grid-cols-3">
              {recap.threats.map((threat) => (
                <li key={threat.championName} className="flex min-w-0 gap-3">
                  <ChampionIcon dd={dd} name={threat.championName} size={32} className="shrink-0 self-start rounded-md" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-body">
                      <span className="font-semibold">{name(threat.championName)}</span>{" "}
                      <span className="text-note text-quiet">
                        in {threat.deaths} of {recap.deaths} · {Math.round(threat.share * 100)}% of
                        the damage
                      </span>
                    </p>
                    <ul className="flex flex-col gap-0.5 text-note tabular-nums">
                      {threat.abilities.slice(0, 3).map((a) => (
                        <li
                          key={`${a.ability}:${a.spellName}`}
                          className="flex max-w-[340px] justify-between gap-3"
                        >
                          <span>{abilityName(threat.championName, a.ability, a.spellName)}</span>
                          <span className="text-quiet">
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
          <p className="text-note text-quiet">
            From Riot&apos;s death recaps: the damage you took in the last seconds before each
            death. Crowd control isn&apos;t in them. A champion was in a death when they did any
            damage in it, not only when they got the kill. The numbers after each ability are the
            deaths it hit you in, out of the deaths that champion was in.
            {recap.undetailed > 0 &&
              ` ${plural(recap.undetailed, "death")} from games saved before Turnpoint kept death recaps ${recap.undetailed === 1 ? "is" : "are"} left out.`}
          </p>
        </>
      )}
    </section>
  );
}

// Before there are enough recaps to call anything a pattern.
function FillingIn({ recap }: { recap: DeathRecap }) {
  if (recap.deaths === 0 && recap.undetailed === 0) {
    return <>You didn&apos;t die in any of these games.</>;
  }
  const have = `${plural(recap.championDeaths, "death")} with an enemy champion in the death recap so far, and this needs ${MIN_RECAP_DEATHS}.`;
  // Every death has a recap, so you just haven't died to champions much.
  if (recap.undetailed === 0) return <>{have}</>;
  return (
    <>
      {recap.deaths === 0 ? "None of these deaths has a death recap yet." : have} Turnpoint only
      started keeping Riot&apos;s death recaps recently, so this fills in as you play new games.
    </>
  );
}

// Each kind of damage gets a neutral shade, not blue or red: all of it is
// damage you took, so none of it is you against the opponent. Each shade is
// at least 3:1 against the panel in both themes, so the smallest part shows.
const DAMAGE_TYPES = [
  { key: "physical", label: "Physical", counter: "armor", fill: "bg-main" },
  { key: "magic", label: "Magic", counter: "magic resist", fill: "bg-quiet" },
  { key: "true", label: "True", counter: null, fill: "bg-placeholder" },
] as const;

// Physical, magic and true damage as shares of all the champion damage that
// killed you, in one split bar. When one kind is most of it, the matching
// resist does the most.
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
  const parts = DAMAGE_TYPES.map((t) => ({
    ...t,
    percent: all > 0 ? Math.round((damage[t.key] / all) * 100) : 0,
  }));
  return (
    <div className="flex flex-col gap-2">
      <SubHeading>What the damage was</SubHeading>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${p.percent}%`).join(", ")}
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-sm"
      >
        {parts.map(
          (p) =>
            p.percent > 0 && (
              <span key={p.key} className={`h-full ${p.fill}`} style={{ width: `${p.percent}%` }} />
            ),
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-note tabular-nums" aria-hidden="true">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className={`size-3 rounded-sm ${p.fill}`} />
            {p.label} {p.percent}%
          </li>
        ))}
      </ul>
      {main?.counter && (
        <p className="text-note text-quiet">
          Mostly {main.label.toLowerCase()} damage, so {main.counter} covers the most of it.
        </p>
      )}
      {towerDeaths >= 2 && (
        <p className="text-note text-quiet">
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
