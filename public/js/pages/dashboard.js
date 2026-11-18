import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { statusWord } from '../lib/status.js';
import { formatDay, initials, todayISO } from '../lib/format.js';
import { nextUp, statRow, whenText, sinceStart, who } from '../lib/dash.js';
import { setTopAction } from '../lib/shell.js';

const jobLink = (id) => `#/jobs/${id}`;
const DOT_ROWS = 5;

// A small drawing for empty places: a Gulf-blue square and a deep-blue triangle.
const EMPTY_ART = raw('<svg class="empty-art" viewBox="0 0 64 40" aria-hidden="true"><rect x="4" y="12" width="24" height="24" rx="3" fill="var(--color-accent)"/><path d="M34 36L46 8l12 28z" fill="var(--color-focus)"/></svg>');
const empty = (title, text) => html`<div class="dash-empty">${EMPTY_ART}<b>${title}</b><p class="text-muted">${text}</p></div>`;

// A job row: the whole row is the link (see .row-click).
function jobRow(job, tag, small) {
  return html`
    <div class="list-row row-click">
      <div class="avatar" aria-hidden="true">${initials(who(job))}</div>
      <div class="row-main">
        ${small ? html`<div class="text-muted text-sm">${small}</div>` : ''}
        <a class="row-title" href="${jobLink(job.id)}">${job.title}</a>
      </div>
      <div class="row-right">${tag}<span class="chev" aria-hidden="true">›</span></div>
    </div>`;
}

// One small square per day (or per week on a long history), filled column by column, 7 to a column.
// More than one application in a box makes it solid orange; one makes it lighter.
const BOX = 12;
const GAP = 4;
function boxChart(since) {
  const rows = Math.min(7, since.cells.length);
  const cols = Math.ceil(since.cells.length / 7);
  const w = cols * (BOX + GAP) - GAP;
  const h = rows * (BOX + GAP) - GAP;
  const rects = since.cells.map((n, i) => {
    const level = n === 0 ? '' : n === 1 ? ' on' : ' on strong';
    return html`<rect class="box${level}" x="${Math.floor(i / 7) * (BOX + GAP)}" y="${(i % 7) * (BOX + GAP)}" width="${BOX}" height="${BOX}" rx="3"/>`;
  });
  return html`<svg class="box-chart" role="img" aria-label="${since.aria}" viewBox="0 0 ${w} ${h}" style="width:min(100%, ${w}px)">${rects}</svg>`;
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

  const { counts, open, applied } = data;
  const today = todayISO();
  const addJob = html`<a class="btn btn-primary" href="#/jobs/new">+ Add job</a>`;
  setTopAction(addJob);

  if (counts.all === 0) {
    el.innerHTML = html`
      <div class="dash-page">
        <h1 class="sr-only">Dashboard</h1>
        <div class="card dash-none">${EMPTY_ART}<h2>No jobs yet</h2><p class="text-muted">Add the first job you want to track. This page fills up as you add jobs and record what happens.</p></div>
      </div>`;
    return;
  }

  const up = nextUp(data, today);
  const sentence = html`${up.sentence}<span class="stop">.</span>`;
  const since = sinceStart(data.applied_days, today);

  const openRows = open.length
    ? open.map((j) => jobRow(j, html`<span class="tag">${whenText(j, today)}</span>`, j.company))
    : empty('Nothing waiting', 'Jobs you have not applied to yet show here.');

  const appliedRows = applied.length
    ? applied.map((j) => jobRow(j, html`<span class="tag tag-soft">${statusWord(j.status)}</span>`, [j.company, j.applied_on ? `applied ${formatDay(j.applied_on, today)}` : ''].filter(Boolean).join(' · ')))
    : empty('No applications yet', 'Open a job and mark it Applied.');

  el.innerHTML = html`
    <div class="dash-page">
      <h1 class="sr-only">Dashboard</h1>
      <div class="bento">
        <section class="bento-tile bento-since">
          <span class="mono since-label">${since.label}</span>
          <span class="since-num">${since.total}</span>
          <p class="mono since-line">${since.line}</p>
          ${since.empty ? '' : html`<div class="since-chart">${boxChart(since)}<p class="mono since-legend">1 box = 1 ${since.unit}</p></div>`}
        </section>

        <section class="bento-tile bento-next">
          <span class="mono text-muted">${up.label}</span>
          <h2 class="sentence${up.sentence.length > 56 ? ' long' : ''}">${up.href ? html`<a href="${up.href}">${sentence}</a>` : sentence}</h2>
          <p class="text-muted next-line">${up.line}</p>
          <div class="stat-row">
            ${statRow(counts).map((s) => html`<a class="stat" href="#/jobs?status=${s.key}"><span class="mono text-muted">${s.key}</span><strong>${s.n}</strong></a>`)}
          </div>
        </section>

        <a class="bento-tile bento-count" href="#/jobs?status=open" aria-label="${counts.open} open to apply">
          <span class="mono">open to apply</span>
          <span class="count-bottom">
            <span class="hero-num${counts.open > 99 ? ' small' : ''}">${counts.open}</span>
            <span class="count-dot" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg></span>
          </span>
        </a>

        <section class="bento-tile bento-list">
          <div class="tile-head"><h2>Open to apply</h2>${counts.open > open.length ? html`<a class="link text-sm" href="#/jobs?status=open">See all</a>` : ''}</div>
          <p class="text-muted text-sm tile-note">Closing soonest first, then newest found</p>
          <div class="rows">${openRows}</div>
        </section>

        <section class="bento-tile bento-list">
          <div class="tile-head"><h2>Applied</h2><a class="link text-sm" href="#/jobs">See all jobs</a></div>
          <p class="text-muted text-sm tile-note">Newest application first</p>
          <div class="rows">${appliedRows}</div>
        </section>
      </div>
    </div>`;
}
