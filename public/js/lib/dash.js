// Words and numbers for the Dashboard. Pure functions (no browser), so they are tested in Node.
import { formatDay, closingWithDays } from './format.js';

const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
const away = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${n} days away`);
export const who = (x) => x.company || x.title;

// The big sentence: one thing to do now. Returns { label, sentence, line, href }.
// next_steps come from the server, most urgent first. With none, the first open job is the suggestion.
export function nextUp(data, today) {
  const [step, ...rest] = data.next_steps ?? [];
  const more = rest.length ? ` ${rest.length} more after this.` : '';

  if (step?.kind === 'follow_up') {
    return {
      label: 'next: follow up',
      sentence: `Follow up with ${who(step)}`,
      line: `${step.since === 'follow_up' ? 'Last follow-up' : 'Applied'} ${formatDay(step.date, today)}, ${days(step.days)} with no reply.${more}`,
      href: `#/jobs/${step.job_id}`,
    };
  }
  if (step?.kind === 'interview') {
    return {
      label: 'next: interview',
      sentence: `Prepare for the ${who(step)} interview`,
      line: `${formatDay(step.date, today)}, ${away(step.days)}. Add your notes to the job.${more}`,
      href: `#/jobs/${step.job_id}`,
    };
  }
  if (step?.kind === 'offer') {
    return {
      label: 'next: offer',
      sentence: `Answer the ${who(step)} offer`,
      line: `Write down what you want to ask before you reply.${more}`,
      href: `#/jobs/${step.job_id}`,
    };
  }
  if (step?.kind === 'apply') {
    const n = step.open_count;
    return {
      label: 'next: open to apply',
      sentence: `Start with ${step.title}`,
      line: `${step.company ? step.company + ' · ' : ''}Closes ${formatDay(step.date, today)}, the soonest of your ${n} open job${n === 1 ? '' : 's'}.${more}`,
      href: `#/jobs/${step.job_id}`,
    };
  }

  const first = data.open?.[0];
  if (first) {
    const bits = [first.company, first.found_on ? `found ${formatDay(first.found_on, today)}` : ''].filter(Boolean).join(' · ');
    return {
      label: 'next: open to apply',
      sentence: `Start with ${first.title}`,
      line: `${bits ? bits + '. ' : ''}Nothing is due and no open job has a closing date coming up.`,
      href: `#/jobs/${first.id}`,
    };
  }
  return {
    label: 'next: nothing waiting',
    sentence: 'All caught up',
    line: 'Nothing is due and no job is waiting to be applied to. New jobs may have something.',
    href: '',
  };
}

// The four numbers under the sentence.
export function statRow(counts) {
  return ['applied', 'reply', 'interview', 'offer'].map((key) => ({ key, n: counts[key] ?? 0 }));
}

// Closing text for an open job row: the closing date when there is one, else the day it was found.
export function whenText(job, today) {
  if (!job.closes_on && job.found_on) return `Found ${formatDay(job.found_on, today)}`;
  return closingWithDays(job.closes_on, today);
}

// "Last 7 days": the line under the heading, the screen-reader text and the dot columns.
export function sentSummary(sent = [], today) {
  const total = sent.reduce((a, d) => a + d.count, 0);
  const busy = sent.filter((d) => d.count > 0);
  let line;
  if (!sent.length || total === 0) line = 'None sent in the last 7 days';
  else if (busy.length === 1) line = `${total} sent on ${formatDay(busy[0].date, today)}`;
  else line = `${total} sent in the last 7 days`;
  const aria = `Applications sent each day, last 7 days: ${sent.map((d) => `${formatDay(d.date, today)} ${d.count}`).join(', ')}`;
  return { total, line, aria, columns: sent.map((d) => d.count) };
}
