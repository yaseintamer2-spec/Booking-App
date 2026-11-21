BEGIN;

CREATE TABLE IF NOT EXISTS admin_access (
  email text PRIMARY KEY,
  granted_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
