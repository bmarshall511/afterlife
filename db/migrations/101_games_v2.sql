-- Games v2: structured answers (order, number, text, vote, assignment).
ALTER TABLE answer ADD COLUMN IF NOT EXISTS value jsonb;
ALTER TABLE answer ALTER COLUMN choice DROP NOT NULL;
-- Calavera entries can be hidden by the host (word filter misses, etc.).
ALTER TABLE answer ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE game_set ADD COLUMN IF NOT EXISTS doubled boolean NOT NULL DEFAULT false;
