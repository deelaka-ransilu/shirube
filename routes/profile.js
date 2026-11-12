// My profile: basics, settings, presets, education, experience.
import { HttpError } from '../lib/errors.js';
import { cleanBasics, cleanPreset, cleanEducation, cleanExperience } from '../lib/validate-profile.js';

// Runs fn inside one transaction: all of it happens, or none of it.
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// There is always at least one preset, and the profile points at one of them.
export function ensurePreset(db) {
  if (!db.prepare('SELECT 1 FROM presets LIMIT 1').get()) {
    db.prepare("INSERT INTO presets (name, position) VALUES ('General', 1)").run();
  }
  const active = db.prepare('SELECT 1 FROM presets WHERE id = (SELECT active_preset_id FROM profile WHERE id = 1)').get();
  if (!active) {
    db.prepare('UPDATE profile SET active_preset_id = (SELECT id FROM presets ORDER BY position, id LIMIT 1) WHERE id = 1').run();
  }
}

function loadProfile(db) {
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  const links = db.prepare('SELECT preset_id, experience_id FROM preset_experience').all();
  const presets = db.prepare('SELECT * FROM presets ORDER BY position, id').all().map((p) => ({
    ...p,
    skills: JSON.parse(p.skills || '[]'),
    experience_ids: links.filter((l) => l.preset_id === p.id).map((l) => l.experience_id),
  }));
  return {
    profile,
    presets,
    education: db.prepare('SELECT * FROM education ORDER BY position, id').all(),
    experience: db.prepare('SELECT * FROM experience ORDER BY position, id').all(),
  };
}

export function getProfile({ db }) {
  return loadProfile(db);
}

function setClause(cols) {
  return cols.map((c) => `${c} = ?`).join(', ');
}

function writePreset(db, id, data) {
  const { experience_ids, skills, ...rest } = data;
  const cols = Object.keys(rest);
  if (skills !== undefined) { cols.push('skills'); rest.skills = JSON.stringify(skills); }
  if (cols.length) db.prepare(`UPDATE presets SET ${setClause(cols)} WHERE id = ?`).run(...cols.map((c) => rest[c]), id);
  if (experience_ids !== undefined) {
    db.prepare('DELETE FROM preset_experience WHERE preset_id = ?').run(id);
    const add = db.prepare('INSERT INTO preset_experience (preset_id, experience_id) SELECT ?, id FROM experience WHERE id = ?');
    for (const eid of experience_ids) add.run(id, eid); // unknown ids add nothing
  }
}

// The Save profile button: basics, settings and every preset, all or nothing.
export function saveProfile({ db, body }) {
  const basics = cleanBasics(body);
  const presets = [];
  if (body.presets !== undefined) {
    if (!Array.isArray(body.presets)) throw new HttpError(400, 'Presets must be a list');
    for (const p of body.presets) {
      if (!p || !Number.isInteger(p.id)) throw new HttpError(400, 'Each preset needs an id');
      presets.push({ id: p.id, data: cleanPreset(p, { partial: true }) });
    }
  }
  const active = body.active_preset_id;
  if (active !== undefined && !Number.isInteger(active)) throw new HttpError(400, 'Unknown preset');

  tx(db, () => {
    const cols = Object.keys(basics);
    if (cols.length) db.prepare(`UPDATE profile SET ${setClause(cols)} WHERE id = 1`).run(...cols.map((c) => basics[c]));
    for (const p of presets) {
      if (!db.prepare('SELECT 1 FROM presets WHERE id = ?').get(p.id)) throw new HttpError(404, 'Preset not found');
      writePreset(db, p.id, p.data);
    }
    if (active !== undefined) {
      if (!db.prepare('SELECT 1 FROM presets WHERE id = ?').get(active)) throw new HttpError(404, 'Preset not found');
      db.prepare('UPDATE profile SET active_preset_id = ? WHERE id = 1').run(active);
    }
  });
  return loadProfile(db);
}

const nextPosition = (db, table) => db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS n FROM ${table}`).get().n;
const asId = (v) => Number(v);

export function createPreset({ db, body }) {
  const data = cleanPreset(body);
  const id = tx(db, () => {
    const { lastInsertRowid } = db.prepare('INSERT INTO presets (name, target_role, summary, position) VALUES (?, ?, ?, ?)')
      .run(data.name, data.target_role ?? '', data.summary ?? '', nextPosition(db, 'presets'));
    writePreset(db, Number(lastInsertRowid), { skills: data.skills ?? [], experience_ids: data.experience_ids ?? [] });
    return Number(lastInsertRowid);
  });
  return { id, ...loadProfile(db) };
}

export function deletePreset({ db, params }) {
  const id = asId(params.id);
  tx(db, () => {
    if (!db.prepare('SELECT 1 FROM presets WHERE id = ?').get(id)) throw new HttpError(404, 'Preset not found');
    if (db.prepare('SELECT COUNT(*) AS n FROM presets').get().n < 2) throw new HttpError(400, 'You need at least one preset');
    db.prepare('DELETE FROM presets WHERE id = ?').run(id);
    ensurePreset(db);
  });
  return loadProfile(db);
}

function entryRoutes(table, clean, requiredNoun) {
  const get = (db, id) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) throw new HttpError(404, `${requiredNoun} not found`);
    return row;
  };
  return {
    create({ db, body }) {
      const data = clean(body);
      const showIn = Number.isInteger(body.show_in) ? body.show_in : null;
      const cols = Object.keys(data);
      const id = tx(db, () => {
        const { lastInsertRowid } = db
          .prepare(`INSERT INTO ${table} (${cols.join(', ')}, position) VALUES (${cols.map(() => '?').join(', ')}, ?)`)
          .run(...cols.map((c) => data[c]), nextPosition(db, table));
        // New experience can start as Shown in the preset being edited.
        if (table === 'experience' && showIn !== null && db.prepare('SELECT 1 FROM presets WHERE id = ?').get(showIn)) {
          db.prepare('INSERT INTO preset_experience (preset_id, experience_id) VALUES (?, ?)').run(showIn, Number(lastInsertRowid));
        }
        return Number(lastInsertRowid);
      });
      return { id, ...loadProfile(db) };
    },
    update({ db, params, body }) {
      const id = asId(params.id);
      get(db, id);
      const data = clean(body, { partial: true });
      const cols = Object.keys(data);
      if (!cols.length) throw new HttpError(400, 'Nothing to change');
      db.prepare(`UPDATE ${table} SET ${setClause(cols)} WHERE id = ?`).run(...cols.map((c) => data[c]), id);
      return loadProfile(db);
    },
    remove({ db, params }) {
      const id = asId(params.id);
      get(db, id);
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      return loadProfile(db);
    },
  };
}

const edu = entryRoutes('education', cleanEducation, 'Education');
const exp = entryRoutes('experience', cleanExperience, 'Experience');
export const createEducation = edu.create, updateEducation = edu.update, deleteEducation = edu.remove;
export const createExperience = exp.create, updateExperience = exp.update, deleteExperience = exp.remove;
