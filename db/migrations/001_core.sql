-- AFTERLIFE core schema. Every row is scoped by party_id ('live' or 'demo') so demo/test
-- data can be reset without touching real party data.

CREATE TABLE IF NOT EXISTS party (
  id            text PRIMARY KEY,               -- 'live' | 'demo'
  kind          text NOT NULL,                  -- 'live' | 'demo'
  status        text NOT NULL DEFAULT 'idle',   -- idle | running | paused | ended
  mode          text NOT NULL DEFAULT 'normal', -- normal | tribute_only
  settings      jsonb NOT NULL DEFAULT '{}',
  phase         jsonb NOT NULL DEFAULT '{"kind":"ambient"}',
  version       integer NOT NULL DEFAULT 0,     -- increments on every phase/state change
  set_seq       integer NOT NULL DEFAULT 0,
  rng_seed      text NOT NULL DEFAULT 'afterlife',
  paused_at     timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team (
  id                 uuid PRIMARY KEY,
  party_id           text NOT NULL REFERENCES party(id),
  name               text NOT NULL,
  color              text NOT NULL,
  avatar             text NOT NULL,
  invite_code        text NOT NULL,             -- short scoped join code, never shown on TV/leaderboard
  captain_member_id  uuid,
  status             text NOT NULL DEFAULT 'active', -- active | away | removed | merged
  merged_into        uuid,
  away_since         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, invite_code)
);

CREATE TABLE IF NOT EXISTS member (
  id            uuid PRIMARY KEY,
  party_id      text NOT NULL REFERENCES party(id),
  team_id       uuid NOT NULL REFERENCES team(id),
  display_name  text NOT NULL,
  session_hash  text NOT NULL UNIQUE,           -- sha256 of the bearer session secret
  last_seen     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_team_idx ON member(team_id);

CREATE TABLE IF NOT EXISTS game_set (
  id              uuid PRIMARY KEY,
  party_id        text NOT NULL REFERENCES party(id),
  seq             integer NOT NULL,
  family          text NOT NULL,
  status          text NOT NULL DEFAULT 'running',   -- running | complete | invalidated
  invalid_reason  text,
  cohort          jsonb NOT NULL DEFAULT '[]',        -- team ids snapshotted at intro (active)
  eligible        jsonb NOT NULL DEFAULT '[]',        -- cohort members connected during intro => ranked
  seed            text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  UNIQUE (party_id, seq)
);

CREATE TABLE IF NOT EXISTS question (
  id           uuid PRIMARY KEY,
  party_id     text NOT NULL REFERENCES party(id),
  set_id       uuid NOT NULL REFERENCES game_set(id),
  idx          integer NOT NULL,
  content_id   text NOT NULL,
  public       jsonb NOT NULL,     -- safe to send to clients during play
  private      jsonb NOT NULL,     -- answer + reveal; only sent after reveal
  status       text NOT NULL DEFAULT 'pending', -- pending | open | revealed | void
  void_reason  text,
  opened_at    timestamptz,
  revealed_at  timestamptz,
  UNIQUE (set_id, idx)
);

CREATE TABLE IF NOT EXISTS answer (
  id           uuid PRIMARY KEY,
  party_id     text NOT NULL,
  question_id  uuid NOT NULL REFERENCES question(id),
  team_id      uuid NOT NULL REFERENCES team(id),
  member_id    uuid NOT NULL REFERENCES member(id),
  kind         text NOT NULL,          -- answer | prefer | predict
  choice       integer NOT NULL,
  request_id   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, team_id, kind)
);

CREATE TABLE IF NOT EXISTS score_ledger (
  id           uuid PRIMARY KEY,
  party_id     text NOT NULL,
  team_id      uuid NOT NULL REFERENCES team(id),
  set_id       uuid REFERENCES game_set(id),
  question_id  uuid REFERENCES question(id),
  kind         text NOT NULL,           -- question | adjust | merge
  points       integer NOT NULL,
  reason       text,
  actor        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Scoring a question for a team can only ever happen once.
CREATE UNIQUE INDEX IF NOT EXISTS score_once ON score_ledger(question_id, team_id) WHERE kind = 'question';

CREATE TABLE IF NOT EXISTS content_exposure (
  party_id    text NOT NULL,
  content_id  text NOT NULL,
  shown       integer NOT NULL DEFAULT 0,
  last_shown  timestamptz,
  PRIMARY KEY (party_id, content_id)
);

CREATE TABLE IF NOT EXISTS content_override (
  content_id  text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tribute (
  id              uuid PRIMARY KEY,
  party_id        text NOT NULL REFERENCES party(id),
  person_name     text NOT NULL,
  remembrance     text NOT NULL DEFAULT '',
  attribution     text NOT NULL DEFAULT '',
  photo_key       text NOT NULL,        -- display derivative (re-encoded, metadata stripped)
  thumb_key       text NOT NULL,
  original_key    text,                 -- private normalized original kept for re-crops; deleted with tribute
  width           integer NOT NULL,
  height          integer NOT NULL,
  fit             text NOT NULL DEFAULT 'contain',  -- contain | cover
  focal_x         real NOT NULL DEFAULT 0.5,
  focal_y         real NOT NULL DEFAULT 0.5,
  rotation        integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'published', -- published | hidden | deleted
  consent         boolean NOT NULL,
  edit_token_hash text NOT NULL UNIQUE,
  display_count   integer NOT NULL DEFAULT 0,
  last_shown_at   timestamptz,
  priority        integer NOT NULL DEFAULT 0,        -- >0 => feature next
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tribute_party_idx ON tribute(party_id, status);

CREATE TABLE IF NOT EXISTS admin_session (
  id_hash     text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id        bigserial PRIMARY KEY,
  party_id  text,
  actor     text NOT NULL,
  action    text NOT NULL,
  detail    jsonb NOT NULL DEFAULT '{}',
  at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit (
  key           text PRIMARY KEY,
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL
);

INSERT INTO party (id, kind) VALUES ('live', 'live') ON CONFLICT DO NOTHING;
INSERT INTO party (id, kind) VALUES ('demo', 'demo') ON CONFLICT DO NOTHING;
