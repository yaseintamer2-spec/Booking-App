BEGIN;

ALTER TABLE player_career_stats
  ADD COLUMN IF NOT EXISTS wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS draws integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS losses integer NOT NULL DEFAULT 0;

ALTER TABLE player_notifications
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS player_notifications_match_reminder_unique
  ON player_notifications(user_id, match_id)
  WHERE kind = 'match_reminder' AND match_id IS NOT NULL;

WITH scores AS (
  SELECT match_id,
    count(*) FILTER (WHERE team = 'red')::integer AS red_score,
    count(*) FILTER (WHERE team = 'blue')::integer AS blue_score
  FROM match_events
  WHERE type = 'goal' AND voided_at IS NULL
  GROUP BY match_id
), ranked_players AS (
  SELECT r.match_id, r.user_id, r.pitch_slot, m.capacity,
    row_number() OVER (PARTITION BY r.match_id ORDER BY r.pitch_slot ASC NULLS LAST, r.created_at ASC) - 1 AS player_index,
    count(*) OVER (PARTITION BY r.match_id) AS player_count
  FROM match_registrations r
  INNER JOIN football_matches m ON m.id = r.match_id AND m.live_status = 'full_time'
  WHERE r.status IN ('joined', 'checked_in')
), player_results AS (
  SELECT p.user_id,
    CASE WHEN COALESCE(s.red_score, 0) = COALESCE(s.blue_score, 0) THEN 'draw'
      WHEN (CASE WHEN p.pitch_slot IS NOT NULL THEN p.pitch_slot < ceil(p.capacity / 2.0)
        ELSE p.player_index < ceil(p.player_count / 2.0) END) = (COALESCE(s.red_score, 0) > COALESCE(s.blue_score, 0)) THEN 'win'
      ELSE 'loss' END AS result
  FROM ranked_players p
  LEFT JOIN scores s ON s.match_id = p.match_id
), totals AS (
  SELECT user_id,
    count(*) FILTER (WHERE result = 'win')::integer AS wins,
    count(*) FILTER (WHERE result = 'draw')::integer AS draws,
    count(*) FILTER (WHERE result = 'loss')::integer AS losses
  FROM player_results
  GROUP BY user_id
)
UPDATE player_career_stats career
SET wins = totals.wins, draws = totals.draws, losses = totals.losses
FROM totals
WHERE career.user_id = totals.user_id;

COMMIT;

