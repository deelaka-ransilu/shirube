import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { STATUS, STATUS_KEYS, hasStatus, statusText } from '../lib/status.js';
import { closingText, formatDay, initials } from '../lib/format.js';

const TILES = ['open', 'applied', 'interview', 'offer'];

function jobsHash(status, q) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (q) p.set('q', q);
  const text = p.toString();
  return '#/jobs' + (text ? '?' + text : '');
}

function row(job) {
  const name = job.company || job.title;
  return html`
    <div class="list-row">
      <div class="avatar" aria-hidden="true">${initials(name)}</div>
      <div class="row-main">
        ${job.company ? html`<div class="text-muted">${job.company}</div>` : ''}
        <a class="row-title" href="#/jobs/${job.id}">${job.title}</a>
      </div>
      <span class="tag">${statusText(job.status)}</span>
      <span class="text-muted">${closingText(job.closes_on)}</span>
      <button type="button" class="btn btn-danger" data-delete="${job.id}" data-title="${job.title}" aria-label="Delete ${job.title}">Delete</button>
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
  const chips = [['', 'All'], ...STATUS_KEYS.map((k) => [k, STATUS[k].label])];

  let list;
  if (counts.all === 0) {
    list = html`<div class="empty"><h2>No jobs yet</h2><p class="text-muted">Add the first job you want to track.</p><a class="btn btn-secondary" href="#/jobs/new">Add a job</a></div>`;
  } else if (jobs.length === 0) {
    list = html`<div class="empty"><h2>Nothing matches</h2><p class="text-muted">Try another filter or search word.</p><a class="btn btn-secondary" href="#/jobs">Show all jobs</a></div>`;
  } else {
    list = jobs.map(row);
  }

  el.innerHTML = html`
    <div class="page-head">
      <div>
        <h1>Jobs</h1>
        <p class="text-muted">Track every application from finding the role to the final outcome.</p>
      </div>
      <a class="btn btn-primary" href="#/jobs/new">+ Add job</a>
    </div>

    <div class="grid-tiles tiles">
      ${TILES.map((k) => html`<div class="tile"><span>${statusText(k)}</span><strong>${counts[k]}</strong></div>`)}
    </div>

    <div class="chip-group filters" role="group" aria-label="Filter jobs by stage">
      ${chips.map(([key, label]) => html`<button type="button" class="chip" data-status="${key}" aria-pressed="${key === status}">${label} (${key ? counts[key] : counts.all})</button>`)}
    </div>
    ${q ? html`<p class="text-muted">Results for “${q}”. <a class="link" href="${jobsHash(status, '')}">Clear search</a></p>` : ''}

    <div class="grid-main-side jobs-layout">
      <div class="card">${list}</div>
      <div class="side-stack">
        <div class="card">
          <h2>Next closing</h2>
          ${next_closing
            ? html`<div><a class="row-title" href="#/jobs/${next_closing.id}">${next_closing.title}</a></div><div class="text-muted">${next_closing.company ? next_closing.company + ' · ' : ''}${formatDay(next_closing.closes_on)}</div>`
            : html`<p class="text-muted">No closing dates yet for jobs you have not applied to.</p>`}
        </div>
      </div>
    </div>`;

  el.onclick = async (e) => {
    const chip = e.target.closest('[data-status]');
    if (chip) { location.hash = jobsHash(chip.dataset.status, q); return; }

    const del = e.target.closest('[data-delete]');
    if (del) {
      if (!confirm(`Delete “${del.dataset.title}”? This cannot be undone.`)) return;
      del.disabled = true;
      try {
        await api(`/api/jobs/${del.dataset.delete}`, { method: 'DELETE' });
      } catch (err) {
        alert(err.message);
      }
      if (!stale()) render(el, ctx);
    }
  };
}
