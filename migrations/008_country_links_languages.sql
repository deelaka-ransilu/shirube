-- Country, separate link fields (LinkedIn, GitHub, Other link) and a Languages list.
ALTER TABLE profile ADD COLUMN country    TEXT NOT NULL DEFAULT '';
ALTER TABLE profile ADD COLUMN linkedin   TEXT NOT NULL DEFAULT '';
ALTER TABLE profile ADD COLUMN github     TEXT NOT NULL DEFAULT '';
ALTER TABLE profile ADD COLUMN other_link TEXT NOT NULL DEFAULT '';

-- The old "GitHub or LinkedIn" value moves to the field it belongs to.
UPDATE profile SET linkedin = social WHERE lower(social) LIKE '%linkedin.%';
UPDATE profile SET github = social WHERE lower(social) LIKE '%github.%' AND lower(social) NOT LIKE '%linkedin.%';
UPDATE profile SET other_link = social WHERE social <> '' AND linkedin = '' AND github = '';
ALTER TABLE profile DROP COLUMN social;

-- Languages: shown the same on every preset (like education and certifications).
CREATE TABLE languages (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  level    TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
