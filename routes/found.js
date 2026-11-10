// Found tab: new ITPro postings you can save into Jobs or dismiss.
import { db } from '../db.js';
import { fetchPostings } from '../feeds/itpro.js';

const SOURCE = 'ITPro';
const CACHE_MS = 5 * 60 * 1000;
let cache = null; // { at, postings }

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100000) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new Error('Request body is not valid JSON.');
  }
}

function todayColombo() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Colombo' });
}

// Postings from the cache, or from ITPro. Falls back to an old copy if ITPro is down.
async function getPostings(force) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return { postings: cache.postings, at: cache.at, stale: false };
  }
  try {
    const postings = await fetchPostings();
    cache = { at: Date.now(), postings };
    return { postings, at: cache.at, stale: false };
  } catch (err) {
    if (cache) return { postings: cache.postings, at: cache.at, stale: true };
    throw err;
  }
}

// IDs of ITPro postings already saved as jobs (archived jobs count too).
function savedIds() {
  const rows = db.prepare("SELECT url FROM jobs WHERE url LIKE 'https://itpro.lk/job/%';").all();
  const ids = new Set();
  for (const row of rows) {
    const m = /^https:\/\/itpro\.lk\/job\/(\d+)/.exec(row.url);
    if (m) ids.add(m[1]);
  }
  return ids;
}

function dismissedIds() {
  const rows = db.prepare('SELECT external_id FROM dismissed_postings WHERE source = ?;').all(SOURCE);
  return new Set(rows.map((r) => r.external_id));
}

// Adds a category to the role_types setting, just before "Other", if it is missing.
function addRoleType(name) {
  if (!name) return;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'role_types';").get();
  if (!row) return;
  let list;
  try {
    list = JSON.parse(row.value);
  } catch {
    return;
  }
  if (!Array.isArray(list) || list.includes(name)) return;
  const otherAt = list.indexOf('Other');
  if (otherAt === -1) list.push(name);
  else list.splice(otherAt, 0, name);
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);').run('role_types', JSON.stringify(list));
}

const FEED_DOWN = 'Could not reach ITPro. Check your internet connection and try again.';

async function readExternalId(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
    return null;
  }
  const id = String(body.external_id ?? '');
  if (!/^\d+$/.test(id)) {
    sendJson(res, 400, { error: 'external_id must be a number.' });
    return null;
  }
  return id;
}

async function handleList(res, url) {
  let result;
  try {
    result = await getPostings(url.searchParams.get('refresh') === '1');
  } catch {
    return sendJson(res, 502, { error: FEED_DOWN });
  }
  const hidden = new Set([...savedIds(), ...dismissedIds()]);
  const postings = result.postings
    .filter((p) => !hidden.has(p.external_id))
    .map(({ description, ...rest }) => rest);
  return sendJson(res, 200, { postings, fetched_at: new Date(result.at).toISOString(), stale: result.stale });
}

async function handleSave(req, res) {
  const id = await readExternalId(req, res);
  if (id === null) return;
  if (savedIds().has(id)) {
    return sendJson(res, 409, { error: 'This posting is already in your jobs.' });
  }

  let result;
  try {
    result = await getPostings(false);
  } catch {
    return sendJson(res, 502, { error: FEED_DOWN });
  }
  const p = result.postings.find((x) => x.external_id === id);
  if (!p) {
    return sendJson(res, 404, { error: 'That posting is no longer in the ITPro feed.' });
  }

  db.exec('BEGIN;');
  try {
    const info = db.prepare(`
      INSERT INTO jobs (
        title, company, source, role_type, job_type, url, location,
        work_mode, posted_date, found_date, description, job_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open');
    `).run(
      p.title, p.company, SOURCE, p.role_type, p.job_type, p.url, p.location,
      p.work_mode, p.posted_date, todayColombo(), p.description
    );
    addRoleType(p.role_type);
    db.exec('COMMIT;');
    return sendJson(res, 201, { id: Number(info.lastInsertRowid) });
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error(err);
    return sendJson(res, 500, { error: 'Could not save the job.' });
  }
}

async function handleDismiss(req, res) {
  const id = await readExternalId(req, res);
  if (id === null) return;
  db.prepare('INSERT OR IGNORE INTO dismissed_postings (source, external_id) VALUES (?, ?);').run(SOURCE, id);
  return sendJson(res, 200, { ok: true });
}

export async function handleFoundRequest(req, res, url) {
  const method = req.method.toUpperCase();
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/found') {
    if (method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' }) ?? true;
    await handleList(res, url);
    return true;
  }
  if (path === '/api/found/save') {
    if (method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' }) ?? true;
    await handleSave(req, res);
    return true;
  }
  if (path === '/api/found/dismiss') {
    if (method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' }) ?? true;
    await handleDismiss(req, res);
    return true;
  }
  return false;
}
