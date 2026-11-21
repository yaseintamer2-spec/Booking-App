BEGIN;

CREATE TABLE IF NOT EXISTS legal_acceptances (
  user_id text PRIMARY KEY,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
