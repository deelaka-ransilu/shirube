-- Migration 004: job type on jobs, and feed postings the user dismissed.
ALTER TABLE jobs ADD COLUMN job_type TEXT;

CREATE TABLE IF NOT EXISTS dismissed_postings (
  source        TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  dismissed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source, external_id)
);
