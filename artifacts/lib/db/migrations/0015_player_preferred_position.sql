BEGIN;

CREATE TABLE IF NOT EXISTS player_profiles (
  user_id text PRIMARY KEY,
  preferred_position text NOT NULL CHECK (preferred_position IN ('striker', 'defender', 'midfielder', 'winger')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
