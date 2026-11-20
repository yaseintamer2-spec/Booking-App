BEGIN;

ALTER TABLE football_matches
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
