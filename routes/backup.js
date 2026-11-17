// Backup = a JSON file with every table. Restore replaces everything with it.
// (The raw .db file is a bad thing to overwrite while the server is running.)
import { HttpError } from '../lib/errors.js';
import { tx, ensurePreset } from './profile.js';

const TABLES = ['profile', 'presets', 'education', 'experience', 'jobs', 'preset_experience', 'stages', 'found_jobs', 'saved_searches', 'certifications', 'languages'];
const FORMAT = { app: 'shirube', version: 1 };

export function exportBackup({ db }) {
  const tables = {};
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return { ...FORMAT, exported_at: new Date().toISOString(), tables };
}

// Backups made before step 45 have one "GitHub or LinkedIn" value (profile.social). Put it in the field it belongs to.
function splitSocial(value) {
  const v = String(value ?? '').trim();
  if (!v) return {};
  const low = v.toLowerCase();
  if (low.includes('linkedin.')) return { linkedin: v };
  if (low.includes('github.')) return { github: v };
  return { other_link: v };
}

const columnsOf = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

export function restoreBackup({ db, body }) {
  if (!body || body.app !== FORMAT.app || !body.tables || typeof body.tables !== 'object') {
    throw new HttpError(400, 'This file is not a Shirube backup');
  }
  if (body.version !== FORMAT.version) throw new HttpError(400, 'This backup comes from a different version of Shirube');
  for (const t of TABLES) {
    if (body.tables[t] !== undefined && !Array.isArray(body.tables[t])) throw new HttpError(400, `Backup has a bad "${t}" list`);
  }
  const rows = (t) => body.tables[t] ?? [];

  try {
    tx(db, () => {
      // Children first, so foreign keys never complain.
      for (const t of ['found_jobs', 'stages', 'preset_experience', 'jobs', 'presets', 'education', 'experience']) db.exec(`DELETE FROM ${t}`);
      // Older backups have no saved searches: then the ones you have now stay.
      if (body.tables.saved_searches !== undefined) db.exec('DELETE FROM saved_searches');
      // Same for certifications (older backups have none).
      if (body.tables.certifications !== undefined) db.exec('DELETE FROM certifications');
      // And languages.
      if (body.tables.languages !== undefined) db.exec('DELETE FROM languages');

      for (const t of ['presets', 'education', 'experience', 'jobs', 'preset_experience', 'stages', 'found_jobs', 'saved_searches', 'certifications', 'languages']) {
        const known = columnsOf(db, t);
        for (const row of rows(t)) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`a row in "${t}" is not an object`);
          const cols = Object.keys(row).filter((c) => known.includes(c));
          if (!cols.length) continue;
          db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c]));
        }
      }

      let p = rows('profile')[0];
      if (p && typeof p === 'object') {
        if ('social' in p && !('linkedin' in p) && !('github' in p) && !('other_link' in p)) p = { ...splitSocial(p.social), ...p };
        const cols = Object.keys(p).filter((c) => c !== 'id' && columnsOf(db, 'profile').includes(c));
        if (cols.length) db.prepare(`UPDATE profile SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = 1`).run(...cols.map((c) => p[c]));
      }
      ensurePreset(db);
    });
  } catch (err) {
    throw new HttpError(400, `Could not restore this backup, nothing was changed (${err.message})`);
  }
  return { ok: true, jobs: db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n };
}
