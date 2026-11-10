-- Shirube database. Every table is created only if it is missing.

CREATE TABLE IF NOT EXISTS jobs (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  company      TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'Other',
  role_type    TEXT,
  url          TEXT,
  location     TEXT,
  work_mode    TEXT,
  level        TEXT,
  salary_text  TEXT,
  posted_date  TEXT,                 -- YYYY-MM-DD
  closing_date TEXT,                 -- YYYY-MM-DD
  found_date   TEXT NOT NULL,        -- YYYY-MM-DD
  description  TEXT,
  notes        TEXT,
  job_status   TEXT NOT NULL DEFAULT 'open'
               CHECK (job_status IN ('open', 'closed', 'skipped')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cv_versions (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  created_date TEXT NOT NULL         -- YYYY-MM-DD
);

-- One application per job. A job with no row here is "to apply".
CREATE TABLE IF NOT EXISTS applications (
  id                INTEGER PRIMARY KEY,
  job_id            INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  applied_date      TEXT NOT NULL,   -- YYYY-MM-DD
  cv_version_id     INTEGER REFERENCES cv_versions(id) ON DELETE SET NULL,
  status            TEXT NOT NULL
                    CHECK (status IN ('applied', 'screening', 'interview',
                                      'offer', 'rejected', 'no_reply')),
  rejection_reason  TEXT
);

-- Every reply you log. Picking an outcome adds a row here.
CREATE TABLE IF NOT EXISTS replies (
  id              INTEGER PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL
                  CHECK (kind IN ('replied', 'first_interview', 'second_interview',
                                  'test_task', 'rejected', 'offer')),
  happened_on     TEXT NOT NULL,     -- YYYY-MM-DD
  note            TEXT
);

-- Profile: work and study history.
CREATE TABLE IF NOT EXISTS experiences (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('experience', 'volunteering')),
  title         TEXT NOT NULL,
  organisation  TEXT,
  start_date    TEXT,                -- YYYY-MM-DD or YYYY-MM
  end_date      TEXT,
  is_current    INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  description   TEXT
);

CREATE TABLE IF NOT EXISTS education (
  id           INTEGER PRIMARY KEY,
  course       TEXT NOT NULL,
  institution  TEXT,
  start_date   TEXT,
  end_date     TEXT
);

-- Profile: skills. Level 1 = Aware ... 5 = Expert.
CREATE TABLE IF NOT EXISTS skills (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  level              INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  proof_url          TEXT,
  used_at_experience INTEGER REFERENCES experiences(id) ON DELETE SET NULL
);

-- Settings: one row per key. Lists are stored as JSON text.
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Defaults. INSERT OR IGNORE keeps any value you have already changed.
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('reply_days', '7'),
  ('follow_up_days', '14'),
  ('screening_follow_up_days', '7'),
  ('no_reply_days', '21'),
  ('role_types', '["IT","Engineering","Finance","Marketing","Teaching","Healthcare","Sales","Other"]'),
  ('sources', '["TopJobs","ExpressJobs","Rooster","ITPro","LinkedIn","Other"]'),
  ('rejection_reasons', '["No reply to CV","Skills gap","Salary","Role filled","Other"]');