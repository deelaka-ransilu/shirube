// Found: jobs read from ITPro's feeds. Refresh fetches (the server asks ITPro at most every
// 30 minutes). Search and the filters only look at jobs already stored, so they are instant.
import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatDay, initials, todayISO, closingText } from '../lib/format.js';
import { watchLeavingFound, suggestName } from '../lib/found-marker.js';

const WORK_MODES = [['any', 'Any'], ['onsite', 'On-site'], ['hybrid', 'Hybrid'], ['remote', 'Remote']];
const MODE_LABEL = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
const POSTED = [['today', 'Today'], ['3d', '3 days'], ['week', 'Week'], ['any', 'Any']];

// Kept while the app stays open, so coming back to Found finds the same filters.
const state = { since: '', catsOpen: false, saveOpen: false, saveName: '', saveError: '', q: '', posted: '3d', mode: 'any', showHidden: false, selectedId: null, linkOpen: false, linkValue: '', linkError: '' };

const itproLink = (url) => (/^https:\/\/itpro\.lk\//.test(url) ? url : '');

function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDay(todayISO(d))}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ago = (min) => (min < 1 ? 'just now' : `${min} min ago`);

const icon = (paths) => raw(`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`);
const ICON = {
  save: icon('<path d="M6 4h12v17l-6-4-6 4z"/>'),
  saved: icon('<path d="M5 12l5 5 9-10"/>'),
  open: icon('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>'),
  hide: icon('<path d="M3 3l18 18M10.6 6.2A9 9 0 0121 12a13 13 0 01-3.2 3.9M6.4 7.7A13 13 0 003 12s3.5 6 9 6a9 9 0 003.4-.7M9.9 9.9a3 3 0 004.2 4.2"/>'),
  unhide: icon('<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="3"/>'),
};

// A scroll box with no scrollbar: a soft fade (and for the list a "N more" pill) says there is more below.
function bindScroll(wrap) {
  const box = wrap?.querySelector('.scroller');
  if (!box) return;
  const pill = wrap.querySelector('.more-pill');
  const update = () => {
    const more = box.scrollHeight - box.scrollTop - box.clientHeight > 4;
    wrap.classList.toggle('has-more', more);
    if (!pill) return;
    let n = 0;
    if (more) for (const row of box.querySelectorAll('.found-row')) if (row.offsetTop - box.scrollTop >= box.clientHeight - 8) n++;
    pill.hidden = !more || n === 0;
    pill.textContent = `▾ ${n} more`;
  };
  box.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(box);
  update();
}

function chipGroup(label, attr, options, current, tint) {
  return html`
    <div class="found-group" role="group" aria-label="${label}" data-tint="${tint}">
      <span class="label">${label}</span>
      <div class="chip-group">
        ${options.map(([value, text]) => html`<button type="button" class="chip sm" data-${attr}="${value}" aria-pressed="${value === current}">${text}</button>`)}
      </div>
    </div>`;
}

