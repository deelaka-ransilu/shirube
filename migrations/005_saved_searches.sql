-- Saved searches: a name plus the Found filters, so a search can be run again in one tap.
CREATE TABLE saved_searches (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  q          TEXT NOT NULL DEFAULT '',                       -- the search words
  work_mode  TEXT NOT NULL DEFAULT 'any' CHECK (work_mode IN ('any', 'onsite', 'hybrid', 'remote')),
  posted     TEXT NOT NULL DEFAULT '3d' CHECK (posted IN ('today', '3d', 'week', 'any')),
  notify     TEXT NOT NULL DEFAULT 'open' CHECK (notify IN ('open', 'never')),   -- show "N new" when Found opens, or never
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
