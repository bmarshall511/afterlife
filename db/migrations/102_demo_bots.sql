-- Demo-only stand-in families that answer automatically so every game can be tried by one person.
ALTER TABLE team ADD COLUMN IF NOT EXISTS bot boolean NOT NULL DEFAULT false;
