import { todayLocal } from '../lib/dates.js';
import { followUpInfo } from '../lib/followups.js';

// The four columns of the Follow-ups board ("Applied jobs" in the mockup).
const COLUMNS = [
  { key: 'waiting', title: 'Applied, waiting', symbol: '●', statuses: ['applied'] },
  { key: 'talks',   title: 'Calls and interviews', symbol: '■', statuses: ['reply', 'interview'] },
  { key: 'offer',   title: 'Offer', symbol: '◆', statuses: ['offer'] },
  { key: 'closed',  title: 'Closed', symbol: '▲', statuses: ['rejected'] },
];

// Every job that has been applied to, with its stages and follow-up state.
function loadJobs(db, today) {
  const wait = db.prepare('SELECT follow_up_days FROM profile WHERE id = 1').get().follow_up_days;
  const jobs = db.prepare("SELECT id, title, company, status, applied_on FROM jobs WHERE status != 'open'").all();
  const byJob = new Map(jobs.map((j) => [j.id, []]));
  const stages = db.prepare(
    "SELECT id, job_id, kind, happened_on, note FROM stages ORDER BY happened_on = '', happened_on, id",
  ).all();
  for (const s of stages) byJob.get(s.job_id)?.push({ id: s.id, kind: s.kind, happened_on: s.happened_on, note: s.note });
  return jobs.map((j) => {
    const list = byJob.get(j.id);
    const dated = list.map((s) => s.happened_on).filter(Boolean);
    return { ...j, stages: list, last_on: dated.length ? dated[dated.length - 1] : j.applied_on, follow_up: followUpInfo(j, list, wait, today) };
  });
}

const URGENCY = { overdue: 0, today: 1, later: 2 };

export function getFollowups({ db }) {
  const today = todayLocal();
  const jobs = loadJobs(db, today);
  const columns = COLUMNS.map(({ statuses, ...col }) => {
    const mine = jobs.filter((j) => statuses.includes(j.status));
    if (col.key === 'waiting') {
      // Due first (longest wait first), then the oldest application first.
      mine.sort((a, b) => {
        const ua = URGENCY[a.follow_up?.state] ?? 3;
        const ub = URGENCY[b.follow_up?.state] ?? 3;
        return ua - ub || (a.follow_up?.from ?? '9') .localeCompare(b.follow_up?.from ?? '9') || a.id - b.id;
      });
    } else {
      mine.sort((a, b) => (b.last_on ?? '').localeCompare(a.last_on ?? '') || b.id - a.id);
    }
    return { ...col, jobs: mine };
  });
  const due = jobs.filter((j) => j.follow_up?.due).length;
  return { today, due, columns };
}

// Just the number for the bell in the top bar.
export function getFollowupCount({ db }) {
  return { due: loadJobs(db, todayLocal()).filter((j) => j.follow_up?.due).length };
}
