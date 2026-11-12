-- Fields the Add job screen needs.
ALTER TABLE jobs ADD COLUMN work_mode TEXT NOT NULL DEFAULT '' CHECK (work_mode IN ('', 'onsite', 'hybrid', 'remote'));
ALTER TABLE jobs ADD COLUMN job_type  TEXT NOT NULL DEFAULT '';   -- Full-time, Part-time ...
ALTER TABLE jobs ADD COLUMN found_on  TEXT NOT NULL DEFAULT '';   -- YYYY-MM-DD
ALTER TABLE jobs ADD COLUMN closes_on TEXT NOT NULL DEFAULT '';   -- YYYY-MM-DD, empty = no closing date
