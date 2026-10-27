CREATE TABLE letters (
  id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT,
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 10 AND 700),
  published_content TEXT CHECK (published_content IS NULL OR length(published_content) <= 700),
  consent_to_publish INTEGER NOT NULL CHECK (consent_to_publish = 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  publish_order INTEGER CHECK (publish_order IS NULL OR publish_order >= 0),
  submission_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX letters_status_created ON letters(status, created_at DESC);
CREATE INDEX letters_created ON letters(created_at DESC);
