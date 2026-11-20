BEGIN;

ALTER TABLE football_matches
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE football_matches
SET image_urls = jsonb_build_array(image_url)
WHERE image_url LIKE 'https://%'
  AND image_urls = '[]'::jsonb;

COMMIT;
