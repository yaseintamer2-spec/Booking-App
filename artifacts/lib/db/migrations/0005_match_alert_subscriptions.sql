BEGIN;

CREATE TABLE IF NOT EXISTS match_alert_subscriptions (
  user_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
