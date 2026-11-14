// Found: jobs read from ITPro's RSS feeds. Refresh is the only thing that touches the internet.
import { HttpError } from '../lib/errors.js';
import { parseFeed } from '../lib/feed.js';
import { fetchFeedText, feedUrls, CATEGORIES, CATEGORY_SLUGS, DEFAULT_CATEGORIES } from '../lib/fetch-feed.js';
import { todayLocal, addDays } from '../lib/dates.js';
import { parseAdvert } from '../public/js/lib/parse-advert.js';
import { tx } from './profile.js';
import { createJob, findDuplicateJob } from './jobs.js';

const FRESH_MINUTES = 30;   // ITPro's feed says ttl 30
const KEEP_DAYS = 60;
const POSTED = { today: 0, '3d': 3, week: 7 };   // days back from today; 'any' = no limit
const MODES = ['onsite', 'hybrid', 'remote'];
const LIST_COLUMNS = 'id, itpro_id, title, company, location, job_type, url, published_on, work_mode, closes_on, first_seen_at, hidden, job_id';

const nowOf = (deps) => (deps.now ? deps.now() : new Date());

function categoriesOf(db) {
  try {
    const list = JSON.parse(db.prepare('SELECT found_categories FROM profile WHERE id = 1').get().found_categories);
    return Array.isArray(list) ? list.filter((c) => CATEGORY_SLUGS.includes(c)) : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

// ---- list and detail ----

export function listFound({ db, query, deps = {} }) {
  const now = nowOf(deps);
  const today = todayLocal(now);
  const where = [];
  const args = [];

  where.push('hidden = ?'); args.push(query.hidden === '1' ? 1 : 0);

  const posted = query.posted ?? '3d';
  if (posted !== 'any') {
    if (!Object.hasOwn(POSTED, posted)) throw new HttpError(400, 'Unknown posted filter');
    where.push('published_on >= ?'); args.push(addDays(today, -POSTED[posted]));
  }
  const mode = query.work_mode ?? 'any';
  if (mode !== 'any') {
    if (!MODES.includes(mode)) throw new HttpError(400, 'Unknown work mode');
    where.push('work_mode = ?'); args.push(mode);
  }
  const words = String(query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  for (const w of words) {
    where.push('(instr(lower(title), ?) > 0 OR instr(lower(company), ?) > 0 OR instr(lower(location), ?) > 0 OR instr(lower(description), ?) > 0)');
    args.push(w, w, w, w);
  }

  const profile = db.prepare('SELECT found_last_fetch_at, found_last_left_at FROM profile WHERE id = 1').get();
  const left = profile.found_last_left_at;
  const jobs = db.prepare(
    `SELECT ${LIST_COLUMNS} FROM found_jobs WHERE ${where.join(' AND ')} ORDER BY published_on DESC, itpro_id DESC`,
  ).all(...args).map(({ first_seen_at, hidden, ...j }) => ({ ...j, hidden: !!hidden, is_new: !hidden && first_seen_at > left }));

  return {
    jobs,
    new_count: jobs.filter((j) => j.is_new).length,
    hidden_count: db.prepare('SELECT COUNT(*) AS n FROM found_jobs WHERE hidden = 1').get().n,
    stored_count: db.prepare('SELECT COUNT(*) AS n FROM found_jobs').get().n,
    last_fetch_at: profile.found_last_fetch_at,
    categories: categoriesOf(db),
    available_categories: CATEGORIES.map(([slug, label]) => ({ slug, label })),
    today,
  };
}

function loadFound(db, idText) {
  const id = Number(idText);
  const row = Number.isInteger(id) ? db.prepare('SELECT * FROM found_jobs WHERE id = ?').get(id) : undefined;
  if (!row) throw new HttpError(404, 'Job not found');
  return row;
}

export function getFound({ db, params }) {
  const { first_seen_at, last_seen_at, hidden, ...row } = loadFound(db, params.id);
  return { job: { ...row, hidden: !!hidden } };
}

export function updateFound({ db, params, body }) {
  const row = loadFound(db, params.id);
  if (!body || typeof body.hidden !== 'boolean') throw new HttpError(400, 'Send hidden as true or false');
  db.prepare('UPDATE found_jobs SET hidden = ? WHERE id = ?').run(body.hidden ? 1 : 0, row.id);
  return { ok: true, hidden: body.hidden };
}

// ---- save to Jobs ----

export function saveFound({ db, params, deps = {} }) {
  const row = loadFound(db, params.id);
  if (row.job_id && db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(row.job_id)) {
    return { already: true, job_id: row.job_id };
  }
  const dup = findDuplicateJob(db, row.title, row.company);
  if (dup) {
    db.prepare('UPDATE found_jobs SET job_id = ? WHERE id = ?').run(dup.id, row.id);
    return { already: true, job_id: dup.id };
  }
  return tx(db, () => {
    const { job } = createJob({
      db,
      body: {
        title: row.title,
        company: row.company,
        location: row.location,
        job_type: row.job_type,
        url: row.url,
        source: 'ITPro',
        description: row.description,
        work_mode: row.work_mode,
        closes_on: row.closes_on,
        found_on: todayLocal(new Date(row.first_seen_at)),
      },
    });
    db.prepare('UPDATE found_jobs SET job_id = ? WHERE id = ?').run(job.id, row.id);
    return { already: false, job_id: job.id };
  });
}

// ---- settings and the "last left" marker ----

export function saveFoundSettings({ db, body }) {
  const list = body?.categories;
  if (!Array.isArray(list) || list.some((c) => typeof c !== 'string')) throw new HttpError(400, 'Send categories as a list');
  const bad = list.find((c) => !CATEGORY_SLUGS.includes(c));
  if (bad) throw new HttpError(400, 'Unknown category');
  const clean = CATEGORY_SLUGS.filter((c) => list.includes(c));
  db.prepare('UPDATE profile SET found_categories = ? WHERE id = 1').run(JSON.stringify(clean));
  return { categories: clean };
}

export function leaveFound({ db, deps = {} }) {
  db.prepare('UPDATE profile SET found_last_left_at = ? WHERE id = 1').run(nowOf(deps).toISOString());
  return { ok: true };
}

// ---- refresh ----

const inflight = new WeakMap();

export function refreshFound(ctx) {
  const running = inflight.get(ctx.db);
  if (running) return running;
  const job = doRefresh(ctx).finally(() => inflight.delete(ctx.db));
  inflight.set(ctx.db, job);
  return job;
}

async function doRefresh({ db, deps = {} }) {
  const now = nowOf(deps);
  const profile = db.prepare('SELECT found_last_fetch_at FROM profile WHERE id = 1').get();
  if (profile.found_last_fetch_at) {
    const minutes = Math.floor((now - new Date(profile.found_last_fetch_at)) / 60000);
    if (minutes >= 0 && minutes < FRESH_MINUTES) {
      return { fetched: false, minutes_ago: minutes, last_fetch_at: profile.found_last_fetch_at };
    }
  }

  const fetchFeed = deps.fetchFeed ?? fetchFeedText;
  const urls = feedUrls(categoriesOf(db));
  const byId = new Map();
  let failed = 0;
  for (const url of urls) {       // one after the other, to be gentle with ITPro
    try {
      for (const item of parseFeed(await fetchFeed(url)).items) if (!byId.has(item.itpro_id)) byId.set(item.itpro_id, item);
    } catch {
      failed++;
    }
  }
  if (failed === urls.length) {
    return { fetched: false, error: 'Could not reach ITPro. Showing what was saved.', last_fetch_at: profile.found_last_fetch_at };
  }

  const stamp = now.toISOString();
  const today = todayLocal(now);
  let added = 0;
  tx(db, () => {
    const exists = db.prepare('SELECT 1 FROM found_jobs WHERE itpro_id = ?');
    const upsert = db.prepare(
      `INSERT INTO found_jobs (itpro_id, title, company, location, job_type, url, description, published_on, work_mode, closes_on, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(itpro_id) DO UPDATE SET title = excluded.title, company = excluded.company, location = excluded.location,
         job_type = excluded.job_type, url = excluded.url, description = excluded.description, published_on = excluded.published_on,
         work_mode = excluded.work_mode, closes_on = excluded.closes_on, last_seen_at = excluded.last_seen_at`,
    );
    for (const j of byId.values()) {
      if (!exists.get(j.itpro_id)) added++;
      // Work mode and closing date only when the advert text says so.
      const read = parseAdvert(`${j.location}\n${j.description}`);
      upsert.run(
        j.itpro_id, j.title, j.company, j.location, j.job_type || read.job_type || '', j.url, j.description,
        j.published_on || today, read.work_mode || '', read.closes_on || '', stamp, stamp,
      );
    }
    if (failed === 0) {
      // A complete refresh: forget jobs no feed has shown for 60 days (Jobs rows are separate and stay).
      db.prepare('DELETE FROM found_jobs WHERE last_seen_at < ?').run(new Date(now.getTime() - KEEP_DAYS * 86400000).toISOString());
      db.prepare('UPDATE profile SET found_last_fetch_at = ? WHERE id = 1').run(stamp);
    }
  });
  return {
    fetched: true,
    added,
    seen: byId.size,
    failed,
    feeds: urls.length,
    last_fetch_at: failed === 0 ? stamp : profile.found_last_fetch_at,
  };
}
