-- The day the company put the advert up (not the day you found it).
ALTER TABLE jobs ADD COLUMN posted_on TEXT NOT NULL DEFAULT '';   -- YYYY-MM-DD, empty = not stated
