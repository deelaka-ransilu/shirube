// Found: jobs read from ITPro's feeds. Refresh fetches (the server asks ITPro at most every
// 30 minutes). Search and the filters only look at jobs already stored, so they are instant.
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatDay, initials, todayISO, closingText } from '../lib/format.js';

const WORK_MODES = [['any', 'Any'], ['onsite', 'On-site'], ['hybrid', 'Hybrid'], ['remote', 'Remote']];
const MODE_LABEL = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
const POSTED = [['today', 'Today'], ['3d', '3 days'], ['week', 'Week'], ['any', 'Any']];

// Kept while the app stays open, so coming back to Found finds the same filters.
const state = { q: '', posted: '3d', mode: 'any', showHidden: false, selectedId: null, linkOpen: false, linkValue: '', linkError: '' };

// The "New" marker moves when the person leaves Found, not while they are on it.
let stopWatching = () => {};
function watchLeaving() {
  stopWatching();
  const onChange = () => {
    if (location.hash.startsWith('#/found')) return;
    stopWatching();
    api('/api/found/left', { method: 'POST' }).catch(() => {});
  };
  window.addEventListener('hashchange', onChange);
  stopWatching = () => { window.removeEventListener('hashchange', onChange); stopWatching = () => {}; };
}

const itproLink = (url) => (/^https:\/\/itpro\.lk\//.test(url) ? url : '');

function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDay(todayISO(d))}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ago = (min) => (min < 1 ? 'just now' : `${min} min ago`);

function chipGroup(label, attr, options, current) {
  return html`
    <div class="found-group" role="group" aria-label="${label}">
      <span class="label">${label}</span>
      <div class="chip-group">
        ${options.map(([value, text]) => html`<button type="button" class="chip" data-${attr}="${value}" aria-pressed="${value === current}">${text}</button>`)}
      </div>
    </div>`;
}

