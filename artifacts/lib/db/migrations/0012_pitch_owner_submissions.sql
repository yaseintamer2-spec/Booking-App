BEGIN;

CREATE TABLE IF NOT EXISTS pitch_owner_access (
  email text PRIMARY KEY,
  venue_name text NOT NULL,
  neighborhood text NOT NULL,
  address text NOT NULL,
  granted_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pitch_match_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text NOT NULL,
  owner_email text NOT NULL,
  venue_name text NOT NULL,
  neighborhood text NOT NULL,
  address text NOT NULL,
  contact_phone text NOT NULL CHECK (length(trim(contact_phone)) >= 8),
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 120 CHECK (duration_minutes BETWEEN 30 AND 240),
  capacity integer NOT NULL DEFAULT 14 CHECK (capacity BETWEEN 2 AND 30),
  price_halalas integer NOT NULL CHECK (price_halalas >= 0),
  compare_at_price_halalas integer NOT NULL CHECK (compare_at_price_halalas >= price_halalas),
  referee_included boolean NOT NULL DEFAULT true,
  water_included boolean NOT NULL DEFAULT true,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by_user_id text,
  reviewed_at timestamptz,
  match_id uuid REFERENCES football_matches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pitch_match_submissions_owner_created_idx
  ON pitch_match_submissions(owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS pitch_match_submissions_status_starts_idx
  ON pitch_match_submissions(status, starts_at);

COMMIT;
