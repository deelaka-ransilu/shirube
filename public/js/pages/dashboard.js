import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { STATUS, STATUS_KEYS, statusText } from '../lib/status.js';
import { closingText, formatDay, initials } from '../lib/format.js';

const TILES = STATUS_KEYS; // To apply, Applied, Reply, Interview, Offer, Rejected

const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
const away = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${n} days away`);
const who = (x) => x.company || x.title;
const jobLink = (id) => `#/jobs/${id}`;

// "What happened": one sentence per stage.
const ACTIVITY = {
  applied:   { symbol: '●', text: (a) => `You applied to ${who(a)}` },
  follow_up: { symbol: '□', text: (a) => `You followed up with ${who(a)}` },
  reply:     { symbol: '○', text: (a) => `${who(a)} replied` },
  interview: { symbol: '■', text: (a) => `Interview with ${who(a)}` },
  offer:     { symbol: '◆', text: (a) => `${who(a)} sent an offer` },
  rejected:  { symbol: '▲', text: (a) => `${who(a)} turned you down` },
  other:     { symbol: '□', text: (a) => `Note on ${who(a)}` },
};

// "What to do next": a title, a short line and the symbol for each step.
const STEPS = {
  follow_up: (s) => ({
    symbol: '◇',
    title: `Follow up with ${who(s)}`,
    text: `${s.since === 'follow_up' ? 'Last follow-up' : 'Applied'} ${formatDay(s.date)}, ${days(s.days)} with no reply.`,
    action: 'Open the job',
  }),
  interview: (s) => ({
    symbol: '■',
    title: `Prepare for the ${who(s)} interview`,
    text: `${formatDay(s.date)}, ${away(s.days)}. Add your notes to the job.`,
    action: 'Open the job',
  }),
  offer: (s) => ({
    symbol: '◆',
    title: `Answer the ${who(s)} offer`,
    text: 'Write down what you want to ask before you reply.',
    action: 'Open the job',
  }),
  apply: (s) => ({
    symbol: '□',
    title: `Apply to ${s.title}${s.company ? ' at ' + s.company : ''}`,
    text: `Closes ${formatDay(s.date)}, the soonest of your ${s.open_count} open job${s.open_count === 1 ? '' : 's'}.`,
    action: 'Open the job',
  }),
};

function jobRow(job, right) {
  return html`
    <div class="list-row">
      <div class="avatar" aria-hidden="true">${initials(who(job))}</div>
      <div class="row-main">
        <a class="row-title" href="${jobLink(job.id)}">${job.title}</a>
        ${job.company ? html`<div class="text-muted text-sm">${job.company}</div>` : ''}
      </div>
      <div class="row-right">${right}</div>
    </div>`;
}

function cardHead(title, note, linkHref, linkText) {
  return html`
    <div class="dash-head">
      <h2>${title}</h2>
      ${linkText ? html`<a class="link text-sm" href="${linkHref}">${linkText}</a>` : ''}
    </div>
    <p class="text-muted text-sm dash-note">${note}</p>`;
}

export async function render(el, { stale }) {
  let data;
  try {
    data = await api('/api/dashboard');
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`<div class="card"><h2>Could not load the dashboard</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;

  const { counts, open, applied, activity, next_steps } = data;

  const head = html`
    <div class="page-head">
      <h1>Dashboard</h1>
      <a class="btn btn-primary" href="#/jobs/new">+ Add job</a>
    </div>`;

  if (counts.all === 0) {
    el.innerHTML = html`${head}
      <div class="card empty">
        <h2>No jobs yet</h2>
        <p class="text-muted">Add the first job you want to track. This page fills up as you add jobs and record what happens.</p>
      </div>`;
    return;
  }

  const openCard = html`
    <section class="card">
      ${cardHead('Open to apply', 'Closing soonest first', '#/jobs?status=open', counts.open > open.length ? 'See all' : '')}
      ${open.length
        ? open.map((j) => jobRow(j, html`<span class="text-muted text-sm">${closingText(j.closes_on)}</span>`))
        : html`<p class="text-muted">Nothing waiting. Jobs you have not applied to yet show here.</p>`}
    </section>`;

  const appliedCard = html`
    <section class="card">
      ${cardHead('Applied', 'Newest application first', '#/jobs', 'See all jobs')}
      ${applied.length
        ? applied.map((j) => jobRow(j, html`<span class="tag">${statusText(j.status)}</span>${j.applied_on ? html`<div class="text-muted text-sm">Applied ${formatDay(j.applied_on)}</div>` : ''}`))
        : html`<p class="text-muted">No applications yet. Open a job and mark it Applied.</p>`}
    </section>`;

  const happenedCard = html`
    <section class="card">
      ${cardHead('What happened', 'Latest updates from your jobs', '', '')}
      ${activity.length
        ? activity.map((a) => {
          const kind = ACTIVITY[a.kind] ?? ACTIVITY.other;
          return html`
            <div class="list-row">
              <div class="avatar sym" aria-hidden="true">${kind.symbol}</div>
              <div class="row-main">
                <a class="row-title" href="${jobLink(a.job_id)}">${kind.text(a)}</a>
                <div class="text-muted text-sm">${formatDay(a.happened_on)} · ${a.title}</div>
              </div>
            </div>`;
        })
        : html`<p class="text-muted">Nothing yet. Add stages on a job and they show here.</p>`}
    </section>`;

  const nextCard = html`
    <section class="card">
      ${cardHead('What to do next', 'From your own jobs, most urgent first', '', '')}
      ${next_steps.length
        ? next_steps.map((s) => {
          const step = STEPS[s.kind](s);
          return html`
            <div class="list-row step-row">
              <div class="avatar sym" aria-hidden="true">${step.symbol}</div>
              <div class="row-main">
                <b>${step.title}</b>
                <div class="text-muted text-sm">${step.text}</div>
                <a class="link text-sm" href="${jobLink(s.job_id)}">${step.action}</a>
              </div>
            </div>`;
        })
        : html`<p class="text-muted">All clear. Nothing is due and no open job has a closing date coming up.</p>`}
    </section>`;

  el.innerHTML = html`${head}
    <div class="dash-grid">
      <div class="dash-col">${openCard}</div>
      <div class="dash-col">${appliedCard}${happenedCard}</div>
      <div class="dash-col">${nextCard}</div>
    </div>

    <div class="grid-tiles dash-tiles" aria-label="Jobs by stage">
      ${TILES.map((k) => html`<a class="tile" href="#/jobs?status=${k}"><span>${statusText(k)}</span><strong>${counts[k]}</strong></a>`)}
    </div>`;
}
