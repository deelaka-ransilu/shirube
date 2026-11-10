// Opens the database file and makes sure every table exists.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, 'data');
const migrationsDir = join(root, 'migrations');

// The data folder is created on first run. It is gitignored.
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'shirube.db'));
db.exec('PRAGMA foreign_keys = ON;');

// schema.sql uses IF NOT EXISTS, so running it on every start is safe.
// Later changes to the tables need a new numbered file, not an edit here.
db.exec(readFileSync(join(root, 'schema.sql'), 'utf8'));

// Runs numbered migration files that have not yet been applied.
function runMigrations(database, dir) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT
    );
  `);

  const appliedRows = database.prepare('SELECT name FROM schema_migrations;').all();
  const applied = new Set(appliedRows.map((r) => r.name));

  let files = [];
  try {
    files = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(dir, file), 'utf8');
    database.exec('BEGIN;');
    try {
      if (sql.trim()) {
        database.exec(sql);
      }
      database.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, datetime(\'now\'));').run(file);
      database.exec('COMMIT;');
    } catch (err) {
      database.exec('ROLLBACK;');
      throw err;
    }
  }
}

runMigrations(db, migrationsDir);
