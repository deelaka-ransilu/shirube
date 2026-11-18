import { HttpError } from '../lib/errors.js';
import { STATUSES, cleanJob } from '../lib/validate-job.js';
import { loadJobPage, syncJob } from './stages.js';
import { removeStored } from '../lib/cv-store.js';

// Everything the list needs, but not the long advert text.
const LIST_COLUMNS = 'id, title, company, status, source, location, work_mode, job_type, found_on, posted_on, closes_on, applied_on, created_at';

export function listJobs({ db, query }) {
  const status = query.status ?? '';
  if (status && !STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');
  const q = String(query.q ?? '').trim().toLowerCase();

  const where = [];
  const args = [];
  if (status) { where.push('status = ?'); args.push(status); }
  if (q) { where.push('(instr(lower(title), ?) > 0 OR instr(lower(company), ?) > 0)'); args.push(q, q); }
  // Jobs you can still apply to come first: closing soonest, then no closing date (newest found first), then closed.
  // After them, the jobs you applied to: newest application first, rejected ones last.
  const order = `CASE WHEN status = 'open' THEN 0 WHEN status = 'rejected' THEN 2 ELSE 1 END,
    CASE WHEN status != 'open' THEN 0 WHEN closes_on = '' THEN 1 WHEN closes_on < date('now', 'localtime') THEN 2 ELSE 0 END,
    CASE WHEN status = 'open' THEN closes_on ELSE '' END,
    CASE WHEN status = 'open' THEN found_on ELSE applied_on END DESC,
    created_at DESC, id DESC`;
  const jobs = db.prepare(
    `SELECT ${LIST_COLUMNS} FROM jobs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`,
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
  // "Already applied": the date becomes a dated Applied stage, so the status and the date stay right
  // when stages change later.
  const appliedOn = data.applied_on ?? '';
  if (appliedOn) { delete data.applied_on; delete data.status; }
  const cols = Object.keys(data);
  // A savepoint keeps the job and its stage together, and it also works inside a bigger transaction (Save to Jobs).
  db.exec('SAVEPOINT create_job');
  let id;
  try {
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO jobs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map((c) => data[c]));
    id = lastInsertRowid;
    if (appliedOn) {
      db.prepare("INSERT INTO stages (job_id, kind, happened_on) VALUES (?, 'applied', ?)").run(id, appliedOn);
      syncJob(db, id, 'applied');
    }
    db.exec('RELEASE create_job');
  } catch (err) {
    db.exec('ROLLBACK TO create_job; RELEASE create_job');
    throw err;
  }
  return { job: db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) };
}

// The same title + company already in Jobs (case and spaces ignored). Used by Add job and by Found.
export function findDuplicateJob(db, title, company) {
  const t = String(title ?? '').trim().toLowerCase();
  const c = String(company ?? '').trim().toLowerCase();
  if (!t) return null;
  return db.prepare(
    'SELECT id, title, company, created_at FROM jobs WHERE lower(trim(title)) = ? AND lower(trim(company)) = ? ORDER BY id DESC LIMIT 1',
  ).get(t, c) ?? null;
}

export function findDuplicate({ db, query }) {
  return { job: findDuplicateJob(db, query.title, query.company) };
}

export function deleteJob({ db, params, deps }) {
  const id = Number(params.id);
  const row = db.prepare('SELECT cv_file FROM jobs WHERE id = ?').get(id);
  const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  if (!result.changes) throw new HttpError(404, 'Job not found');
  removeStored(deps, row?.cv_file);
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
