-- The CV you actually applied with, one file per job. The file itself sits in data/cvs/ (not in the database).
ALTER TABLE jobs ADD COLUMN cv_name     TEXT NOT NULL DEFAULT '';   -- the name you see, for example "Deelaka - SRE.pdf". Empty = no CV saved
ALTER TABLE jobs ADD COLUMN cv_file     TEXT NOT NULL DEFAULT '';   -- the stored file name in data/cvs/ (random, so two jobs never share one)
ALTER TABLE jobs ADD COLUMN cv_source   TEXT NOT NULL DEFAULT '';   -- 'uploaded' (your own file) or 'made' (the Word CV Shirube built)
ALTER TABLE jobs ADD COLUMN cv_added_on TEXT NOT NULL DEFAULT '';   -- YYYY-MM-DD
