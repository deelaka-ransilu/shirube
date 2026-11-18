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

// "Since you started": every day from the first application to today, as boxes.
// days = [{date, count}] oldest first (only days that had applications). Up to 147 days (21 columns of 7)
// each box is one day; a longer time uses one box per week (the newest 147 weeks).
const MAX_BOXES = 147;
const DAY_MS = 86400000;
const dayNumber = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY_MS);

export function sinceStart(days = [], today) {
  const total = days.reduce((a, d) => a + d.count, 0);
  if (!days.length || total === 0) {
    return { empty: true, total: 0, label: 'applied · not started', line: 'Your first application starts this chart.', unit: 'day', cells: [], aria: 'No applications sent yet' };
  }
  const first = days[0].date;
  const end = Math.max(dayNumber(today), dayNumber(days[days.length - 1].date));
  const span = end - dayNumber(first) + 1;
  const unit = span > MAX_BOXES ? 'week' : 'day';
  const size = unit === 'week' ? 7 : 1;
  let cells = Array.from({ length: Math.ceil(span / size) }, () => 0);
  for (const d of days) cells[Math.floor((dayNumber(d.date) - dayNumber(first)) / size)] += d.count;
  if (cells.length > MAX_BOXES) cells = cells.slice(cells.length - MAX_BOXES);
  const since = formatDay(first, today);
  return {
    empty: false,
    total,
    label: `applied · since ${since}`,
    line: `${total === 1 ? '1 application' : `${total} applications`} in ${span === 1 ? '1 day' : `${span} days`}`,
    unit,
    cells,
    aria: `Applications sent since ${since}, one box per ${unit}: ${total} in total`,
  };
}
