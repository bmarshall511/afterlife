-- Party photo album: guest photos taken at the party. Raw uploads land under album-raw/ and are
-- re-encoded (metadata stripped) into full/display/thumb objects before a row is inserted.
-- No foreign keys to team: team rows may be removed/reset by the engine; team_id is informational.
CREATE TABLE IF NOT EXISTS album_photo (
  id             uuid PRIMARY KEY,
  party_id       text NOT NULL,
  full_key       text NOT NULL,
  display_key    text NOT NULL,
  thumb_key      text NOT NULL,
  width          integer NOT NULL,
  height         integer NOT NULL,
  bytes          integer NOT NULL,
  caption        text NOT NULL DEFAULT '',
  taken_by       text NOT NULL DEFAULT '',
  team_id        uuid,
  status         text NOT NULL DEFAULT 'published', -- published | hidden | deleted
  display_count  integer NOT NULL DEFAULT 0,
  queue_round    integer NOT NULL DEFAULT 0,
  last_shown_at  timestamptz,
  raw_pathname   text NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS album_photo_list_idx ON album_photo(party_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS album_photo_queue_idx ON album_photo(party_id, status, queue_round, last_shown_at)
