-- Fair-queue round counter. display_count stays the true "times shown"; queue_round is the
-- ordering key. New/unhidden tributes start at the current minimum round so they are shown
-- promptly (never-shown first) without being replayed repeatedly while older ones starve.
ALTER TABLE tribute ADD COLUMN IF NOT EXISTS queue_round integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS tribute_queue_idx ON tribute(party_id, status, priority DESC, queue_round, last_shown_at);
