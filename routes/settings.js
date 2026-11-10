// Settings API: due-date days and the lists used by the job forms.
import { db } from '../db.js';

const DAY_KEYS = {
  reply_days: 7,
  follow_up_days: 14,
  screening_follow_up_days: 7,
  no_reply_days: 21,
};

const LIST_KEYS = {
  role_types: { keepOtherLast: true },
  sources: { keepOtherLast: true },
  rejection_reasons: { keepOtherLast: true },
};

const MAX_ITEMS = 50;
const MAX_NAME = 60;

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
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

function readRow(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?;').get(key);
}

function readNumber(key, fallback) {
  const row = readRow(key);
  if (!row) return fallback;
  const n = parseInt(row.value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function readList(key) {
  const row = readRow(key);
  if (!row) return [];
  try {
    const list = JSON.parse(row.value);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function readAll() {
  const out = {};
  for (const [key, fallback] of Object.entries(DAY_KEYS)) out[key] = readNumber(key, fallback);
  for (const key of Object.keys(LIST_KEYS)) out[key] = readList(key);
  return out;
}

class FieldError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

function cleanDays(key, value) {
  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw new FieldError(key, 'Enter a whole number from 1 to 365.');
  }
  return String(value);
}

function cleanList(key, value) {
  if (!Array.isArray(value)) throw new FieldError(key, 'This must be a list.');
  const seen = new Set();
  let items = [];
  for (const raw of value) {
    if (typeof raw !== 'string') throw new FieldError(key, 'Every item must be text.');
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    if (name.length > MAX_NAME) throw new FieldError(key, `Keep each name under ${MAX_NAME + 1} characters.`);
    const lower = name.toLowerCase();
    if (seen.has(lower)) throw new FieldError(key, `"${name}" is in the list twice.`);
    seen.add(lower);
    items.push(name);
  }
  if (LIST_KEYS[key].keepOtherLast) {
    items = items.filter((n) => n.toLowerCase() !== 'other');
    items.push('Other');
  }
  if (items.length === 0) throw new FieldError(key, 'Keep at least one item.');
  if (items.length > MAX_ITEMS) throw new FieldError(key, `Keep the list to ${MAX_ITEMS} items or fewer.`);
  return JSON.stringify(items);
}

async function handlePut(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return sendJson(res, 400, { error: 'Request body must be an object.' });
  }

  const updates = [];
  try {
    for (const [key, value] of Object.entries(body)) {
      if (Object.hasOwn(DAY_KEYS, key)) updates.push([key, cleanDays(key, value)]);
      else if (Object.hasOwn(LIST_KEYS, key)) updates.push([key, cleanList(key, value)]);
      else throw new FieldError(key, 'Unknown setting.');
    }
  } catch (err) {
    if (err instanceof FieldError) return sendJson(res, 400, { error: err.message, field: err.field });
    throw err;
  }

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);');
  db.exec('BEGIN');
  try {
    for (const [key, value] of updates) stmt.run(key, value);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return sendJson(res, 500, { error: 'Could not save settings.' });
  }
  return sendJson(res, 200, readAll());
}

// Returns true when the request was handled.
export async function handleSettingsRequest(req, res, url) {
  if (url.pathname !== '/api/settings') return false;
  if (req.method === 'GET') {
    sendJson(res, 200, readAll());
    return true;
  }
  if (req.method === 'PUT') {
    await handlePut(req, res);
    return true;
  }
  sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, PUT' });
  return true;
}
