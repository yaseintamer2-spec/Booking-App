BEGIN;

ALTER TABLE football_matches
  ADD COLUMN IF NOT EXISTS age_group text NOT NULL DEFAULT '13-16';

ALTER TABLE football_matches
  ADD CONSTRAINT football_matches_age_group_check
  CHECK (age_group IN ('13-16', '16-20', '20+'));

ALTER TABLE pitch_match_submissions
  ADD COLUMN IF NOT EXISTS age_group text NOT NULL DEFAULT '13-16';

ALTER TABLE pitch_match_submissions
  ADD CONSTRAINT pitch_match_submissions_age_group_check
  CHECK (age_group IN ('13-16', '16-20', '20+'));

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS age integer;

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS guardian_consent_attested_at timestamptz;

ALTER TABLE player_profiles
  ADD CONSTRAINT player_profiles_age_check
  CHECK (age IS NULL OR age BETWEEN 13 AND 120);

COMMIT;
