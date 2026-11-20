BEGIN;

ALTER TABLE match_registrations
  ADD COLUMN IF NOT EXISTS pitch_slot integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'match_registrations_pitch_slot_check'
      AND conrelid = 'match_registrations'::regclass
  ) THEN
    ALTER TABLE match_registrations
      ADD CONSTRAINT match_registrations_pitch_slot_check
      CHECK (pitch_slot IS NULL OR (pitch_slot >= 0 AND pitch_slot < 14));
  END IF;
END
$$;

WITH ranked_registrations AS (
  SELECT
    id,
    match_id,
    row_number() OVER (PARTITION BY match_id ORDER BY created_at, id) - 1 AS slot_order
  FROM match_registrations
  WHERE status IN ('joined', 'checked_in') AND pitch_slot IS NULL
)
UPDATE match_registrations AS registration
SET pitch_slot = CASE
  WHEN ranked.slot_order % 2 = 0 THEN (ranked.slot_order / 2)::integer
  ELSE 7 + (ranked.slot_order / 2)::integer
END
FROM ranked_registrations AS ranked
WHERE registration.id = ranked.id
  AND ranked.slot_order < 14
  AND NOT EXISTS (
    SELECT 1
    FROM match_registrations AS already_assigned
    WHERE already_assigned.match_id = registration.match_id
      AND already_assigned.pitch_slot IS NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS match_registrations_match_pitch_slot_idx
  ON match_registrations(match_id, pitch_slot)
  WHERE pitch_slot IS NOT NULL AND status IN ('joined', 'checked_in');

COMMIT;
