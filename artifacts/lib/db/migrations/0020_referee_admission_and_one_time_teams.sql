ALTER TABLE public.football_matches
  ADD COLUMN IF NOT EXISTS teams_generated_at timestamptz;
