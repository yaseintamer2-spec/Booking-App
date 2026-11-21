BEGIN;

CREATE TABLE IF NOT EXISTS player_career_stats (
  user_id text PRIMARY KEY,
  matches_played integer NOT NULL DEFAULT 0,
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  yellow_cards integer NOT NULL DEFAULT 0,
  red_cards integer NOT NULL DEFAULT 0,
  fair_play_points integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

WITH per_match_player AS (
  SELECT r.user_id, m.id AS match_id,
    count(e.id) FILTER (WHERE e.type = 'goal' AND e.scorer_user_id = r.user_id)::integer AS goals,
    count(e.id) FILTER (WHERE e.type = 'goal' AND e.assist_user_id = r.user_id)::integer AS assists,
    count(e.id) FILTER (WHERE e.type = 'yellow_card' AND e.scorer_user_id = r.user_id)::integer AS yellow_cards,
    count(e.id) FILTER (WHERE e.type = 'red_card' AND e.scorer_user_id = r.user_id)::integer AS red_cards
  FROM football_matches m
  INNER JOIN match_registrations r ON r.match_id = m.id AND r.status IN ('joined', 'checked_in')
  LEFT JOIN match_events e ON e.match_id = m.id AND e.voided_at IS NULL
  WHERE m.live_status = 'full_time'
  GROUP BY r.user_id, m.id
)
INSERT INTO player_career_stats (user_id, matches_played, goals, assists, yellow_cards, red_cards, fair_play_points)
SELECT user_id, count(*)::integer, sum(goals)::integer, sum(assists)::integer,
  sum(yellow_cards)::integer, sum(red_cards)::integer,
  sum(greatest(0, 100 - yellow_cards * 10 - red_cards * 25))::integer
FROM per_match_player
GROUP BY user_id
ON CONFLICT (user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS player_career_stats_goals_idx ON player_career_stats(goals);
CREATE INDEX IF NOT EXISTS football_matches_live_status_ended_idx ON football_matches(live_status, live_ended_at);

COMMIT;