export async function render(el, { stale }) {
  watchLeaving();
  let data = null;
  let detail = null;
  let status = '';
  let detailMsg = '';
  let busy = false;
  let seq = 0;
  let detailSeq = 0;
  let timer;

  async function load() {
    const mine = ++seq;
    const p = new URLSearchParams({ posted: state.posted, work_mode: state.mode });
    if (state.q.trim()) p.set('q', state.q.trim());
    if (state.showHidden) p.set('hidden', '1');
    const d = await api('/api/found?' + p);
    if (mine !== seq) return false;
    data = d;
    if (!d.jobs.some((j) => j.id === state.selectedId)) state.selectedId = d.jobs[0]?.id ?? null;
    return true;
  }

  async function loadDetail() {
    const mine = ++detailSeq;
    if (state.selectedId === null) { detail = null; return true; }
    const r = await api(`/api/found/${state.selectedId}`);
    if (mine !== detailSeq) return false;
    detail = r.job;
    return true;
  }

  // ---- drawing ----

  function filtersHtml() {
    const cats = data.categories;
    return html`
      <div class="found-group" role="group" aria-label="Sites to search">
        <span class="label">Sites to search</span>
        <div class="chip-group">
          <button type="button" class="chip" aria-pressed="true" disabled title="ITPro is always read">ITPro</button>
          <button type="button" class="chip" disabled title="Not yet">TopJobs (later)</button>
          <button type="button" class="chip" disabled title="Not yet">LinkedIn (later)</button>
          <button type="button" class="chip" data-paste aria-expanded="${state.linkOpen}">+ Paste a job link</button>
        </div>
      </div>
      ${chipGroup('Work mode', 'mode', WORK_MODES, state.mode)}
      ${chipGroup('Posted', 'posted', POSTED, state.posted)}
      ${state.linkOpen ? html`
        <form class="found-link inner-box" id="found-link-form" novalidate>
          <label class="label" for="found-link">Job link</label>
          <div class="found-search">
            <input class="input" id="found-link" name="link" type="url" autocomplete="off" placeholder="https://..." value="${state.linkValue}">
            <button class="btn btn-secondary" type="submit">Open in Add job</button>
          </div>
          ${state.linkError ? html`<p class="field-error" role="alert">◇ ${state.linkError}</p>` : ''}
        </form>` : ''}
      <div class="found-group found-cats" role="group" aria-label="Categories to follow">
        <span class="label">Categories to follow (used on the next Refresh; all jobs are always read)</span>
        <div class="chip-group">
          ${data.available_categories.map((c) => html`<button type="button" class="chip" data-cat="${c.slug}" aria-pressed="${cats.includes(c.slug)}">${c.label}</button>`)}
        </div>
      </div>`;
  }

  function rowHtml(j) {
    return html`
      <button type="button" class="found-row" data-id="${j.id}" aria-current="${j.id === state.selectedId}">
        <span class="avatar" aria-hidden="true">${initials(j.company || j.title)}</span>
        <span class="found-row-main">
          <b>${j.title}</b>
          <small class="text-muted">${[j.company, j.location].filter(Boolean).join(' · ')}${j.job_id ? ' · ✓ Saved' : ''}</small>
        </span>
        <span class="found-row-right">
          ${j.is_new ? html`<span class="tag tag-new">New</span>` : ''}
          <span class="text-sm text-muted">ITPro · ${formatDay(j.published_on, data.today)}</span>
        </span>
      </button>`;
  }

  function detailHtml() {
    if (!detail) return html`<div class="card compact found-detail" id="found-detail-card"><p class="text-muted">Pick a job on the left to read it here.</p></div>`;
    const j = detail;
    const link = itproLink(j.url);
    return html`
      <article class="card compact found-detail" id="found-detail-card" aria-label="${j.title}">
        <div class="row">
          <div class="avatar big" aria-hidden="true">${initials(j.company || j.title)}</div>
          <div class="row-main">
            <h2>${j.title}</h2>
            <div>${[j.company, j.location].filter(Boolean).join(' · ')}</div>
          </div>
          <span class="tag">ITPro</span>
        </div>
        <div class="dl found-facts">
          <div><b>Posted</b>${formatDay(j.published_on, data.today)}</div>
          <div><b>Job type</b>${j.job_type || 'Not stated'}</div>
          <div><b>Location</b>${j.location || 'Not stated'}</div>
          <div><b>Work mode</b>${MODE_LABEL[j.work_mode] ?? 'Not stated'}</div>
          ${j.closes_on ? html`<div><b>Closes</b>${closingText(j.closes_on, data.today).replace(/^Closes /, '')}</div>` : ''}
        </div>
        <div class="found-actions">
          ${j.job_id
            ? html`<a class="btn btn-secondary" href="#/jobs/${j.job_id}">✓ Saved · Open job</a>`
            : html`<button type="button" class="btn btn-primary" data-save="${j.id}">Save to Jobs</button>`}
          ${link ? html`<a class="btn btn-secondary" href="${link}" target="_blank" rel="noopener noreferrer">Open original page</a>` : ''}
          <button type="button" class="btn btn-secondary" data-hide="${j.id}" data-to="${j.hidden ? 0 : 1}">${j.hidden ? 'Unhide' : 'Hide'}</button>
        </div>
        <p class="text-sm found-msg" role="status">${detailMsg}</p>
        <h3 class="found-about">About the job</h3>
        <div class="found-advert">${j.description || 'The advert has no text. Open the original page.'}</div>
      </article>`;
  }

  function resultsHtml() {
    const { jobs, new_count, hidden_count, stored_count, last_fetch_at } = data;
    const n = jobs.length;
    const hiddenLink = state.showHidden
      ? html`<button type="button" class="link-btn" data-toggle-hidden>← Back to jobs</button>`
      : hidden_count ? html`<button type="button" class="link-btn" data-toggle-hidden>Show hidden (${hidden_count})</button>` : '';

    if (!n) {
      let box;
      if (state.showHidden) box = html`<h2>No hidden jobs</h2><p class="text-muted">Jobs you hide show up here.</p>`;
      else if (!stored_count) box = html`<h2>Nothing here yet</h2><p class="text-muted">Press Refresh to read the latest jobs from ITPro.</p>`;
      else box = html`<h2>No jobs match</h2><p class="text-muted">Try Any under Posted, or clear the search words.</p>`;
      return html`<div class="card empty">${box}${hiddenLink}</div>`;
    }
    return html`
      <div class="found-layout">
        <section class="card compact found-list" aria-label="Jobs found">
          <div class="found-top">
            <div><b>${state.showHidden ? `${n} hidden` : `${n} job${n === 1 ? '' : 's'} found`}</b>
              <span class="text-muted text-sm"> · Newest first${new_count ? ` · ${new_count} new` : ''}${last_fetch_at ? ` · updated ${stamp(last_fetch_at)}` : ''}</span></div>
            ${hiddenLink}
          </div>
          <div id="found-list">${jobs.map(rowHtml)}</div>
        </section>
        <div id="found-detail">${detailHtml()}</div>
      </div>`;
  }

  const $ = (sel) => el.querySelector(sel);
  function drawFilters() { $('#found-filters').innerHTML = filtersHtml(); }
  function drawStatus() { $('#found-status').textContent = status; }
  function drawDetail() { $('#found-detail').innerHTML = detailHtml(); }
  function drawResults() { $('#found-results').innerHTML = resultsHtml(); }

  // Redraw after the data changed. focus: what to focus afterwards, so keyboard use keeps its place.
  async function reload(focus = '') {
    try {
      if (await load()) await loadDetail();
    } catch (err) {
      status = err.message;
    }
    if (stale()) return;
    drawStatus(); drawFilters(); drawResults();
    if (focus) $(focus)?.focus();
  }

  async function selectRow(id) {
    if (id === state.selectedId) return;
    state.selectedId = id;
    detailMsg = '';
    el.querySelectorAll('.found-row').forEach((r) => r.setAttribute('aria-current', String(Number(r.dataset.id) === id)));
    try { await loadDetail(); } catch (err) { detail = null; detailMsg = err.message; }
    if (!stale() && $('#found-detail')) drawDetail();
  }

  // ---- actions ----

  async function refresh() {
    if (busy) return;
    busy = true;
    const button = $('#found-refresh');
    button.disabled = true;
    button.textContent = 'Refreshing…';
    status = 'Reading the ITPro feeds…';
    drawStatus();
    try {
      const r = await api('/api/found/refresh', { method: 'POST' });
      if (r.error) status = r.error;
      else if (!r.fetched) status = `Updated ${ago(r.minutes_ago)}. ITPro is asked at most every 30 minutes, so this is the saved list.`;
      else {
        status = `Updated just now. ${r.added ? `${r.added} new job${r.added === 1 ? '' : 's'}.` : 'Nothing new.'}`;
        if (r.failed) status += ` ${r.failed} of ${r.feeds} feeds could not be read.`;
      }
    } catch (err) {
      status = err.message;
    }
    busy = false;
    if (stale()) return;
    button.disabled = false;
    button.textContent = 'Refresh';
    await reload();
    $('#found-refresh')?.focus();
  }

  async function save(id) {
    try {
      const r = await api(`/api/found/${id}/save`, { method: 'POST' });
      detailMsg = r.already ? 'Already in Jobs, so nothing was added again.' : 'Saved to Jobs.';
    } catch (err) {
      detailMsg = err.message;
    }
    await reload('.found-actions .btn');
  }

  async function hide(id, to) {
    const list = data.jobs;
    const at = list.findIndex((j) => j.id === id);
    try {
      await api(`/api/found/${id}`, { method: 'PATCH', body: { hidden: to === 1 } });
      status = to === 1 ? 'Hidden. “Show hidden” brings it back.' : 'Unhidden.';
      detailMsg = '';
      state.selectedId = list[at + 1]?.id ?? list[at - 1]?.id ?? null;
    } catch (err) {
      detailMsg = err.message;
    }
    await reload('.found-row[aria-current="true"]');
    if (!stale() && state.showHidden && data.hidden_count === 0) {
      state.showHidden = false;
      await reload();
    }
  }

  async function toggleCategory(slug) {
    const cats = data.categories;
    const next = cats.includes(slug) ? cats.filter((c) => c !== slug) : [...cats, slug];
    data.categories = next;
    drawFilters();
    try {
      data.categories = (await api('/api/found/settings', { method: 'PATCH', body: { categories: next } })).categories;
    } catch (err) {
      data.categories = cats;
      status = err.message;
      drawStatus();
    }
    if (!stale()) { drawFilters(); $(`[data-cat="${slug}"]`)?.focus(); }
  }

  // ---- first load, then the page ----

  try {
    await load();
    await loadDetail();
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`<div class="card"><h2>Could not load Found</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;

  el.innerHTML = html`
    <div class="page-head">
      <div>
        <h1>Found</h1>
        <p class="text-muted">Search job sites and bring the details here.</p>
      </div>
    </div>
    <section class="card compact found-controls" aria-label="Search and filters">
      <div class="found-search">
        <div>
          <label class="label" for="found-q">Search the jobs saved here</label>
          <input class="input" id="found-q" type="search" autocomplete="off" placeholder="Search by title, skill or company, e.g. DevOps Colombo" value="${state.q}">
        </div>
        <button type="button" class="btn btn-secondary" id="found-refresh">Refresh</button>
      </div>
      <p class="text-sm found-status" id="found-status" role="status"></p>
      <div class="found-filters" id="found-filters"></div>
    </section>
    <div id="found-results"></div>`;
  drawStatus(); drawFilters(); drawResults();

  el.onclick = (e) => {
    const t = e.target.closest('button, .found-row');
    if (!t || t.disabled) return;
    if (t.id === 'found-refresh') refresh();
    else if (t.dataset.id !== undefined && t.classList.contains('found-row')) selectRow(Number(t.dataset.id));
    else if (t.dataset.posted !== undefined) { state.posted = t.dataset.posted; reload(`[data-posted="${state.posted}"]`); }
    else if (t.dataset.mode !== undefined) { state.mode = t.dataset.mode; reload(`[data-mode="${state.mode}"]`); }
    else if (t.dataset.cat !== undefined) toggleCategory(t.dataset.cat);
    else if (t.dataset.paste !== undefined) { state.linkOpen = !state.linkOpen; state.linkError = ''; drawFilters(); if (state.linkOpen) $('#found-link')?.focus(); else $('[data-paste]')?.focus(); }
    else if (t.dataset.save !== undefined) { t.disabled = true; save(Number(t.dataset.save)); }
    else if (t.dataset.hide !== undefined) { t.disabled = true; hide(Number(t.dataset.hide), Number(t.dataset.to)); }
    else if (t.dataset.toggleHidden !== undefined) { state.showHidden = !state.showHidden; state.selectedId = null; reload(); }
  };

  el.oninput = (e) => {
    if (e.target.id === 'found-q') {
      state.q = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => reload(), 150);
    } else if (e.target.id === 'found-link') {
      state.linkValue = e.target.value;
    }
  };

  // "+ Paste a job link" only opens Add job with the link filled in. Nothing is fetched.
  el.onsubmit = (e) => {
    if (e.target.id !== 'found-link-form') return;
    e.preventDefault();
    const link = state.linkValue.trim();
    let ok = false;
    try { ok = ['http:', 'https:'].includes(new URL(link).protocol); } catch { /* not a link */ }
    if (!ok) {
      state.linkError = 'The link must start with http:// or https://';
      drawFilters();
      $('#found-link')?.focus();
      return;
    }
    state.linkOpen = false; state.linkValue = ''; state.linkError = '';
    location.hash = '#/jobs/new?url=' + encodeURIComponent(link);
  };
}
