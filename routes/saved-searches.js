// Saved searches: named Found filters. The "N new" count uses the same search code as the Found list.
import { HttpError } from '../lib/errors.js';
import { todayLocal } from '../lib/dates.js';
import { searchFound, MODE_KEYS, POSTED_KEYS } from './found.js';

const MAX_SEARCHES = 20;
const COLUMNS = 'id, name, q, work_mode, posted, notify, position';

function clean(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send the search as an object');
  const out = {};
  const text = (key, max, label) => {
    if (body[key] === undefined) return;
    if (typeof body[key] !== 'string') throw new HttpError(400, `${label} must be text`);
    const v = body[key].trim().replace(/\s+/g, ' ');
    if (v.length > max) throw new HttpError(400, `${label} is too long (most ${max} letters)`);
    out[key] = v;
  };
  text('name', 60, 'Name');
  text('q', 200, 'Search words');
  for (const [key, allowed, label] of [['work_mode', MODE_KEYS, 'Work mode'], ['posted', POSTED_KEYS, 'Posted'], ['notify', ['open', 'never'], 'Tell me about new jobs']]) {
    if (body[key] === undefined) continue;
    if (!allowed.includes(body[key])) throw new HttpError(400, `Unknown value for ${label}`);
    out[key] = body[key];
  }
  if (!partial && !out.name) throw new HttpError(400, 'Give the search a name');
  if (out.name === '') throw new HttpError(400, 'Give the search a name');
  return out;
}

function load(db, idText) {
  const id = Number(idText);
  const row = Number.isInteger(id) ? db.prepare(`SELECT ${COLUMNS} FROM saved_searches WHERE id = ?`).get(id) : undefined;
  if (!row) throw new HttpError(404, 'Saved search not found');
  return row;
}

export function listSaved({ db, deps = {} }) {
  const today = todayLocal(deps.now ? deps.now() : new Date());
  const searches = db.prepare(`SELECT ${COLUMNS} FROM saved_searches ORDER BY position, id`).all().map((s) => ({
    ...s,
    // null = not counted ("Never")
    new_count: s.notify === 'open' ? searchFound(db, { q: s.q, work_mode: s.work_mode, posted: s.posted }, today).filter((j) => j.is_new).length : null,
  }));
  return { searches };
}

export function createSaved({ db, body, deps = {} }) {
  const data = clean(body);
  if (db.prepare('SELECT COUNT(*) AS n FROM saved_searches').get().n >= MAX_SEARCHES) {
    throw new HttpError(400, `You can keep up to ${MAX_SEARCHES} saved searches`);
  }
  if (!(data.q || (data.work_mode && data.work_mode !== 'any'))) throw new HttpError(400, 'Add search words or pick a work mode');
  const next = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM saved_searches').get().n;
  const r = db.prepare('INSERT INTO saved_searches (name, q, work_mode, posted, notify, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(data.name, data.q ?? '', data.work_mode ?? 'any', data.posted ?? '3d', data.notify ?? 'open', next, (deps.now ? deps.now() : new Date()).toISOString());
  return { search: load(db, r.lastInsertRowid) };
}

export function updateSaved({ db, params, body }) {
  const row = load(db, params.id);
  const data = clean(body, { partial: true });
  const merged = { ...row, ...data };
  if (!(merged.q || merged.work_mode !== 'any')) throw new HttpError(400, 'Add search words or pick a work mode');
  db.prepare('UPDATE saved_searches SET name = ?, q = ?, work_mode = ?, posted = ?, notify = ? WHERE id = ?')
    .run(merged.name, merged.q, merged.work_mode, merged.posted, merged.notify, row.id);
  return { search: load(db, row.id) };
}

export function deleteSaved({ db, params }) {
  const row = load(db, params.id);
  db.prepare('DELETE FROM saved_searches WHERE id = ?').run(row.id);
  return { ok: true };
}
