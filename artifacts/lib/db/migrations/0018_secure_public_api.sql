-- Keep the existing trusted API server working while closing direct table
-- access for Supabase's public client roles. The API must connect with a
-- server-only database role that can access these tables (for example,
-- Supabase's postgres role, which has BYPASSRLS). Clients receive only the
-- safe match-list RPC below.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;

ALTER TABLE public.football_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_alert_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_career_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pitch_owner_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pitch_match_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referee_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referee_match_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.list_published_matches(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_neighborhood text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  venue_name text,
  neighborhood text,
  address text,
  starts_at timestamptz,
  duration_minutes integer,
  format text,
  capacity integer,
  age_group text,
  booked_count integer,
  spots_remaining integer,
  price_halalas integer,
  compare_at_price_halalas integer,
  status text,
  referee_included boolean,
  referee_user_id text,
  referee_name text,
  referee_avatar_url text,
  pitch_rating_average numeric,
  pitch_rating_count integer,
  water_included boolean,
  image_url text,
  image_urls jsonb,
  is_demo boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.id,
    m.venue_name,
    m.neighborhood,
    m.address,
    m.starts_at,
    m.duration_minutes,
    m.format,
    m.capacity,
    m.age_group,
    m.booked_count,
    greatest(0, m.capacity - m.booked_count)::integer AS spots_remaining,
    m.price_halalas,
    m.compare_at_price_halalas,
    m.status,
    m.referee_included,
    m.referee_user_id,
    m.referee_name,
    m.referee_avatar_url,
    ratings.pitch_rating_average,
    ratings.pitch_rating_count,
    m.water_included,
    m.image_url,
    m.image_urls,
    m.is_demo,
    m.created_at
  FROM public.football_matches AS m
  LEFT JOIN LATERAL (
    SELECT
      avg(r.pitch_rating)::numeric AS pitch_rating_average,
      count(r.id)::integer AS pitch_rating_count
    FROM public.match_ratings AS r
    INNER JOIN public.football_matches AS rated_match ON rated_match.id = r.match_id
    WHERE rated_match.venue_name = m.venue_name
  ) AS ratings ON true
  WHERE m.status = 'published'
    AND m.starts_at > now()
    AND m.booked_count < m.capacity
    AND (p_from IS NULL OR m.starts_at >= p_from)
    AND (p_to IS NULL OR m.starts_at < p_to)
    AND (nullif(trim(p_neighborhood), '') IS NULL OR lower(m.neighborhood) = lower(trim(p_neighborhood)))
  ORDER BY m.starts_at ASC;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.list_published_matches(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_published_matches(timestamptz, timestamptz, text) TO anon, authenticated;
