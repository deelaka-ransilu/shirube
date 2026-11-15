import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { STATUS_KEYS, badgeText } from '../lib/status.js';
import { formatDay, initials, todayISO } from '../lib/format.js';
import { closeBadge } from '../lib/badges.js';
import { bindScroll } from '../lib/scroll.js';
import { setTopAction } from '../lib/shell.js';

const TILES = STATUS_KEYS; // To apply, Applied, Reply, Interview, Offer, Rejected

// Same calm look as the Jobs list: only Interview and Offer get a colour. Every status keeps its shape and word.
const BADGE_CLASS = { interview: 'b-interview', offer: 'b-offer' };
const badgeClass = (status) => raw(BADGE_CLASS[status] ?? '');

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
  }),
  interview: (s) => ({
    symbol: '■',
    title: `Prepare for the ${who(s)} interview`,
    text: `${formatDay(s.date)}, ${away(s.days)}. Add your notes to the job.`,
  }),
  offer: (s) => ({
    symbol: '◆',
    title: `Answer the ${who(s)} offer`,
    text: 'Write down what you want to ask before you reply.',
  }),
  apply: (s) => ({
    symbol: '□',
    title: `Apply to ${s.title}${s.company ? ' at ' + s.company : ''}`,
    text: `Closes ${formatDay(s.date)}, the soonest of your ${s.open_count} open job${s.open_count === 1 ? '' : 's'}.`,
  }),
};

// A job row: the whole row is the link (see .row-click).
function jobRow(job, right, extra = '') {
  const small = [job.company, extra].filter(Boolean).join(' · ');
  return html`
    <div class="list-row row-click">
      <div class="avatar" aria-hidden="true">${initials(who(job))}</div>
      <div class="row-main">
        ${small ? html`<div class="text-muted text-sm">${small}</div>` : ''}
        <a class="row-title" href="${jobLink(job.id)}">${job.title}</a>
      </div>
      <div class="row-right">${right}</div>
    </div>`;
}

// A card with a heading, a short note, an optional link and a list that scrolls inside the card.
function card(title, note, link, rows, cls = '') {
  return html`
    <section class="card compact dash-card ${cls}">
      <div class="dash-head">
        <h2>${title}</h2>
        ${link ? html`<a class="link text-sm" href="${link.href}">${link.text}</a>` : ''}
      </div>
      <p class="text-muted text-sm dash-note">${note}</p>
      <div class="scroll-wrap">
        <div class="scroller" tabindex="0" role="region" aria-label="${title}">${rows}</div>
        <div class="scroll-fade" aria-hidden="true"></div>
        <button type="button" class="more-pill" data-more hidden aria-label="Show more in ${title}"></button>
      </div>
    </section>`;
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
  const today = todayISO();
  const addJob = html`<a class="btn btn-primary" href="#/jobs/new">+ Add job</a>`;

  if (counts.all === 0) {
    el.innerHTML = html`
      <div class="dash-page">
        <h1 class="sr-only">Dashboard</h1>
        <div class="card empty">
          <h2>No jobs yet</h2>
          <p class="text-muted">Add the first job you want to track. This page fills up as you add jobs and record what happens.</p>
        </div>
      </div>`;
    setTopAction(addJob);
    return;
  }

  const openCard = card(
    'Open to apply',
    'Closing soonest first, then newest found',
    counts.open > open.length ? { href: '#/jobs?status=open', text: 'See all' } : null,
    open.length
      ? open.map((j) => jobRow(j, closeBadge(j.closes_on, today, j.found_on)))
      : html`<p class="text-muted dash-empty">Nothing waiting. Jobs you have not applied to yet show here.</p>`,
  );

  const appliedCard = card(
    'Applied',
    'Newest application first',
    { href: '#/jobs', text: 'See all jobs' },
    applied.length
      ? applied.map((j) => jobRow(
        j,
        html`<span class="badge ${badgeClass(j.status)}">${badgeText(j.status)}</span>`,
        j.applied_on ? `Applied ${formatDay(j.applied_on)}` : '',
      ))
      : html`<p class="text-muted dash-empty">No applications yet. Open a job and mark it Applied.</p>`,
  );

  const happenedCard = card(
    'What happened',
    'Latest updates from your jobs',
    null,
    activity.length
      ? activity.map((a) => {
        const kind = ACTIVITY[a.kind] ?? ACTIVITY.other;
        return html`
          <div class="list-row row-click">
            <div class="avatar sym" aria-hidden="true">${kind.symbol}</div>
            <div class="row-main">
              <a class="row-title" href="${jobLink(a.job_id)}">${kind.text(a)}</a>
              <div class="text-muted text-sm">${formatDay(a.happened_on)} · ${a.title}</div>
            </div>
          </div>`;
      })
      : html`<p class="text-muted dash-empty">Nothing yet. Add stages on a job and they show here.</p>`,
  );

  const nextCard = card(
    'What to do next',
    'From your own jobs, most urgent first',
    null,
    next_steps.length
      ? next_steps.map((s) => {
        const step = STEPS[s.kind](s);
        return html`
          <div class="list-row row-click step-row">
            <div class="avatar sym" aria-hidden="true">${step.symbol}</div>
            <div class="row-main">
              <a class="row-title" href="${jobLink(s.job_id)}"><b>${step.title}</b></a>
              <div class="text-muted text-sm">${step.text}</div>
            </div>
          </div>`;
      })
      : html`<p class="text-muted dash-empty">All clear. Nothing is due and no open job has a closing date coming up.</p>`,
    'dash-next',
  );

  el.innerHTML = html`
    <div class="dash-page">
      <h1 class="sr-only">Dashboard</h1>
      <div class="grid-tiles tiles sm dash-tiles" aria-label="Jobs by stage">
        ${TILES.map((k) => html`<a class="tile" href="#/jobs?status=${k}"><span>${badgeText(k)}</span><strong>${counts[k]}</strong></a>`)}
      </div>

      <div class="dash-grid">
        <div class="dash-col">${nextCard}${openCard}</div>
        <div class="dash-col">${appliedCard}${happenedCard}</div>
      </div>
    </div>`;

  setTopAction(addJob);
  el.querySelectorAll('.scroll-wrap').forEach((wrap) => bindScroll(wrap, '.list-row'));

  el.onclick = (e) => {
    const more = e.target.closest('[data-more]');
    if (!more) return;
    const box = more.closest('.scroll-wrap')?.querySelector('.scroller');
    box?.scrollBy({ top: box.clientHeight * 0.8, behavior: 'smooth' });
  };
}
