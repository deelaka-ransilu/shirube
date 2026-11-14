import { STATUSES } from '../lib/validate-job.js';
import { todayLocal, daysBetween } from '../lib/dates.js';
import { followUpInfo } from '../lib/followups.js';

const LIMIT = 5;
const JOB_COLUMNS = 'id, title, company, status, closes_on, applied_on';

// Everything the Dashboard shows, in one answer.
export function getDashboard({ db }) {
  const today = todayLocal();

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status').all()) counts[r.status] = r.n;
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);

  // Open to apply: closing soonest first, then no closing date, then already closed.
  const open = db.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE status = 'open'
     ORDER BY CASE WHEN closes_on = '' THEN 1 WHEN closes_on < ? THEN 2 ELSE 0 END, closes_on, id DESC
     LIMIT ${LIMIT}`,
  ).all(today);

  // Applied: every job you applied to that is not rejected, newest application first.
  const applied = db.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE status IN ('applied', 'reply', 'interview', 'offer')
     ORDER BY applied_on = '', applied_on DESC, id DESC
     LIMIT ${LIMIT}`,
  ).all();

  // What happened: the latest dated stages that are not in the future.
  const activity = db.prepare(
    `SELECT s.id, s.kind, s.happened_on, j.id AS job_id, j.title, j.company
     FROM stages s JOIN jobs j ON j.id = s.job_id
     WHERE s.happened_on != '' AND s.happened_on <= ?
     ORDER BY s.happened_on DESC, s.id DESC LIMIT ${LIMIT}`,
  ).all(today);

  return { today, counts, open, applied, activity, next_steps: nextSteps(db, today, counts.open) };
}

// What to do next, most urgent first. Only things the saved data can show.
function nextSteps(db, today, openCount) {
  const steps = [];
  const wait = db.prepare('SELECT follow_up_days FROM profile WHERE id = 1').get().follow_up_days;

  // 1. Applied jobs with no reply after your follow-up days (see lib/followups.js).
  const stageRows = db.prepare('SELECT id, kind, happened_on FROM stages WHERE job_id = ?');
  const due = [];
  for (const j of db.prepare("SELECT id, title, company, status, applied_on FROM jobs WHERE status = 'applied'").all()) {
    const info = followUpInfo(j, stageRows.all(j.id), wait, today);
    if (info?.due) due.push({ kind: 'follow_up', job_id: j.id, title: j.title, company: j.company, date: info.from, days: info.days_since, since: info.since });
  }
  due.sort((a, b) => b.days - a.days || a.job_id - b.job_id);
  steps.push(...due);

  // 2. Interviews coming up (dated today or later), soonest first.
  const interviews = db.prepare(
    `SELECT j.id AS job_id, j.title, j.company, MIN(s.happened_on) AS date
     FROM stages s JOIN jobs j ON j.id = s.job_id
     WHERE s.kind = 'interview' AND s.happened_on >= ? AND j.status = 'interview'
     GROUP BY j.id ORDER BY date, j.id`,
  ).all(today);
  for (const i of interviews) steps.push({ kind: 'interview', ...i, days: daysBetween(today, i.date) });

  // 3. Offers waiting for an answer.
  for (const o of db.prepare("SELECT id AS job_id, title, company FROM jobs WHERE status = 'offer' ORDER BY id").all()) {
    steps.push({ kind: 'offer', ...o });
  }

  // 4. The open job that closes soonest.
  const soonest = db.prepare(
    "SELECT id AS job_id, title, company, closes_on AS date FROM jobs WHERE status = 'open' AND closes_on != '' AND closes_on >= ? ORDER BY closes_on, id LIMIT 1",
  ).get(today);
  if (soonest) steps.push({ kind: 'apply', ...soonest, days: daysBetween(today, soonest.date), open_count: openCount });

  return steps.slice(0, LIMIT);
}
