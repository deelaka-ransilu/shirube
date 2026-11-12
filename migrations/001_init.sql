-- Shirube v1 schema. Dates are stored as text: YYYY-MM-DD.

-- One row only (id is always 1).
CREATE TABLE profile (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  name           TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  location       TEXT NOT NULL DEFAULT '',
  follow_up_days INTEGER NOT NULL DEFAULT 7 CHECK (follow_up_days >= 1),
  time_zone      TEXT NOT NULL DEFAULT 'Asia/Colombo'
);
INSERT INTO profile (id) VALUES (1);

-- Role presets: target role, summary and skills change per preset.
CREATE TABLE presets (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  target_role TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  skills      TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  position    INTEGER NOT NULL DEFAULT 0
);

-- Shared across all presets.
CREATE TABLE education (
  id            INTEGER PRIMARY KEY,
  school        TEXT NOT NULL,
  qualification TEXT NOT NULL DEFAULT '',
  start_date    TEXT NOT NULL DEFAULT '',
  end_date      TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE experience (
  id         INTEGER PRIMARY KEY,
  company    TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  end_date   TEXT NOT NULL DEFAULT '',
  details    TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0
);

-- Which experience entries are shown for each preset (Shown / Hidden).
-- No row means hidden.
CREATE TABLE preset_experience (
  preset_id     INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
  experience_id INTEGER NOT NULL REFERENCES experience(id) ON DELETE CASCADE,
  PRIMARY KEY (preset_id, experience_id)
);

CREATE TABLE jobs (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  company     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','applied','reply','interview','offer','rejected')),
  source      TEXT NOT NULL DEFAULT 'manual',  -- later: the job site it came from
  url         TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',        -- the advert text
  notes       TEXT NOT NULL DEFAULT '',        -- general notes
  applied_on  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX jobs_status ON jobs(status);

-- The "Stages and notes" cards on a job.
CREATE TABLE stages (
  id          INTEGER PRIMARY KEY,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL
              CHECK (kind IN ('applied','follow_up','reply','interview','offer','rejected','other')),
  happened_on TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX stages_job ON stages(job_id);
