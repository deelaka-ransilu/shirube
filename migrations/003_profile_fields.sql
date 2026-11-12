-- Fields the My profile screen needs.
ALTER TABLE profile ADD COLUMN portfolio TEXT NOT NULL DEFAULT '';
ALTER TABLE profile ADD COLUMN social    TEXT NOT NULL DEFAULT '';   -- GitHub or LinkedIn link
-- The preset with the check mark.
ALTER TABLE profile ADD COLUMN active_preset_id INTEGER REFERENCES presets(id) ON DELETE SET NULL;

-- There is always at least one preset.
INSERT INTO presets (name, position) SELECT 'General', 1 WHERE NOT EXISTS (SELECT 1 FROM presets);
UPDATE profile SET active_preset_id = (SELECT id FROM presets ORDER BY position, id LIMIT 1);
