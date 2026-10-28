-- Team that submitted a tribute (set only when the upload carried a valid guest session for that party).
-- Grants that team's members list/edit/remove of their own tributes, alongside the private edit token.
ALTER TABLE tribute ADD COLUMN IF NOT EXISTS submitted_team_id uuid NULL;
CREATE INDEX IF NOT EXISTS tribute_team_idx ON tribute(party_id, submitted_team_id) WHERE submitted_team_id IS NOT NULL;
