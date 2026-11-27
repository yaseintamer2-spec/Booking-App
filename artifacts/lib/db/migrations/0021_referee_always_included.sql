BEGIN;

ALTER TABLE football_matches
  ALTER COLUMN referee_included SET DEFAULT true;

ALTER TABLE pitch_match_submissions
  ALTER COLUMN referee_included SET DEFAULT true;

UPDATE football_matches
SET referee_included = true
WHERE referee_included IS DISTINCT FROM true;

UPDATE pitch_match_submissions
SET referee_included = true
WHERE referee_included IS DISTINCT FROM true;

COMMIT;
