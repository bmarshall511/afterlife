-- Engine additions (owner: engine). Never edit 001.

-- Internal engine bookkeeping (last family, objective count since social, pause remainder, encore flag).
ALTER TABLE party ADD COLUMN IF NOT EXISTS engine jsonb NOT NULL DEFAULT '{}';

-- Per-team set score, written once when a set finishes (results transition) and on merges/invalidations.
-- Ranking uses rows where ranked = true AND the set is 'complete'.
CREATE TABLE IF NOT EXISTS set_score (
  party_id    text NOT NULL,
  set_id      uuid NOT NULL REFERENCES game_set(id),
  team_id     uuid NOT NULL REFERENCES team(id),
  score       integer NOT NULL,
  ranked      boolean NOT NULL,
  normalized  boolean NOT NULL DEFAULT false,
  perfect     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (set_id, team_id)
);
CREATE INDEX IF NOT EXISTS set_score_team_idx ON set_score(party_id, team_id);

CREATE INDEX IF NOT EXISTS team_party_idx ON team(party_id, status);
CREATE INDEX IF NOT EXISTS member_party_seen_idx ON member(party_id, last_seen);
CREATE INDEX IF NOT EXISTS answer_q_idx ON answer(question_id, kind);
CREATE INDEX IF NOT EXISTS ledger_team_idx ON score_ledger(party_id, team_id);
CREATE INDEX IF NOT EXISTS question_set_idx ON question(set_id);
