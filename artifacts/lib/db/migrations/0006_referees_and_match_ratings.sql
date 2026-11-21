BEGIN;

ALTER TABLE football_matches
  ADD COLUMN IF NOT EXISTS referee_user_id text,
  ADD COLUMN IF NOT EXISTS referee_name text,
  ADD COLUMN IF NOT EXISTS referee_avatar_url text;

CREATE TABLE IF NOT EXISTS match_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES football_matches(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  pitch_rating integer NOT NULL CHECK (pitch_rating BETWEEN 1 AND 5),
  referee_rating integer CHECK (referee_rating IS NULL OR referee_rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_ratings_match_user_idx UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS match_ratings_match_idx ON match_ratings(match_id);

COMMIT;
