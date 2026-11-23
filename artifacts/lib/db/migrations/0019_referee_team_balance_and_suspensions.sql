ALTER TABLE public.match_registrations
  ADD COLUMN IF NOT EXISTS live_team text;

ALTER TABLE public.match_registrations
  DROP CONSTRAINT IF EXISTS match_registrations_live_team_check;
ALTER TABLE public.match_registrations
  ADD CONSTRAINT match_registrations_live_team_check
  CHECK (live_team IS NULL OR live_team IN ('red', 'blue'));

ALTER TABLE public.match_events
  ADD COLUMN IF NOT EXISTS suspension_minutes integer;
ALTER TABLE public.match_events
  DROP CONSTRAINT IF EXISTS match_events_suspension_minutes_check;
ALTER TABLE public.match_events
  ADD CONSTRAINT match_events_suspension_minutes_check
  CHECK (suspension_minutes IS NULL OR suspension_minutes IN (15, 30));
