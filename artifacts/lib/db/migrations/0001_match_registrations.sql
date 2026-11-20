BEGIN;

CREATE TABLE IF NOT EXISTS match_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES football_matches(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  first_name text NOT NULL,
  avatar_url text,
  position_preference text NOT NULL DEFAULT 'anywhere',
  status text NOT NULL DEFAULT 'joined',
  payment_status text NOT NULL DEFAULT 'unpaid',
  checkin_token_hash text,
  checkin_expires_at timestamptz,
  checked_in_at timestamptz,
  offer_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_registrations_status_check CHECK (status IN ('joined', 'waitlisted', 'offered', 'cancelled', 'checked_in')),
  CONSTRAINT match_registrations_position_check CHECK (position_preference IN ('anywhere', 'goalkeeper', 'defender', 'midfielder', 'attacker'))
);

CREATE UNIQUE INDEX IF NOT EXISTS match_registrations_match_user_idx ON match_registrations(match_id, user_id);
CREATE INDEX IF NOT EXISTS match_registrations_match_status_created_idx ON match_registrations(match_id, status, created_at);
CREATE INDEX IF NOT EXISTS match_registrations_user_status_idx ON match_registrations(user_id, status);

CREATE TABLE IF NOT EXISTS player_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  match_id uuid REFERENCES football_matches(id) ON DELETE CASCADE,
  kind text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_notifications_user_created_idx ON player_notifications(user_id, created_at);

COMMIT;

