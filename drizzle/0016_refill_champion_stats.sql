-- The same copy as 0015, for games saved after 0015 ran by code that didn't
-- know the new columns yet: the live site kept running the old code for a
-- minute after the Champions tab was merged, and saved 30 games then. Only
-- touches rows still missing the numbers, so it's quick and safe to re-run.
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
  AND p->>'puuid' = mp."puuid"
  AND mp."individual_position" IS NULL;
