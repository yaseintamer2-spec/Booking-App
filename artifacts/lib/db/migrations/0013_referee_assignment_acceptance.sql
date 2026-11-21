BEGIN;

ALTER TABLE football_matches
  ADD COLUMN IF NOT EXISTS referee_assignment_status text;

CREATE TABLE IF NOT EXISTS referee_access (
  email text PRIMARY KEY,
  granted_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Existing referee assignments were already active; preserve their access.
UPDATE football_matches
SET referee_assignment_status = 'accepted'
WHERE referee_user_id IS NOT NULL
  AND referee_assignment_status IS NULL;

ALTER TABLE football_matches
  ADD CONSTRAINT football_matches_referee_assignment_status_check
  CHECK (referee_assignment_status IS NULL OR referee_assignment_status IN ('pending', 'accepted', 'declined'));

COMMIT;
