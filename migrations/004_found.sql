-- Found: jobs read from ITPro's RSS feeds, plus the settings that go with them.
CREATE TABLE found_jobs (
  id            INTEGER PRIMARY KEY,
  itpro_id      INTEGER NOT NULL UNIQUE,          -- the number after /job/ in the ITPro link
  title         TEXT NOT NULL,                    -- without " at Company"
  company       TEXT NOT NULL DEFAULT '',
  location      TEXT NOT NULL DEFAULT '',
  job_type      TEXT NOT NULL DEFAULT '',
  url           TEXT NOT NULL DEFAULT '',         -- always https://itpro.lk/...
  description   TEXT NOT NULL DEFAULT '',         -- the advert as clean text, never HTML
  published_on  TEXT NOT NULL DEFAULT '',         -- YYYY-MM-DD, from the feed's pubDate
  work_mode     TEXT NOT NULL DEFAULT '' CHECK (work_mode IN ('', 'onsite', 'hybrid', 'remote')),  -- only if the advert says so
  closes_on     TEXT NOT NULL DEFAULT '',         -- only if the advert has a date
  first_seen_at TEXT NOT NULL,                    -- ISO time (UTC)
  last_seen_at  TEXT NOT NULL,                    -- ISO time (UTC)
  hidden        INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  job_id        INTEGER REFERENCES jobs(id) ON DELETE SET NULL   -- set once saved to Jobs
);
CREATE INDEX found_jobs_published ON found_jobs(published_on DESC, itpro_id DESC);

ALTER TABLE profile ADD COLUMN found_categories    TEXT NOT NULL DEFAULT '["devops-cloud","information-technology","web-development"]';  -- JSON array
ALTER TABLE profile ADD COLUMN found_last_fetch_at TEXT NOT NULL DEFAULT '';   -- ISO time of the last complete refresh
ALTER TABLE profile ADD COLUMN found_last_left_at  TEXT NOT NULL DEFAULT '';   -- ISO time the person last left the Found page
