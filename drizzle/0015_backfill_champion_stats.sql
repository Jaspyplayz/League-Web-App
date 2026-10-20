-- Fills the columns added in 0014 for games saved before them, by copying
-- each player's numbers out of the match JSON already in matches.raw. New
-- games get them when they're saved (src/db/rows.ts). Same rules as
-- participantRows: cs_at_10 is lane minions plus jungle monsters in the
-- first 10 minutes, rounded, and null when the game has no challenges.
UPDATE "match_participants" AS mp
SET
  "individual_position" = p->>'individualPosition',
  "damage_taken" = (p->>'totalDamageTaken')::integer,
  "objective_damage" = (p->>'damageDealtToObjectives')::integer,
  "early_surrender" = (p->>'gameEndedInEarlySurrender')::boolean,
  "wards_placed" = (p->>'wardsPlaced')::smallint,
  "wards_killed" = (p->>'wardsKilled')::smallint,
  "control_wards" = (p->>'detectorWardsPlaced')::smallint,
  "double_kills" = (p->>'doubleKills')::smallint,
  "triple_kills" = (p->>'tripleKills')::smallint,
  "quadra_kills" = (p->>'quadraKills')::smallint,
  "penta_kills" = (p->>'pentaKills')::smallint,
  "cs_at_10" = CASE
    WHEN p->'challenges' ? 'laneMinionsFirst10Minutes'
      OR p->'challenges' ? 'jungleCsBefore10Minutes'
    THEN round(
      coalesce((p->'challenges'->>'laneMinionsFirst10Minutes')::numeric, 0)
      + coalesce((p->'challenges'->>'jungleCsBefore10Minutes')::numeric, 0)
    )::smallint
  END
FROM "matches" AS m
CROSS JOIN LATERAL jsonb_array_elements(m."raw"->'info'->'participants') AS p
WHERE m."match_id" = mp."match_id"
  AND p->>'puuid' = mp."puuid";
