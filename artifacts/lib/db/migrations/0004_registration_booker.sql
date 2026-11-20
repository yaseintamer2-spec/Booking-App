BEGIN;

ALTER TABLE match_registrations
  ADD COLUMN IF NOT EXISTS booked_by_user_id text;

UPDATE match_registrations
SET booked_by_user_id = user_id
WHERE booked_by_user_id IS NULL;

ALTER TABLE match_registrations
  ALTER COLUMN booked_by_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS match_registrations_booker_status_idx
  ON match_registrations(booked_by_user_id, status);

COMMIT;
