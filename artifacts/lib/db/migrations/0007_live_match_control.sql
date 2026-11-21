BEGIN;

ALTER TABLE football_matches
  ADD COLUMN IF NOT EXISTS live_status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS live_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_phase_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_first_half_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_second_half_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_ended_at timestamptz;

CREATE TABLE IF NOT EXISTS match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES football_matches(id) ON DELETE CASCADE,
  client_event_id text NOT NULL,
  type text NOT NULL DEFAULT 'goal' CHECK (type IN ('goal')),
  team text NOT NULL CHECK (team IN ('red', 'blue')),
  period integer NOT NULL CHECK (period IN (1, 2)),
  minute integer NOT NULL CHECK (minute > 0),
  scorer_user_id text NOT NULL,
  scorer_name text NOT NULL,
  assist_user_id text,
  assist_name text,
  occurred_at timestamptz NOT NULL,
  recorded_by_user_id text NOT NULL,
  voided_at timestamptz,
  voided_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_events_client_event_idx UNIQUE (match_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS match_events_match_created_idx ON match_events(match_id, created_at);

COMMIT;
