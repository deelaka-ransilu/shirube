// Jobs API routes: list, get one, create, update, delete, and set outcome.
import { db } from '../db.js';
import { computeDueDate } from './followups.js';

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

// Adds days to a YYYY-MM-DD string using UTC calendar arithmetic.
function addDaysToYMD(ymdStr, days) {
  if (!ymdStr || typeof ymdStr !== 'string') return null;
  const parts = ymdStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

// Loads settings lists (sources, role_types, rejection_reasons) from the settings table.
function getSettingList(key, fallback = []) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?;').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

// Loads a single integer setting (e.g. reply_days, follow_up_days).
function getSettingNumber(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?;').get(key);
  if (!row) return fallback;
  const num = parseInt(row.value, 10);
  return Number.isFinite(num) ? num : fallback;
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
      j.archived_at,
      a.id AS application_id,
      a.status AS application_status,
      a.applied_date,
      a.rejection_reason,
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

// Fetches a single job with its application, replies, due date, and rejection reasons.
function getFullJob(id) {
  const job = db.prepare(`
    ${JOB_CTE}
    SELECT * FROM job_entries WHERE id = ?;
  `).get(id);

  if (!job) return null;

  const application = db.prepare(`
    SELECT id, job_id, applied_date, cv_version_id, status, rejection_reason
    FROM applications
    WHERE job_id = ?;
  `).get(id) || null;

  let replies = [];
  if (application) {
    replies = db.prepare(`
      SELECT id, application_id, kind, happened_on, note
      FROM replies
      WHERE application_id = ?
      ORDER BY happened_on ASC, id ASC;
    `).all(application.id);
  }

  // Calculate follow-up due date based on settings.
  let dueDate = null;
  if (application && ['applied', 'screening'].includes(application.status)) {
    const replyDays = getSettingNumber('reply_days', 7);
    const followUpDays = getSettingNumber('follow_up_days', 14);
    const screeningDays = getSettingNumber('screening_follow_up_days', 7);
    const noReplyDays = getSettingNumber('no_reply_days', 21);
    const today = getTodayColombo();

    let referenceDate = application.applied_date;
    if (application.status === 'screening') {
      const latestReply = db.prepare(`
        SELECT MAX(happened_on) AS latest_reply_date
        FROM replies
        WHERE application_id = ? AND kind = 'replied';
      `).get(application.id);

      if (latestReply && latestReply.latest_reply_date) {
        referenceDate = latestReply.latest_reply_date;
      }
    }

    dueDate = computeDueDate(referenceDate, application.status, {
      reply_days: replyDays,
      follow_up_days: followUpDays,
      screening_follow_up_days: screeningDays,
      no_reply_days: noReplyDays,
    }, today);
  }

  const rejectionReasons = getSettingList('rejection_reasons', [
    'No reply to CV',
    'Skills gap',
    'Salary',
    'Role filled',
    'Other',
  ]);

  return {
    ...job,
    application,
    replies,
    due_date: dueDate,
    rejection_reasons: rejectionReasons,
  };
}

// Handles GET /api/jobs and POST /api/jobs.
async function handleJobsCollection(req, res, url, method) {
  if (method === 'GET') {
    const stageParam = url.searchParams.get('stage') || 'all';
    const sortParam = url.searchParams.get('sort') || 'closing_date';

    // 1. Compute stage counts from the common CTE.
    const countsRow = db.prepare(`
      ${JOB_CTE}
      SELECT
        SUM(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END) AS total_all,
        SUM(CASE WHEN archived_at IS NULL AND stage = 'to_apply' THEN 1 ELSE 0 END) AS count_to_apply,
        SUM(CASE WHEN archived_at IS NULL AND stage = 'applied' THEN 1 ELSE 0 END) AS count_applied,
        SUM(CASE WHEN archived_at IS NULL AND stage = 'screening' THEN 1 ELSE 0 END) AS count_screening,
        SUM(CASE WHEN archived_at IS NULL AND stage = 'interview' THEN 1 ELSE 0 END) AS count_interview,
        SUM(CASE WHEN archived_at IS NULL AND stage = 'offer' THEN 1 ELSE 0 END) AS count_offer,
        SUM(CASE WHEN archived_at IS NULL AND stage = 'rejected' THEN 1 ELSE 0 END) AS count_rejected,
        SUM(CASE WHEN archived_at IS NULL AND stage = 'no_reply' THEN 1 ELSE 0 END) AS count_no_reply,
        SUM(CASE WHEN archived_at IS NULL AND stage = 'skipped' THEN 1 ELSE 0 END) AS count_skipped,
        SUM(CASE WHEN archived_at IS NULL AND is_stale = 1 THEN 1 ELSE 0 END) AS count_stale,
        SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) AS count_archived
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
      archived: countsRow.count_archived || 0,
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
    if (stageParam === 'archived') {
      jobs = db.prepare(`
        ${JOB_CTE}
        SELECT * FROM job_entries
        WHERE archived_at IS NOT NULL
        ORDER BY archived_at DESC, id DESC;
      `).all();
    } else if (isFiltered) {
      jobs = db.prepare(`
        ${JOB_CTE}
        SELECT * FROM job_entries
        WHERE archived_at IS NULL AND stage = ?
        ${orderByClause};
      `).all(stageParam);
    } else {
      jobs = db.prepare(`
        ${JOB_CTE}
        SELECT * FROM job_entries
        WHERE archived_at IS NULL
        ${orderByClause};
      `).all();
    }

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

    const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'Other';
    const roleType = typeof body.role_type === 'string' && body.role_type.trim() ? body.role_type.trim() : null;
    const location = typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null;
    const workMode = typeof body.work_mode === 'string' && body.work_mode.trim() ? body.work_mode.trim() : null;
    const level = typeof body.level === 'string' && body.level.trim() ? body.level.trim() : null;
    const salaryText = typeof body.salary_text === 'string' && body.salary_text.trim() ? body.salary_text.trim() : null;
    const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    let urlVal = typeof body.url === 'string' ? body.url.trim() : '';
    if (urlVal === '') {
      urlVal = null;
    } else if (!isValidUrl(urlVal)) {
      return sendJson(res, 400, { error: 'Job link must start with http:// or https://.' });
    }

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

    const created = getFullJob(info.lastInsertRowid);

    return sendJson(res, 201, {
      ...created,
      warning: existing ? 'A job with this company and title already exists.' : null,
    });
  }

  return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
}

// Handles single job item operations: GET, PUT (update), DELETE.
async function handleJobItem(req, res, id, method) {
  if (method === 'GET') {
    const job = getFullJob(id);
    if (!job) {
      return sendJson(res, 404, { error: 'Job not found.' });
    }
    return sendJson(res, 200, job);
  }

  if (method === 'PUT') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const existingJob = db.prepare('SELECT id FROM jobs WHERE id = ?;').get(id);
    if (!existingJob) {
      return sendJson(res, 404, { error: 'Job not found.' });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return sendJson(res, 400, { error: 'Job title is required.' });
    }

    const company = typeof body.company === 'string' ? body.company.trim() : '';
    if (!company) {
      return sendJson(res, 400, { error: 'Company name is required.' });
    }

    const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'Other';
    const roleType = typeof body.role_type === 'string' && body.role_type.trim() ? body.role_type.trim() : null;
    const location = typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null;
    const workMode = typeof body.work_mode === 'string' && body.work_mode.trim() ? body.work_mode.trim() : null;
    const level = typeof body.level === 'string' && body.level.trim() ? body.level.trim() : null;
    const salaryText = typeof body.salary_text === 'string' && body.salary_text.trim() ? body.salary_text.trim() : null;
    const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    let urlVal = typeof body.url === 'string' ? body.url.trim() : '';
    if (urlVal === '') {
      urlVal = null;
    } else if (!isValidUrl(urlVal)) {
      return sendJson(res, 400, { error: 'Job link must start with http:// or https://.' });
    }

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

    db.prepare(`
      UPDATE jobs
      SET title = ?, company = ?, source = ?, role_type = ?, url = ?, location = ?,
          work_mode = ?, level = ?, salary_text = ?, posted_date = ?, closing_date = ?,
          found_date = ?, description = ?, notes = ?
      WHERE id = ?;
    `).run(
      title, company, source, roleType, urlVal, location,
      workMode, level, salaryText, postedDate, closingDate,
      foundDate, description, notes, id
    );

    const updated = getFullJob(id);
    return sendJson(res, 200, updated);
  }

  if (method === 'DELETE') {
    const existingJob = db.prepare('SELECT id FROM jobs WHERE id = ?;').get(id);
    if (!existingJob) {
      return sendJson(res, 404, { error: 'Job not found.' });
    }

    const app = db.prepare('SELECT id FROM applications WHERE job_id = ?;').get(id);
    if (app) {
      db.prepare('DELETE FROM replies WHERE application_id = ?;').run(app.id);
      db.prepare('DELETE FROM applications WHERE id = ?;').run(app.id);
    }
    db.prepare('DELETE FROM jobs WHERE id = ?;').run(id);

    return sendJson(res, 200, { ok: true, id });
  }

  return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, PUT, DELETE' });
}

// Handles setting the outcome for a job (/api/jobs/:id/outcome).
async function handleJobOutcome(req, res, id, method) {
  if (method !== 'POST' && method !== 'PUT') {
    return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST, PUT' });
  }

  const job = db.prepare('SELECT id, job_status FROM jobs WHERE id = ?;').get(id);
  if (!job) {
    return sendJson(res, 404, { error: 'Job not found.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const outcome = typeof body.outcome === 'string' ? body.outcome.trim().toLowerCase() : '';
  const validOutcomes = ['applied', 'reply', 'interview', 'offer', 'rejected', 'no_reply'];
  if (!validOutcomes.includes(outcome)) {
    return sendJson(res, 400, { error: 'Invalid outcome. Must be applied, reply, interview, offer, rejected, or no_reply.' });
  }

  const today = getTodayColombo();
  let app = db.prepare('SELECT id, status, rejection_reason FROM applications WHERE job_id = ?;').get(id);

  // Check if job already has this outcome.
  const outcomeToStatusMap = {
    applied: 'applied',
    reply: 'screening',
    interview: 'interview',
    offer: 'offer',
    rejected: 'rejected',
    no_reply: 'no_reply',
  };
  const targetStatus = outcomeToStatusMap[outcome];

  if (app && app.status === targetStatus) {
    // If already rejected and updating rejection reason, update it.
    if (outcome === 'rejected' && body.rejection_reason && body.rejection_reason !== app.rejection_reason) {
      const reason = String(body.rejection_reason).trim();
      db.prepare('UPDATE applications SET rejection_reason = ? WHERE id = ?;').run(reason, app.id);
    }
    // Clicking the outcome the job already has does nothing.
    const fullJob = getFullJob(id);
    return sendJson(res, 200, fullJob);
  }

  // Ensure job_status is open if it was skipped.
  if (job.job_status === 'skipped') {
    db.prepare('UPDATE jobs SET job_status = \'open\' WHERE id = ?;').run(id);
  }

  if (outcome === 'applied') {
    if (!app) {
      db.prepare(`
        INSERT INTO applications (job_id, applied_date, status, rejection_reason)
        VALUES (?, ?, 'applied', NULL);
      `).run(id, today);
    } else {
      db.prepare(`
        UPDATE applications
        SET status = 'applied', rejection_reason = NULL
        WHERE id = ?;
      `).run(app.id);
    }
  } else if (outcome === 'reply') {
    if (!app) {
      const info = db.prepare(`
        INSERT INTO applications (job_id, applied_date, status, rejection_reason)
        VALUES (?, ?, 'screening', NULL);
      `).run(id, today);
      app = { id: info.lastInsertRowid, status: 'screening' };
    } else {
      db.prepare(`
        UPDATE applications
        SET status = 'screening', rejection_reason = NULL
        WHERE id = ?;
      `).run(app.id);
    }
    db.prepare(`
      INSERT INTO replies (application_id, kind, happened_on, note)
      VALUES (?, 'replied', ?, NULL);
    `).run(app.id, today);
  } else if (outcome === 'interview') {
    if (!app) {
      const info = db.prepare(`
        INSERT INTO applications (job_id, applied_date, status, rejection_reason)
        VALUES (?, ?, 'interview', NULL);
      `).run(id, today);
      app = { id: info.lastInsertRowid, status: 'interview' };
    } else {
      db.prepare(`
        UPDATE applications
        SET status = 'interview', rejection_reason = NULL
        WHERE id = ?;
      `).run(app.id);
    }
    db.prepare(`
      INSERT INTO replies (application_id, kind, happened_on, note)
      VALUES (?, 'first_interview', ?, NULL);
    `).run(app.id, today);
  } else if (outcome === 'offer') {
    if (!app) {
      const info = db.prepare(`
        INSERT INTO applications (job_id, applied_date, status, rejection_reason)
        VALUES (?, ?, 'offer', NULL);
      `).run(id, today);
      app = { id: info.lastInsertRowid, status: 'offer' };
    } else {
      db.prepare(`
        UPDATE applications
        SET status = 'offer', rejection_reason = NULL
        WHERE id = ?;
      `).run(app.id);
    }
    db.prepare(`
      INSERT INTO replies (application_id, kind, happened_on, note)
      VALUES (?, 'offer', ?, NULL);
    `).run(app.id, today);
  } else if (outcome === 'rejected') {
    const reason = typeof body.rejection_reason === 'string' && body.rejection_reason.trim()
      ? body.rejection_reason.trim()
      : 'Other';

    if (!app) {
      const info = db.prepare(`
        INSERT INTO applications (job_id, applied_date, status, rejection_reason)
        VALUES (?, ?, 'rejected', ?);
      `).run(id, today, reason);
      app = { id: info.lastInsertRowid, status: 'rejected' };
    } else {
      db.prepare(`
        UPDATE applications
        SET status = 'rejected', rejection_reason = ?
        WHERE id = ?;
      `).run(reason, app.id);
    }
    db.prepare(`
      INSERT INTO replies (application_id, kind, happened_on, note)
      VALUES (?, 'rejected', ?, NULL);
    `).run(app.id, today);
  } else if (outcome === 'no_reply') {
    if (!app) {
      db.prepare(`
        INSERT INTO applications (job_id, applied_date, status, rejection_reason)
        VALUES (?, ?, 'no_reply', NULL);
      `).run(id, today);
    } else {
      db.prepare(`
        UPDATE applications
        SET status = 'no_reply'
        WHERE id = ?;
      `).run(app.id);
    }
  }

  const fullJob = getFullJob(id);
  return sendJson(res, 200, fullJob);
}

// Handles archiving and unarchiving a job (/api/jobs/:id/archive).
async function handleJobArchive(req, res, id, method) {
  if (method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  }

  const existing = db.prepare('SELECT id FROM jobs WHERE id = ?;').get(id);
  if (!existing) {
    return sendJson(res, 404, { error: 'Job not found.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  if (typeof body.archived !== 'boolean') {
    return sendJson(res, 400, { error: 'Archived flag must be a boolean.' });
  }

  const archivedAt = body.archived ? getTodayColombo() : null;
  db.prepare('UPDATE jobs SET archived_at = ? WHERE id = ?;').run(archivedAt, id);

  const fullJob = getFullJob(id);
  return sendJson(res, 200, fullJob);
}

// Validates that an ids argument is a non-empty array of positive integers, max 200.
function isValidJobIdArray(ids) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
    return false;
  }
  for (const id of ids) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      return false;
    }
  }
  return true;
}

// Handles bulk archiving/unarchiving jobs (POST /api/jobs/bulk-archive).
async function handleJobsBulkArchive(req, res, method) {
  if (method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  if (!isValidJobIdArray(body.ids)) {
    return sendJson(res, 400, { error: 'ids must be a non-empty array of up to 200 positive integers.' });
  }

  if (typeof body.archived !== 'boolean') {
    return sendJson(res, 400, { error: 'archived must be a boolean.' });
  }

  const archivedAt = body.archived ? getTodayColombo() : null;
  const uniqueIds = [...new Set(body.ids)];
  let updatedCount = 0;

  const updateStmt = db.prepare('UPDATE jobs SET archived_at = ? WHERE id = ?;');

  db.exec('BEGIN;');
  try {
    for (const id of uniqueIds) {
      const info = updateStmt.run(archivedAt, id);
      updatedCount += info.changes;
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    return sendJson(res, 500, { error: 'Failed to update jobs.' });
  }

  return sendJson(res, 200, { ok: true, updated: updatedCount });
}

// Handles bulk deleting jobs (POST /api/jobs/bulk-delete).
async function handleJobsBulkDelete(req, res, method) {
  if (method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  if (!isValidJobIdArray(body.ids)) {
    return sendJson(res, 400, { error: 'ids must be a non-empty array of up to 200 positive integers.' });
  }

  const uniqueIds = [...new Set(body.ids)];
  let deletedCount = 0;

  const findAppStmt = db.prepare('SELECT id FROM applications WHERE job_id = ?;');
  const deleteRepliesStmt = db.prepare('DELETE FROM replies WHERE application_id = ?;');
  const deleteAppStmt = db.prepare('DELETE FROM applications WHERE id = ?;');
  const deleteJobStmt = db.prepare('DELETE FROM jobs WHERE id = ?;');

  db.exec('BEGIN;');
  try {
    for (const id of uniqueIds) {
      const app = findAppStmt.get(id);
      if (app) {
        deleteRepliesStmt.run(app.id);
        deleteAppStmt.run(app.id);
      }
      const info = deleteJobStmt.run(id);
      deletedCount += info.changes;
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    return sendJson(res, 500, { error: 'Failed to delete jobs.' });
  }

  return sendJson(res, 200, { ok: true, deleted: deletedCount });
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

  // Bulk archive: /api/jobs/bulk-archive
  if (path === '/api/jobs/bulk-archive') {
    await handleJobsBulkArchive(req, res, method);
    return true;
  }

  // Bulk delete: /api/jobs/bulk-delete
  if (path === '/api/jobs/bulk-delete') {
    await handleJobsBulkDelete(req, res, method);
    return true;
  }

  // Archive: /api/jobs/:id/archive
  const archiveMatch = path.match(/^\/api\/jobs\/(\d+)\/archive$/);
  if (archiveMatch) {
    const id = Number(archiveMatch[1]);
    await handleJobArchive(req, res, id, method);
    return true;
  }

  // Outcome: /api/jobs/:id/outcome
  const outcomeMatch = path.match(/^\/api\/jobs\/(\d+)\/outcome$/);
  if (outcomeMatch) {
    const id = Number(outcomeMatch[1]);
    await handleJobOutcome(req, res, id, method);
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
