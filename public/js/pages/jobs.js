import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { STATUS, STATUS_KEYS, hasStatus, badgeText } from '../lib/status.js';
import { formatDay, initials, todayISO } from '../lib/format.js';
import { MODE_LABEL } from '../lib/found-marker.js';
import { ICON } from '../lib/icons.js';
import { closeBadge } from '../lib/badges.js';
import { bindScroll } from '../lib/scroll.js';
import { setTopAction } from '../lib/shell.js';

const TILES = ['open', 'applied', 'interview', 'offer'];

// A calm look: only the two stages worth noticing get a colour. Every status also keeps its shape and word.
const TINT = { interview: 'lilac', offer: 'yellow' };
const tintAttr = (key) => (TINT[key] ? raw(`data-tint="${TINT[key]}"`) : '');

function jobsHash(status, q) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (q) p.set('q', q);
  const text = p.toString();
  return '#/jobs' + (text ? '?' + text : '');
}

function row(job, today) {
  const name = job.company || job.title;
  return html`
    <div class="list-row row-click">
      <div class="avatar" aria-hidden="true">${initials(name)}</div>
      <div class="row-main">
        ${job.company ? html`<div class="text-muted">${job.company}</div>` : ''}
        <a class="row-title" href="#/jobs/${job.id}">${job.title}</a>
      </div>
      <div class="row-badges">
        <span class="badge b-${job.status}">${badgeText(job.status)}</span>
        ${MODE_LABEL[job.work_mode] ? html`<span class="badge b-mode">${MODE_LABEL[job.work_mode]}</span>` : ''}
        ${closeBadge(job.closes_on, today)}
      </div>
      <button type="button" class="btn btn-danger icon-btn" data-delete="${job.id}" data-title="${job.title}" aria-label="Delete ${job.title}" title="Delete">${ICON.trash}</button>
    </div>`;
}

export async function render(el, ctx) {
  const { query, stale } = ctx;
  const status = hasStatus(query.status) ? query.status : '';
  const q = String(query.q ?? '').trim();

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);

  let data;
  try {
    data = await api('/api/jobs' + (params.size ? '?' + params : ''));
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`<div class="card"><h2>Could not load your jobs</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;

  const { jobs, counts, next_closing } = data;
  const today = todayISO();
  const chips = [['', 'All'], ...STATUS_KEYS.map((k) => [k, STATUS[k].label])];

  let list;
  if (counts.all === 0) {
    list = html`<div class="empty"><h2>No jobs yet</h2><p class="text-muted">Add the first job you want to track.</p><a class="btn btn-secondary" href="#/jobs/new">Add a job</a></div>`;
  } else if (jobs.length === 0) {
    list = html`<div class="empty"><h2>Nothing matches</h2><p class="text-muted">Try another filter or search word.</p><a class="btn btn-secondary" href="#/jobs">Show all jobs</a></div>`;
  } else {
    list = html`
      <div class="scroll-wrap jobs-list-wrap">
        <div class="scroller" tabindex="0" role="region" aria-label="Your jobs">${jobs.map((j) => row(j, today))}</div>
        <div class="scroll-fade" aria-hidden="true"></div>
        <button type="button" class="more-pill" data-more hidden aria-label="Show more jobs"></button>
      </div>`;
  }

  el.innerHTML = html`
    <div class="jobs-page">
      <h1 class="sr-only">Jobs</h1>

      <div class="grid-tiles tiles sm">
        ${TILES.map((k) => html`<div class="tile"><span>${STATUS[k].label}</span><strong>${counts[k]}</strong></div>`)}
      </div>

      <div class="chip-group filters" role="group" aria-label="Filter jobs by stage">
        ${chips.map(([key, label]) => html`<button type="button" class="chip sm" ${tintAttr(key)} data-status="${key}" aria-pressed="${key === status}">${label} (${key ? counts[key] : counts.all})</button>`)}
      </div>
      ${q ? html`<p class="text-muted jobs-note">Results for “${q}”. <a class="link" href="${jobsHash(status, '')}">Clear search</a></p>` : ''}

      <div class="jobs-layout">
        <div class="card compact jobs-card">${list}</div>
        <div class="side-stack">
          <div class="card compact">
            <h2>Next closing</h2>
            ${next_closing
              ? html`<div><a class="row-title" href="#/jobs/${next_closing.id}">${next_closing.title}</a></div><div class="text-muted">${next_closing.company ? next_closing.company + ' · ' : ''}${formatDay(next_closing.closes_on)}</div>`
              : html`<p class="text-muted">No closing dates yet for jobs you have not applied to.</p>`}
          </div>
        </div>
      </div>
    </div>`;

  setTopAction(html`<a class="btn btn-primary" href="#/jobs/new">+ Add job</a>`);
  bindScroll(el.querySelector('.jobs-list-wrap'), '.list-row');
  if (ctx.keepTop) { const box = el.querySelector('.jobs-list-wrap .scroller'); if (box) box.scrollTop = ctx.keepTop; }

  el.onclick = async (e) => {
    const chip = e.target.closest('[data-status]');
    if (chip) { location.hash = jobsHash(chip.dataset.status, q); return; }

    if (e.target.closest('[data-more]')) {
      const box = el.querySelector('.jobs-list-wrap .scroller');
      box?.scrollBy({ top: box.clientHeight * 0.8, behavior: 'smooth' });
      return;
    }

    const del = e.target.closest('[data-delete]');
    if (del) {
      if (!confirm(`Delete “${del.dataset.title}”? This cannot be undone.`)) return;
      del.disabled = true;
      try {
        await api(`/api/jobs/${del.dataset.delete}`, { method: 'DELETE' });
      } catch (err) {
        alert(err.message);
      }
      // Draw again but stay where the person was in the list.
      const keepTop = el.querySelector('.jobs-list-wrap .scroller')?.scrollTop ?? 0;
      if (!stale()) render(el, { ...ctx, keepTop });
    }
  };
}
