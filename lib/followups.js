// When is a follow-up due? Pure function, easy to test.
// Only a job that is still "applied" (no reply yet) needs one.
// The wait is counted from the latest Applied or Follow-up stage that is dated today or earlier
// (a follow-up dated in the future has not happened yet). With no dated stage, the applied date is used.
import { addDays, daysBetween } from './dates.js';

export function followUpInfo(job, stages, wait, today) {
  if (job.status !== 'applied') return null;
  const contacts = stages
    .filter((s) => (s.kind === 'applied' || s.kind === 'follow_up') && s.happened_on && s.happened_on <= today)
    .sort((a, b) => (a.happened_on < b.happened_on ? 1 : a.happened_on > b.happened_on ? -1 : b.id - a.id));
  const last = contacts[0];
  const from = last ? last.happened_on : (job.applied_on && job.applied_on <= today ? job.applied_on : '');
  if (!from) return null;
  const due_on = addDays(from, wait);
  const state = today > due_on ? 'overdue' : today === due_on ? 'today' : 'later';
  return { from, since: last?.kind === 'follow_up' ? 'follow_up' : 'applied', due_on, state, due: state !== 'later', days_since: daysBetween(from, today) };
}
