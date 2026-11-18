import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { statusWord } from '../lib/status.js';
import { formatDay, initials, todayISO } from '../lib/format.js';
import { nextUp, statRow, whenText, sinceStart, who } from '../lib/dash.js';
import { setTopAction } from '../lib/shell.js';

const jobLink = (id) => `#/jobs/${id}`;
const DOT_ROWS = 5;

// Small 24px icons for the stat cards (same stroke style as the top navigation).
const STAT_ICONS = {
  applied: raw('<svg viewBox="0 0 24 24"><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/></svg>'),
  reply: raw('<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1.1-4.4A8 8 0 1 1 21 12z"/></svg>'),
  interview: raw('<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c2 .6 3.2 2.3 3.5 5.2"/></svg>'),
  offer: raw('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/></svg>'),
};

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
const SINCE_ICON = raw('<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 17v-5M9.5 14.5L12 12l2.5 2.5"/></svg>');
const BOX = 12;
const GAP = 4;
const GRID_COLS = 12, GRID_ROWS = 7, GRID_BOX = 14, GRID_GAP = 4;
const dayNum = (iso) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
// A fixed grid: the last 48 days, oldest top-left, today bottom-right. A box is lit when you applied that day.
function dayGrid(days, today) {
  const n = GRID_COLS * GRID_ROWS;
  const end = dayNum(today);
  const counts = new Array(n).fill(0);
  for (const d of days || []) {
    const k = n - 1 - (end - dayNum(d.date));
    if (k >= 0 && k < n) counts[k] += d.count;
  }
  const w = GRID_COLS * (GRID_BOX + GRID_GAP) - GRID_GAP;
  const h = GRID_ROWS * (GRID_BOX + GRID_GAP) - GRID_GAP;
  const rects = counts.map((c, i) => html`<rect class="box${c === 0 ? '' : c === 1 ? ' on' : ' on strong'}" x="${(i % GRID_COLS) * (GRID_BOX + GRID_GAP)}" y="${Math.floor(i / GRID_COLS) * (GRID_BOX + GRID_GAP)}" width="${GRID_BOX}" height="${GRID_BOX}" rx="3"/>`);
  const total = counts.reduce((a, c) => a + c, 0);
  return html`<svg class="box-chart" role="img" aria-label="Applications in the last 12 weeks: ${total}" viewBox="0 0 ${w} ${h}" style="width:100%">${rects}</svg>`;
}

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
  const addJob = html`<a class="btn btn-add" href="#/jobs/new"><span class="add-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span>Add job</a>`;
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
  const jobId = Number((/#\/jobs\/(\d+)$/.exec(up.href || '') || [])[1]) || null;
  const nextJob = jobId ? [...(data.open || []), ...(data.applied || [])].find((j) => j.id === jobId) : null;
  const nextChips = nextJob ? [nextJob.location, nextJob.job_type, nextJob.status === 'open' ? (nextJob.closes_on ? `closes ${formatDay(nextJob.closes_on, today)}` : 'no closing date') : ''].filter(Boolean) : [];
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
          <span class="stat-head"><span class="stat-icon since-icon" aria-hidden="true">${SINCE_ICON}</span><span class="mono since-label">${since.label}</span></span>
          <div class="since-chart">${dayGrid(data.applied_days, today)}<p class="mono since-legend">last 12 weeks · 1 box = 1 day</p></div>
        </section>

        <section class="bento-tile bento-next">
          <div class="next-top"><span class="mono text-muted">${up.label}</span>${nextChips.length ? html`<span class="next-chips">${nextChips.map((c) => html`<span class="tag">${c}</span>`)}</span>` : ''}</div>
          <h2 class="sentence${up.sentence.length > 56 ? ' long' : ''}">${up.href ? html`<a href="${up.href}">${sentence}</a>` : sentence}</h2>
          <div class="next-foot"><p class="text-muted next-line">${up.line}</p>${up.href ? html`<a class="btn-open" href="${up.href}">Open job<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a>` : ''}</div>
        </section>

        <div class="bento-stats" role="group" aria-label="Application stages">
          ${statRow(counts).map((s, i, all, den = s.key === 'applied' ? (Number.isFinite(counts.total) ? counts.total : s.n + counts.open) : (all.find((x) => x.key === 'applied') || s).n, p = den ? Math.min(100, Math.round(s.n / den * 100)) : 0) => html`<a class="bento-tile stat-card${!s.n ? ' is-zero' : ''}${s.key === 'offer' && s.n > 0 ? ' is-offer' : ''}" href="#/jobs?status=${s.key}"><span class="stat-head"><span class="stat-icon" aria-hidden="true">${STAT_ICONS[s.key] || ''}</span><span class="mono text-muted">${s.key}</span><span class="stat-of mono text-muted">${s.n} of ${den}</span></span><strong>${s.n}</strong><span class="stat-bar" style="--p:${p}%"><i></i></span></a>`)}
        </div>

        <a class="bento-tile bento-count" href="#/jobs?status=open" aria-label="${counts.open} open to apply">
          <span class="mono">open to apply</span>
          <span class="count-bottom">
            <span class="hero-num${counts.open > 99 ? ' small' : ''}">${counts.open}</span>
            <span class="count-dot" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg></span>
          </span>
        </a>

        <section class="bento-tile bento-lists">
          <div class="list-col">
          <div class="tile-head"><h2>Open to apply</h2>${counts.open > open.length ? html`<a class="link text-sm" href="#/jobs?status=open">See all</a>` : ''}</div>
          <p class="text-muted text-sm tile-note">Closing soonest first, then newest found</p>
          <div class="rows">${openRows}</div>
          </div>
          <div class="list-col">
          <div class="tile-head"><h2>Applied</h2><a class="link text-sm" href="#/jobs">See all jobs</a></div>
          <p class="text-muted text-sm tile-note">Newest application first</p>
          <div class="rows">${appliedRows}</div>
          </div>
        </section>
      </div>
    </div>`;
}
