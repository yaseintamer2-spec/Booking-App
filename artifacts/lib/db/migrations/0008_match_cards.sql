ALTER TABLE match_events DROP CONSTRAINT IF EXISTS match_events_type_check;
ALTER TABLE match_events ADD CONSTRAINT match_events_type_check CHECK (type IN ('goal', 'yellow_card', 'red_card'));
