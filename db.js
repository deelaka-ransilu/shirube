// Opens the database file and makes sure every table exists.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, 'data');

// The data folder is created on first run. It is gitignored.
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'shirube.db'));
db.exec('PRAGMA foreign_keys = ON;');

// schema.sql uses IF NOT EXISTS, so running it on every start is safe.
// Later changes to the tables need a new numbered file, not an edit here.
db.exec(readFileSync(join(root, 'schema.sql'), 'utf8'));