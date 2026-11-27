BEGIN;

ALTER TABLE pitch_match_submissions
  ADD COLUMN rental_price_halalas integer;

ALTER TABLE pitch_match_submissions
  ADD CONSTRAINT pitch_match_submissions_rental_price_check
  CHECK (rental_price_halalas IS NULL OR rental_price_halalas > 0);

COMMIT;
