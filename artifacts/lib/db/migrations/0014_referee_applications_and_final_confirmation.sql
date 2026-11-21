BEGIN;

ALTER TABLE football_matches
  DROP CONSTRAINT IF EXISTS football_matches_referee_assignment_status_check;

ALTER TABLE football_matches
  ADD CONSTRAINT football_matches_referee_assignment_status_check
  CHECK (referee_assignment_status IS NULL OR referee_assignment_status IN ('pending', 'referee_confirmed', 'accepted', 'declined'));

CREATE TABLE IF NOT EXISTS referee_match_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES football_matches(id) ON DELETE CASCADE,
  referee_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'confirmed', 'declined', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referee_match_applications_match_user_unique UNIQUE (match_id, referee_user_id)
);

CREATE INDEX IF NOT EXISTS referee_match_applications_status_created_idx
  ON referee_match_applications(status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS player_notifications_referee_24h_unique
  ON player_notifications(user_id, match_id)
  WHERE kind = 'referee_match_reminder_24h' AND match_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS player_notifications_referee_1h_unique
  ON player_notifications(user_id, match_id)
  WHERE kind = 'referee_match_reminder_1h' AND match_id IS NOT NULL;

COMMIT;
