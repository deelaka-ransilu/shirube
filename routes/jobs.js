import { HttpError } from '../lib/errors.js';
import { STATUSES, cleanJob } from '../lib/validate-job.js';
import { loadJobPage } from './stages.js';

// Everything the list needs, but not the long advert text.
const LIST_COLUMNS = 'id, title, company, status, source, work_mode, job_type, found_on, closes_on, created_at';

export function listJobs({ db, query }) {
  const status = query.status ?? '';
  if (status && !STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');
  const q = String(query.q ?? '').trim().toLowerCase();

  const where = [];
  const args = [];
  if (status) { where.push('status = ?'); args.push(status); }
  if (q) { where.push('(instr(lower(title), ?) > 0 OR instr(lower(company), ?) > 0)'); args.push(q, q); }
  const jobs = db.prepare(
    `SELECT ${LIST_COLUMNS} FROM jobs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`,
  ).all(...args);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status').all()) counts[row.status] = row.n;
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);

  // The open job (not applied yet) that closes soonest, today or later.
  const next_closing = db.prepare(
    `SELECT id, title, company, closes_on FROM jobs
     WHERE status = 'open' AND closes_on != '' AND closes_on >= date('now', 'localtime')
     ORDER BY closes_on, id LIMIT 1`,
  ).get() ?? null;

  return { jobs, counts, next_closing };
}

export function createJob({ db, body }) {
  const data = cleanJob(body);
  const cols = Object.keys(data);
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO jobs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((c) => data[c]));
  return { job: db.prepare('SELECT * FROM jobs WHERE id = ?').get(lastInsertRowid) };
}

export function findDuplicate({ db, query }) {
  const title = String(query.title ?? '').trim().toLowerCase();
  const company = String(query.company ?? '').trim().toLowerCase();
  if (!title) return { job: null };
  const job = db.prepare(
    'SELECT id, title, company, created_at FROM jobs WHERE lower(trim(title)) = ? AND lower(trim(company)) = ? ORDER BY id DESC LIMIT 1',
  ).get(title, company);
  return { job: job ?? null };
}

export function deleteJob({ db, params }) {
  const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(Number(params.id));
  if (!result.changes) throw new HttpError(404, 'Job not found');
  return { ok: true };
}

export function getJob({ db, params }) {
  return loadJobPage(db, Number(params.id));
}

export function updateJob({ db, params, body }) {
  const id = Number(params.id);
  loadJobPage(db, id); // 404 when the job is missing
  const data = cleanJob(body, { partial: true });
  const cols = Object.keys(data);
  if (!cols.length) throw new HttpError(400, 'Nothing to change');
  db.prepare(`UPDATE jobs SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...cols.map((c) => data[c]), id);
  return loadJobPage(db, id);
}