export async function render(el, { stale, query = {} }) {
  watchLeavingFound();
  let saved = [];
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
    const p = new URLSearchParams({ work_mode: state.mode });
    if (state.posted === 'date' && state.since) p.set('since', state.since);
    else p.set('posted', state.posted === 'date' ? '3d' : state.posted);
    if (state.q.trim()) p.set('q', state.q.trim());
    if (state.showHidden) p.set('hidden', '1');
    const [d, s] = await Promise.all([api('/api/found?' + p), api('/api/saved-searches')]);
    if (mine !== seq) return false;
    data = d;
    saved = s.searches;
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
    const dateLabel = state.posted === 'date' && state.since ? `From ${formatDay(state.since, data.today)}` : 'Pick a date';
    return html`
      <div class="found-grid">
        <div class="found-left">
          <div class="found-group" role="group" aria-label="Sites to search" data-tint="blue">
            <span class="label">Sites</span>
            <div class="chip-group">
              <button type="button" class="chip sm" aria-pressed="true" disabled title="ITPro is always read">ITPro</button>
              <button type="button" class="chip sm" disabled title="Not yet">TopJobs (later)</button>
              <button type="button" class="chip sm" disabled title="Not yet">LinkedIn (later)</button>
              <button type="button" class="chip sm" data-paste aria-expanded="${state.linkOpen}">+ Paste a job link</button>
            </div>
          </div>
          <div class="found-group" role="group" aria-label="Posted" data-tint="yellow">
            <span class="label">Posted</span>
            <div class="chip-group">
              ${POSTED.map(([value, text]) => html`<button type="button" class="chip sm" data-posted="${value}" aria-pressed="${value === state.posted}">${text}</button>`)}
              <span class="found-date">
                <button type="button" class="chip sm" data-date aria-pressed="${state.posted === 'date'}" aria-label="Pick a date: jobs from that day until today">${dateLabel} ▾</button>
                <input type="date" id="found-date" class="found-date-input" tabindex="-1" aria-hidden="true" value="${state.since}">
              </span>
            </div>
          </div>
        </div>
        <div class="found-right">
          ${chipGroup('Work mode', 'mode', WORK_MODES, state.mode, 'peach')}
          <div class="found-group" data-tint="green">
            <button type="button" class="chip sm" data-cats-toggle aria-expanded="${state.catsOpen}">Categories (${cats.length}) ${state.catsOpen ? '▴' : '▾'}</button>
            <a class="chip sm found-manage" href="#/saved"><span aria-hidden="true">＋</span> Manage saved searches</a>
          </div>
        </div>
      </div>
      ${state.linkOpen ? html`
        <form class="found-link inner-box" id="found-link-form" novalidate>
          <label class="label" for="found-link">Job link</label>
          <div class="found-search">
            <input class="input" id="found-link" name="link" type="url" autocomplete="off" placeholder="https://..." value="${state.linkValue}">
            <button class="btn btn-secondary" type="submit">Open in Add job</button>
          </div>
          ${state.linkError ? html`<p class="field-error" role="alert">◇ ${state.linkError}</p>` : ''}
        </form>` : ''}
      ${state.catsOpen ? html`
        <div class="found-group found-cats" role="group" aria-label="Categories to follow" data-tint="green">
          <span class="label">Categories to follow (used on the next Refresh; all jobs are always read)</span>
          <div class="chip-group">
            ${data.available_categories.map((c) => html`<button type="button" class="chip sm" data-cat="${c.slug}" aria-pressed="${cats.includes(c.slug)}">${c.label}</button>`)}
          </div>
        </div>` : ''}`;
  }

  const sameSearch = (x) => x.q.toLowerCase() === state.q.trim().replace(/\s+/g, ' ').toLowerCase() && x.work_mode === state.mode && x.posted === state.posted;

  function savedHtml() {
    const match = saved.find(sameSearch);
    return html`
      <div class="found-saved" role="group" aria-label="Saved searches" data-tint="lilac">
        <span class="label">Saved searches</span>
        ${saved.map((x) => html`<button type="button" class="chip sm" data-saved="${x.id}" aria-pressed="${x === match}">${x.name}${x.new_count ? ` · ● ${x.new_count} new` : ''}</button>`)}
        ${saved.length ? '' : html`<span class="text-sm text-muted">None yet. Search, then press “Save this search”.</span>`}
      </div>`;
  }

  function saveBoxHtml() {
    if (!state.saveOpen) return '';
    return html`
      <form class="found-link inner-box" id="found-save-form" novalidate>
        <label class="label" for="found-save-name">Name for this search</label>
        <div class="found-search">
          <input class="input" id="found-save-name" name="name" maxlength="60" autocomplete="off" value="${state.saveName}">
          <button class="btn btn-secondary" type="submit">Save search</button>
        </div>
        <p class="text-sm text-muted">It keeps the words, work mode and posted filter. You can change it in Manage.</p>
        ${state.saveError ? html`<p class="field-error" role="alert">◇ ${state.saveError}</p>` : ''}
      </form>`;
  }

  function rowHtml(j) {
    return html`
      <button type="button" class="found-row" data-id="${j.id}" aria-current="${j.id === state.selectedId}">
        <span class="avatar" aria-hidden="true">${initials(j.company || j.title)}</span>
        <span class="found-row-main">
          <b>${j.title}</b>
          <small class="text-muted">${[j.company, j.location].filter(Boolean).join(' · ')}</small>
        </span>
        <span class="found-row-right">
          <span class="found-row-badges">
            ${j.is_new ? html`<span class="tag tag-new">New</span>` : ''}
            ${j.job_id ? html`<span class="badge b-saved">✓ Saved</span>` : ''}
            ${MODE_LABEL[j.work_mode] ? html`<span class="badge b-mode">${MODE_LABEL[j.work_mode]}</span>` : ''}
          </span>
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
        <div class="row found-dhead">
          <div class="avatar big" aria-hidden="true">${initials(j.company || j.title)}</div>
          <div class="row-main">
            <h2>${j.title}</h2>
            <div class="text-muted">${j.company}</div>
          </div>
          <div class="found-actions" role="group" aria-label="Job actions">
            ${j.job_id
              ? html`<a class="btn btn-secondary icon-btn" href="#/jobs/${j.job_id}" aria-label="Saved. Open job" title="Saved · Open job">${ICON.saved}</a>`
              : html`<button type="button" class="btn btn-primary icon-btn" data-save="${j.id}" aria-label="Save to Jobs" title="Save to Jobs">${ICON.save}</button>`}
            ${link ? html`<a class="btn btn-secondary icon-btn" href="${link}" target="_blank" rel="noopener noreferrer" aria-label="Open original page" title="Open original page">${ICON.open}</a>` : ''}
            <button type="button" class="btn btn-secondary icon-btn" data-hide="${j.id}" data-to="${j.hidden ? 0 : 1}" aria-label="${j.hidden ? 'Unhide' : 'Hide'}" title="${j.hidden ? 'Unhide' : 'Hide'}">${j.hidden ? ICON.unhide : ICON.hide}</button>
          </div>
        </div>
        <div class="found-badges">
          <span class="badge b-site">ITPro</span>
          <span class="badge b-date">Posted ${formatDay(j.published_on, data.today)}</span>
          ${j.job_type ? html`<span class="badge b-type">${j.job_type}</span>` : ''}
          ${j.location ? html`<span class="badge b-loc">${j.location}</span>` : ''}
          ${MODE_LABEL[j.work_mode] ? html`<span class="badge b-mode">${MODE_LABEL[j.work_mode]}</span>` : html`<span class="badge b-none">Work mode not stated</span>`}
          ${j.closes_on ? html`<span class="badge b-close">${closingText(j.closes_on, data.today)}</span>` : ''}
        </div>
        <p class="text-sm found-msg" role="status">${detailMsg}</p>
        <div class="scroll-wrap found-advert-wrap">
          <div class="found-advert scroller" tabindex="0" role="region" aria-label="About the job">${j.description || 'The advert has no text. Open the original page.'}</div>
          <div class="scroll-fade" aria-hidden="true"></div>
        </div>
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
          <div class="scroll-wrap found-list-wrap">
            <div id="found-list" class="scroller">${jobs.map(rowHtml)}</div>
            <div class="scroll-fade" aria-hidden="true"></div>
            <button type="button" class="more-pill" data-more hidden aria-label="Show more jobs"></button>
          </div>
        </section>
        <div id="found-detail">${detailHtml()}</div>
      </div>`;
  }

  const $ = (sel) => el.querySelector(sel);
  function drawFilters() { $('#found-filters').innerHTML = filtersHtml(); drawSaved(); }
  function drawSaved() {
    $('#found-saved').innerHTML = savedHtml();
    const match = saved.find(sameSearch);
    const star = $('#found-star');
    star.textContent = match ? '★' : '☆';
    star.title = match ? 'Already saved' : 'Save this search';
    star.setAttribute('aria-label', match ? 'This search is saved' : 'Save this search');
    star.disabled = !!match;
    $('#found-savebox').innerHTML = saveBoxHtml();
  }
  function drawStatus() { $('#found-status').textContent = status; }
  function drawDetail() { $('#found-detail').innerHTML = detailHtml(); bindScroll($('.found-advert-wrap')); }
  function drawResults(keepTop = null) {
    $('#found-results').innerHTML = resultsHtml();
    const box = $('#found-list');
    if (box && keepTop !== null) box.scrollTop = keepTop;
    bindScroll($('.found-list-wrap'));
    bindScroll($('.found-advert-wrap'));
  }

  // Redraw after the data changed. focus: what to focus afterwards, so keyboard use keeps its place.
  async function reload(focus = '', keepScroll = false) {
    const top = keepScroll ? $('#found-list')?.scrollTop ?? null : null;
    try {
      if (await load()) await loadDetail();
    } catch (err) {
      status = err.message;
    }
    if (stale()) return;
    drawStatus(); drawFilters(); drawResults(top);
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
    await reload('.found-actions .icon-btn', true);
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
    await reload('.found-row[aria-current="true"]', true);
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
    if (query.saved) {
      const found = (await api('/api/saved-searches')).searches.find((x) => String(x.id) === String(query.saved));
      if (found) { state.q = found.q; state.mode = found.work_mode; state.posted = found.posted; state.selectedId = null; }
    }
    await load();
    await loadDetail();
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`<div class="card"><h2>Could not load Found</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;

  el.innerHTML = html`
    <div class="found-page">
      <div class="page-head found-head">
        <h1>Found</h1>
        <p class="text-muted">Search job sites and bring the details here.</p>
      </div>
      <div id="found-saved"></div>
      <section class="card compact found-controls" aria-label="Search and filters">
        <div class="found-search">
          <div>
            <label class="label" for="found-q">Search the jobs saved here</label>
            <div class="found-inputwrap">
              <input class="input" id="found-q" type="search" autocomplete="off" placeholder="Search by title, skill or company, e.g. DevOps Colombo" value="${state.q}">
              <button type="button" class="star-btn" id="found-star" aria-label="Save this search" title="Save this search">☆</button>
            </div>
          </div>
          <div class="found-buttons">
            <button type="button" class="btn btn-secondary" id="found-refresh">Refresh</button>
          </div>
        </div>
        <div id="found-savebox"></div>
        <p class="text-sm found-status" id="found-status" role="status"></p>
        <div class="found-filters" id="found-filters"></div>
      </section>
      <div id="found-results"></div>
    </div>`;
  drawStatus(); drawFilters(); drawResults();

  el.onclick = (e) => {
    const t = e.target.closest('button, .found-row');
    if (!t || t.disabled) return;
    if (t.dataset.more !== undefined) { const box = t.closest('.scroll-wrap')?.querySelector('.scroller'); box?.scrollBy({ top: box.clientHeight * 0.8, behavior: 'smooth' }); }
    else if (t.id === 'found-refresh') refresh();
    else if (t.id === 'found-star') {
      state.saveOpen = true; state.saveError = ''; state.saveName = suggestName(state.q, state.mode);
      drawSaved(); $('#found-save-name')?.focus(); $('#found-save-name')?.select();
    }
    else if (t.dataset.saved !== undefined) {
      const x = saved.find((v) => v.id === Number(t.dataset.saved));
      if (!x) return;
      state.q = x.q; state.mode = x.work_mode; state.posted = x.posted; state.selectedId = null; state.showHidden = false;
      $('#found-q').value = x.q;
      reload(`[data-saved="${x.id}"]`);
    }
    else if (t.dataset.id !== undefined && t.classList.contains('found-row')) selectRow(Number(t.dataset.id));
    else if (t.dataset.posted !== undefined) { state.posted = t.dataset.posted; reload(`[data-posted="${state.posted}"]`); }
    else if (t.dataset.mode !== undefined) { state.mode = t.dataset.mode; reload(`[data-mode="${state.mode}"]`); }
    else if (t.dataset.cat !== undefined) toggleCategory(t.dataset.cat);
    else if (t.dataset.catsToggle !== undefined) { state.catsOpen = !state.catsOpen; drawFilters(); $('[data-cats-toggle]')?.focus(); }
    else if (t.dataset.date !== undefined) {
      const input = $('#found-date');
      if (!input) return;
      try { input.showPicker(); } catch { input.focus(); input.click(); }
    }
    else if (t.dataset.paste !== undefined) { state.linkOpen = !state.linkOpen; state.linkError = ''; drawFilters(); if (state.linkOpen) $('#found-link')?.focus(); else $('[data-paste]')?.focus(); }
    else if (t.dataset.save !== undefined) { t.disabled = true; save(Number(t.dataset.save)); }
    else if (t.dataset.hide !== undefined) { t.disabled = true; hide(Number(t.dataset.hide), Number(t.dataset.to)); }
    else if (t.dataset.toggleHidden !== undefined) { state.showHidden = !state.showHidden; state.selectedId = null; reload(); }
  };

  el.onchange = (e) => {
    if (e.target.id !== 'found-date') return;
    if (e.target.value) { state.since = e.target.value; state.posted = 'date'; } else { state.posted = '3d'; }
    reload('[data-date]');
  };

  el.oninput = (e) => {
    if (e.target.id === 'found-q') {
      state.q = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => reload(), 150);
    } else if (e.target.id === 'found-link') {
      state.linkValue = e.target.value;
    } else if (e.target.id === 'found-save-name') {
      state.saveName = e.target.value;
    }
  };

  // "+ Paste a job link" only opens Add job with the link filled in. Nothing is fetched.
  el.onsubmit = async (e) => {
    if (e.target.id === 'found-save-form') {
      e.preventDefault();
      if (state.posted === 'date') {
        state.saveError = 'Saved searches use Today, 3 days, Week or Any. Pick one of those to save.';
        drawSaved();
        return;
      }
      try {
        await api('/api/saved-searches', { method: 'POST', body: { name: state.saveName, q: state.q, work_mode: state.mode, posted: state.posted } });
        state.saveOpen = false; state.saveError = '';
        status = 'Saved. Find it under Saved searches.';
        await reload();
        if (!stale()) $('#found-star')?.focus();
      } catch (err) {
        state.saveError = err.message;
        drawSaved();
        $('#found-save-name')?.focus();
      }
      return;
    }
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
