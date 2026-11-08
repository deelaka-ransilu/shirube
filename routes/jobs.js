// Jobs API routes: list with stage filter and sort, get one, and create.
import { db } from '../db.js';

// Checks date strings: must be YYYY-MM-DD and valid calendar date.
function isValidDateYMD(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const match = dateStr.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) return false;

  const maxDays = new Date(year, month, 0).getDate();
  return day <= maxDays;
}

// Checks URL strings: must start with http:// or https://.
function isValidUrl(urlStr) {
  if (typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Computes today's date in Asia/Colombo (YYYY-MM-DD).
function getTodayColombo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Sends a JSON response with status and headers.
function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

// Reads and parses JSON from the request stream.
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

// Loads settings lists (sources, role_types) from the settings table.
function getSettingList(key, fallback = []) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?;').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

// Common CTE query defining stage and is_stale in one place.
const JOB_CTE = `
  WITH job_entries AS (
    SELECT
      j.id,
      j.title,
      j.company,
      j.source,
      j.role_type,
      j.url,
      j.location,
      j.work_mode,
      j.level,
      j.salary_text,
      j.posted_date,
      j.closing_date,
      j.found_date,
      j.description,
      j.notes,
      j.job_status,
      j.created_at,
      a.id AS application_id,
      a.status AS application_status,
      a.applied_date,
      CASE
        WHEN j.job_status = 'skipped' THEN 'skipped'
        WHEN a.status IS NOT NULL THEN a.status
        ELSE 'to_apply'
      END AS stage,
      CASE
        WHEN a.id IS NULL
         AND j.job_status != 'skipped'
         AND COALESCE(NULLIF(j.posted_date, ''), j.found_date) < date('now', '+330 minutes', '-30 days')
        THEN 1
        ELSE 0
      END AS is_stale
    FROM jobs j
    LEFT JOIN applications a ON a.job_id = j.id
  )
`;

// Handles GET /api/jobs and POST /api/jobs.
async function handleJobsCollection(req, res, url, method) {
  if (method === 'GET') {
    const stageParam = url.searchParams.get('stage') || 'all';
    const sortParam = url.searchParams.get('sort') || 'closing_date';

    // 1. Compute stage counts from the common CTE.
    const countsRow = db.prepare(`
      ${JOB_CTE}
      SELECT
        COUNT(*) AS total_all,
        SUM(CASE WHEN stage = 'to_apply' THEN 1 ELSE 0 END) AS count_to_apply,
        SUM(CASE WHEN stage = 'applied' THEN 1 ELSE 0 END) AS count_applied,
        SUM(CASE WHEN stage = 'screening' THEN 1 ELSE 0 END) AS count_screening,
        SUM(CASE WHEN stage = 'interview' THEN 1 ELSE 0 END) AS count_interview,
        SUM(CASE WHEN stage = 'offer' THEN 1 ELSE 0 END) AS count_offer,
        SUM(CASE WHEN stage = 'rejected' THEN 1 ELSE 0 END) AS count_rejected,
        SUM(CASE WHEN stage = 'no_reply' THEN 1 ELSE 0 END) AS count_no_reply,
        SUM(CASE WHEN stage = 'skipped' THEN 1 ELSE 0 END) AS count_skipped,
        SUM(CASE WHEN is_stale = 1 THEN 1 ELSE 0 END) AS count_stale
      FROM job_entries;
    `).get();

    const counts = {
      all: countsRow.total_all || 0,
      to_apply: countsRow.count_to_apply || 0,
      applied: countsRow.count_applied || 0,
      screening: countsRow.count_screening || 0,
      interview: countsRow.count_interview || 0,
      offer: countsRow.count_offer || 0,
      rejected: countsRow.count_rejected || 0,
      no_reply: countsRow.count_no_reply || 0,
      skipped: countsRow.count_skipped || 0,
      stale: countsRow.count_stale || 0,
    };

    // 2. Build list query with sort and filter.
    const validStages = [
      'to_apply', 'applied', 'screening', 'interview',
      'offer', 'rejected', 'no_reply', 'skipped'
    ];
    const isFiltered = validStages.includes(stageParam);

    let orderByClause;
    if (sortParam === 'date_added') {
      orderByClause = 'ORDER BY id DESC';
    } else {
      // Default: closing_date soonest first, jobs with no closing date at the end.
      orderByClause = 'ORDER BY (closing_date IS NULL OR closing_date = \'\'), closing_date ASC, id DESC';
    }

    let jobs;
    if (isFiltered) {
      jobs = db.prepare(`
        ${JOB_CTE}
        SELECT * FROM job_entries
        WHERE stage = ?
        ${orderByClause};
      `).all(stageParam);
    } else {
      jobs = db.prepare(`
        ${JOB_CTE}
        SELECT * FROM job_entries
        ${orderByClause};
      `).all();
    }

    // Load sources and role_types settings.
    const sources = getSettingList('sources', ['Other']);
    const roleTypes = getSettingList('role_types', ['Other']);

    return sendJson(res, 200, { jobs, counts, sources, roleTypes });
  }

  if (method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return sendJson(res, 400, { error: 'Job title is required.' });
    }

    const company = typeof body.company === 'string' ? body.company.trim() : '';
    if (!company) {
      return sendJson(res, 400, { error: 'Company name is required.' });
    }

    // Source defaults to Other.
    const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'Other';

    // Optional fields.
    const roleType = typeof body.role_type === 'string' && body.role_type.trim() ? body.role_type.trim() : null;
    const location = typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null;
    const workMode = typeof body.work_mode === 'string' && body.work_mode.trim() ? body.work_mode.trim() : null;
    const level = typeof body.level === 'string' && body.level.trim() ? body.level.trim() : null;
    const salaryText = typeof body.salary_text === 'string' && body.salary_text.trim() ? body.salary_text.trim() : null;
    const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    // Link URL validation.
    let urlVal = typeof body.url === 'string' ? body.url.trim() : '';
    if (urlVal === '') {
      urlVal = null;
    } else if (!isValidUrl(urlVal)) {
      return sendJson(res, 400, { error: 'Job link must start with http:// or https://.' });
    }

    // Date validations (YYYY-MM-DD).
    let postedDate = typeof body.posted_date === 'string' ? body.posted_date.trim() : '';
    if (postedDate === '') {
      postedDate = null;
    } else if (!isValidDateYMD(postedDate)) {
      return sendJson(res, 400, { error: 'Posted date must be in YYYY-MM-DD format (for example, 2026-11-30).' });
    }

    let closingDate = typeof body.closing_date === 'string' ? body.closing_date.trim() : '';
    if (closingDate === '') {
      closingDate = null;
    } else if (!isValidDateYMD(closingDate)) {
      return sendJson(res, 400, { error: 'Closing date must be in YYYY-MM-DD format (for example, 2026-11-30).' });
    }

    let foundDate = typeof body.found_date === 'string' ? body.found_date.trim() : '';
    if (foundDate === '') {
      foundDate = getTodayColombo();
    } else if (!isValidDateYMD(foundDate)) {
      return sendJson(res, 400, { error: 'Date found must be in YYYY-MM-DD format (for example, 2026-11-30).' });
    }

    // Check duplicate: warn if company and title match an existing job, but never block save.
    const existing = db.prepare(`
      SELECT id FROM jobs WHERE LOWER(company) = LOWER(?) AND LOWER(title) = LOWER(?);
    `).get(company, title);

    const info = db.prepare(`
      INSERT INTO jobs (
        title, company, source, role_type, url, location,
        work_mode, level, salary_text, posted_date, closing_date,
        found_date, description, notes, job_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open');
    `).run(
      title, company, source, roleType, urlVal, location,
      workMode, level, salaryText, postedDate, closingDate,
      foundDate, description, notes
    );

    const created = db.prepare(`
      ${JOB_CTE}
      SELECT * FROM job_entries WHERE id = ?;
    `).get(info.lastInsertRowid);

    return sendJson(res, 201, {
      ...created,
      warning: existing ? 'A job with this company and title already exists.' : null,
    });
  }

  return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
}

// Handles GET /api/jobs/:id.
async function handleJobItem(req, res, id, method) {
  if (method === 'GET') {
    const job = db.prepare(`
      ${JOB_CTE}
      SELECT * FROM job_entries WHERE id = ?;
    `).get(id);

    if (!job) {
      return sendJson(res, 404, { error: 'Job not found.' });
    }

    return sendJson(res, 200, job);
  }

  // Update and delete are Phase 4 features.
  return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
}

// Dispatches /api/jobs requests. Returns true if handled.
export async function handleJobsRequest(req, res, url) {
  const method = req.method.toUpperCase();
  const path = url.pathname.replace(/\/+$/, ''); // trim trailing slash

  // Collection: /api/jobs
  if (path === '/api/jobs') {
    await handleJobsCollection(req, res, url, method);
    return true;
  }

  // Item: /api/jobs/:id
  const itemMatch = path.match(/^\/api\/jobs\/(\d+)$/);
  if (itemMatch) {
    const id = Number(itemMatch[1]);
    await handleJobItem(req, res, id, method);
    return true;
  }

  return false;
}
