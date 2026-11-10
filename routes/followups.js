// Follow-ups API routes: compute and list upcoming and overdue follow-ups.
import { db } from '../db.js';

// Computes today's date in Asia/Colombo (YYYY-MM-DD).
export function getTodayColombo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Adds days to a YYYY-MM-DD string using UTC calendar arithmetic.
export function addDaysToYMD(ymdStr, days) {
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

// Loads a single integer setting (reply_days, follow_up_days, no_reply_days).
export function getSettingNumber(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?;').get(key);
  if (!row) return fallback;
  const num = parseInt(row.value, 10);
  return Number.isFinite(num) ? num : fallback;
}

// Computes the due date for an application based on applied_date, status, settings, and today.
export function computeDueDate(appliedDate, status, settings, today) {
  if (!appliedDate) return null;
  const dReply = addDaysToYMD(appliedDate, settings.reply_days);
  const dFollowUp = addDaysToYMD(appliedDate, settings.follow_up_days);
  const dNoReply = addDaysToYMD(appliedDate, settings.no_reply_days);

  if (status === 'screening') {
    return dFollowUp;
  }

  if (status === 'applied') {
    if (today < dFollowUp) {
      return dReply;
    } else if (today < dNoReply) {
      return dFollowUp;
    } else {
      return dNoReply;
    }
  }

  return null;
}

// Sends a JSON response with status and headers.
function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

// Handles GET /api/followups.
export async function handleFollowupsRequest(req, res, url) {
  const method = req.method.toUpperCase();
  const path = url.pathname.replace(/\/+$/, '');

  if (path !== '/api/followups') {
    return false;
  }

  if (method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    return true;
  }

  const today = getTodayColombo();
  const settings = {
    reply_days: getSettingNumber('reply_days', 7),
    follow_up_days: getSettingNumber('follow_up_days', 14),
    no_reply_days: getSettingNumber('no_reply_days', 21),
  };

  const sevenDaysLater = addDaysToYMD(today, 7);

  // Query applications with status 'applied' or 'screening' only.
  const rows = db.prepare(`
    SELECT
      j.id AS job_id,
      j.title,
      j.company,
      j.work_mode,
      j.level,
      j.url,
      j.closing_date,
      j.found_date,
      a.id AS application_id,
      a.status AS application_status,
      a.applied_date,
      (
        SELECT MAX(r.happened_on)
        FROM replies r
        WHERE r.application_id = a.id AND r.kind = 'replied'
      ) AS latest_reply_date
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.status IN ('applied', 'screening')
      AND j.job_status != 'skipped'
      AND j.archived_at IS NULL;
  `).all();

  const comingUp = [];
  const overdue = [];

  for (const row of rows) {
    const referenceDate = (row.application_status === 'screening' && row.latest_reply_date)
      ? row.latest_reply_date
      : row.applied_date;
    const dueDate = computeDueDate(referenceDate, row.application_status, settings, today);
    if (!dueDate) continue;

    const item = {
      ...row,
      due_date: dueDate,
    };

    if (dueDate < today) {
      overdue.push(item);
    } else if (dueDate >= today && dueDate <= sevenDaysLater) {
      comingUp.push(item);
    }
  }

  // Sort by due date ASC, then company ASC (case-insensitive).
  function sortRows(a, b) {
    const dateCmp = a.due_date.localeCompare(b.due_date);
    if (dateCmp !== 0) return dateCmp;
    return a.company.toLowerCase().localeCompare(b.company.toLowerCase());
  }

  comingUp.sort(sortRows);
  overdue.sort(sortRows);

  sendJson(res, 200, {
    today,
    coming_up: comingUp,
    overdue,
    settings,
  });

  return true;
}
