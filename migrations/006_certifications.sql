-- Certifications: shown the same on every preset (like education).
CREATE TABLE certifications (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  issuer    TEXT NOT NULL DEFAULT '',
  issued_on TEXT NOT NULL DEFAULT '',
  url       TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL DEFAULT 0
);
