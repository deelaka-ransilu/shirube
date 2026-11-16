// New jobs (route #/found): jobs read from ITPro's feeds. Refresh fetches (the server asks ITPro at most
// every 30 minutes). Search and the filters only look at jobs already stored, so they are instant.
// Left half: one search box, three filters, the list. Right half: the whole advert.
// Saved searches, categories, sites and "paste a link" live under the "More filters" button.
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatDay, initials, todayISO, closingText } from '../lib/format.js';
import { watchLeavingFound, suggestName } from '../lib/found-marker.js';
import { ICON } from '../lib/icons.js';
import { bindScroll } from '../lib/scroll.js';

const WORK_MODES = [['any', 'Any'], ['onsite', 'On-site'], ['hybrid', 'Hybrid'], ['remote', 'Remote']];
const MODE_LABEL = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
const POSTED = [['today', 'Today'], ['3d', 'Last 3 days'], ['week', 'Last week'], ['any', 'Any time']];
const OTHER_SITES = ['TopJobs', 'LinkedIn', 'Rooster', 'Xpress Jobs'];   // not connected: shown grayed out, nothing more

// Kept while the app stays open, so coming back to this page finds the same filters.
const state = {
  q: '', posted: '3d', since: '', mode: 'any', place: '', showHidden: false, selectedId: null,
  view: 'list',                       // under 1100px wide only one half shows: 'list' or 'detail'
  moreOpen: false, saveOpen: false, saveName: '', saveError: '', linkOpen: false, linkValue: '', linkError: '',
};

const itproLink = (url) => (/^https:\/\/itpro\.lk\//.test(url) ? url : '');

function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDay(todayISO(d))}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ago = (min) => (min < 1 ? 'just now' : `${min} min ago`);

export async function render(el, { stale, query = {} }) {
  watchLeavingFound();
  state.view = 'list';
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
    if (state.place) p.set('location', state.place);
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

  function selectHtml(id, label, options, current) {
    return html`
      <label class="nj-sel">
        <span>${label}</span>
        <select id="${id}" aria-label="${label}">
          ${options.map(([value, text]) => html`<option value="${value}" ${value === current ? 'selected' : ''}>${text}</option>`)}
        </select>
      </label>`;
  }

  function filtersHtml() {
    const posted = state.posted === 'date' && state.since
      ? [...POSTED, ['date', `From ${formatDay(state.since, data.today)}`]]
      : POSTED;
    const current = state.posted === 'date' && state.since ? 'date' : state.posted === 'date' ? '3d' : state.posted;
    const places = data.locations.map((l) => [l.name, `${l.name} (${l.count})`]);
    if (state.place && !data.locations.some((l) => l.name.toLowerCase() === state.place.toLowerCase())) places.push([state.place, `${state.place} (0)`]);
    const placeCurrent = places.find(([v]) => v.toLowerCase() === state.place.toLowerCase())?.[0] ?? '';
    return html`
      <div class="nj-sel-wrap">
        ${selectHtml('found-posted', 'Posted', [...posted, ['pick', 'Pick a date…']], current)}
        <input type="date" id="found-date" class="found-date-input" tabindex="-1" aria-hidden="true" value="${state.since}">
      </div>
      ${selectHtml('found-mode', 'Work mode', WORK_MODES, state.mode)}
      ${selectHtml('found-place', 'Location', [['', 'Any'], ...places], placeCurrent)}`;
  }

  function countHtml() {
    const { jobs, new_count, hidden_count, last_fetch_at } = data;
    const n = jobs.length;
    const first = state.showHidden
      ? `${n} hidden`
      : `${n} job${n === 1 ? '' : 's'}${new_count ? ` · ${new_count} new` : ''}`;
    const hiddenLink = state.showHidden
      ? html`<button type="button" class="link-btn" data-toggle-hidden>← Back to jobs</button>`
      : hidden_count ? html`<button type="button" class="link-btn" data-toggle-hidden>Show hidden (${hidden_count})</button>` : '';
    return html`
      <div class="nj-count-text"><b>${first}</b>${last_fetch_at ? html`<span class="text-muted"> · updated ${stamp(last_fetch_at)}</span>` : ''}</div>
      <div class="nj-count-right">
        ${hiddenLink}
        <button type="button" class="btn btn-secondary icon-btn sm${busy ? ' busy' : ''}" id="found-refresh" aria-label="${busy ? 'Refreshing' : 'Refresh from ITPro'}" title="Refresh from ITPro" ${busy ? 'disabled' : ''}>${ICON.refresh}</button>
      </div>`;
  }

  const sameSearch = (x) => x.q.toLowerCase() === state.q.trim().replace(/\s+/g, ' ').toLowerCase() && x.work_mode === state.mode && x.posted === state.posted;

  function moreHtml() {
    if (!state.moreOpen) return '';
    const cats = data.categories;
    const match = saved.find(sameSearch);
    return html`
      <div class="nj-more" role="region" aria-label="More filters">
        <section class="nj-more-block" aria-label="Sites">
          <span class="label">Sites</span>
          <div class="chip-group">
            <button type="button" class="chip sm" aria-pressed="true" disabled title="ITPro is always read">ITPro</button>
            ${OTHER_SITES.map((s) => html`<span class="badge b-off" title="Not connected">${s}</span>`)}
          </div>
        </section>
        <section class="nj-more-block" aria-label="Saved searches" data-tint="lilac">
          <span class="label">Saved searches</span>
          <div class="chip-group">
            ${saved.map((x) => html`<button type="button" class="chip sm" data-saved="${x.id}" aria-pressed="${x === match}">${x.name}${x.new_count ? ` · ● ${x.new_count} new` : ''}</button>`)}
            ${saved.length ? '' : html`<span class="text-sm text-muted">None yet.</span>`}
          </div>
          <div class="chip-group">
            <button type="button" class="chip sm" id="found-star" ${match ? 'disabled' : ''}>${match ? '★ This search is saved' : '☆ Save this search'}</button>
            <a class="chip sm found-manage" href="#/saved">Manage saved searches</a>
          </div>
          ${state.saveOpen ? html`
            <form class="found-save" id="found-save-form" novalidate>
              <label class="label" for="found-save-name">Name for this search</label>
              <div class="nj-inline">
                <input class="input" id="found-save-name" name="name" maxlength="60" autocomplete="off" value="${state.saveName}">
                <button class="btn btn-secondary" type="submit">Save search</button>
              </div>
              <p class="text-sm text-muted">It keeps the words, work mode and posted filter (not the location). You can change it in Manage.</p>
              ${state.saveError ? html`<p class="field-error" role="alert">◇ ${state.saveError}</p>` : ''}
            </form>` : ''}
        </section>
        <section class="nj-more-block" aria-label="Categories to follow" data-tint="green">
          <span class="label">Categories to follow (used on the next refresh; all jobs are always read)</span>
          <div class="chip-group">
            ${data.available_categories.map((c) => html`<button type="button" class="chip sm" data-cat="${c.slug}" aria-pressed="${cats.includes(c.slug)}">${c.label}</button>`)}
          </div>
        </section>
        <section class="nj-more-block" aria-label="Paste a job link">
          <div class="chip-group">
            <button type="button" class="chip sm" data-paste aria-expanded="${state.linkOpen}">+ Paste a job link</button>
          </div>
          ${state.linkOpen ? html`
            <form class="found-save" id="found-link-form" novalidate>
              <label class="label" for="found-link">Job link</label>
              <div class="nj-inline">
                <input class="input" id="found-link" name="link" type="url" autocomplete="off" placeholder="https://..." value="${state.linkValue}">
                <button class="btn btn-secondary" type="submit">Open in Add job</button>
              </div>
              ${state.linkError ? html`<p class="field-error" role="alert">◇ ${state.linkError}</p>` : ''}
            </form>` : ''}
        </section>
      </div>`;
  }

  // Each row has one small Save icon. It sits beside the row button (not inside it),
  // so a click on it never selects the row. Open advert and Hide live in the detail panel.
  function rowHtml(j) {
    return html`
      <div class="found-item" data-id="${j.id}">
        <button type="button" class="found-row" data-id="${j.id}" aria-current="${j.id === state.selectedId}">
          <span class="avatar" aria-hidden="true">${initials(j.company || j.title)}</span>
          <span class="found-row-main">
            <b>${j.title}</b>
            <small class="text-muted">${j.company}</small>
            <span class="found-row-meta">
              ${j.is_new ? html`<span class="tag tag-new">New</span>` : ''}
              ${j.job_id ? html`<span class="badge b-saved">✓ Saved</span>` : ''}
              ${j.location ? html`<span class="badge b-loc">${j.location}</span>` : ''}
              ${MODE_LABEL[j.work_mode] ? html`<span class="badge b-mode">${MODE_LABEL[j.work_mode]}</span>` : ''}
              <span class="text-sm text-muted">ITPro · ${formatDay(j.published_on, data.today)}</span>
            </span>
          </span>
        </button>
        <div class="found-row-actions">
          ${j.job_id
            ? html`<a class="btn btn-secondary icon-btn sm" href="#/jobs/${j.job_id}" aria-label="Saved. Open job" title="Saved · Open job">${ICON.saved}</a>`
            : html`<button type="button" class="btn btn-secondary icon-btn sm" data-save="${j.id}" aria-label="Save to Jobs" title="Save to Jobs">${ICON.save}</button>`}
        </div>
      </div>`;
  }

  function listHtml() {
    const { jobs, stored_count } = data;
    if (!jobs.length) {
      let box;
      if (state.showHidden) box = html`<h2>No hidden jobs</h2><p class="text-muted">Jobs you hide show up here.</p>`;
      else if (!stored_count) box = html`<h2>Nothing here yet</h2><p class="text-muted">Press the refresh button to read the latest jobs from ITPro.</p>`;
      else box = html`<h2>No jobs match</h2><p class="text-muted">Set Posted to Any time, or clear the search words and filters.</p>`;
      return html`<div class="nj-empty">${box}</div>`;
    }
    return html`
      <div class="scroll-wrap found-list-wrap">
        <div id="found-list" class="scroller">${jobs.map(rowHtml)}</div>
        <div class="scroll-fade" aria-hidden="true"></div>
        <button type="button" class="more-pill" data-more hidden aria-label="Show more jobs"></button>
      </div>`;
  }

  function detailHtml() {
    if (!detail) return html`<div class="card compact found-detail" id="found-detail-card"><p class="text-muted">${data?.jobs.length ? 'Pick a job to read it here.' : 'No job to show.'}</p></div>`;
    const j = detail;
    const link = itproLink(j.url);
    return html`
      <article class="card compact found-detail" id="found-detail-card" aria-label="${j.title}">
        <div class="nj-dhead">
          <button type="button" class="btn btn-secondary icon-btn md nj-back" data-back aria-label="Back to the list" title="Back to the list">${ICON.back}</button>
          <div class="avatar big" aria-hidden="true">${initials(j.company || j.title)}</div>
          <div class="row-main">
            <h2>${j.title}</h2>
            <div class="text-muted">${j.company}</div>
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
        <div class="nj-actions" role="group" aria-label="Job actions">
          ${j.job_id
            ? html`<a class="btn btn-secondary nj-btn" href="#/jobs/${j.job_id}">${ICON.saved} Saved · Open job</a>`
            : html`<button type="button" class="btn btn-primary nj-btn" data-save="${j.id}">${ICON.save} Save</button>`}
          ${link ? html`<a class="btn btn-secondary nj-btn" href="${link}" target="_blank" rel="noopener noreferrer">${ICON.open} Open advert</a>` : ''}
          <button type="button" class="btn btn-secondary nj-btn" data-hide="${j.id}" data-to="${j.hidden ? 0 : 1}">${j.hidden ? ICON.unhide : ICON.hide} ${j.hidden ? 'Unhide' : 'Hide'}</button>
        </div>
        <p class="text-sm found-msg" role="status">${detailMsg}</p>
        <div class="scroll-wrap found-advert-wrap">
          <div class="found-advert scroller" tabindex="0" role="region" aria-label="About the job">${j.description || 'The advert has no text. Open the advert on ITPro.'}</div>
          <div class="scroll-fade" aria-hidden="true"></div>
        </div>
      </article>`;
  }

  const $ = (sel) => el.querySelector(sel);
  function drawFilters() { $('#found-filters').innerHTML = filtersHtml(); }
  function drawCount() { $('#found-count').innerHTML = countHtml(); }
  function drawStatus() { $('#found-status').textContent = status; }
  function drawMore() {
    $('#found-more-slot').innerHTML = moreHtml();
    const btn = $('#found-more');
    const news = saved.reduce((sum, x) => sum + (x.new_count || 0), 0);
    btn.setAttribute('aria-expanded', String(state.moreOpen));
    btn.setAttribute('aria-label', news ? `More filters. ${news} new job${news === 1 ? '' : 's'} in saved searches` : 'More filters');
    btn.querySelector('.nj-dot').hidden = !news;
  }
  function drawDetail() { $('#found-detail').innerHTML = detailHtml(); bindScroll($('.found-advert-wrap')); }
  function drawList(keepTop = null) {
    $('#found-listarea').innerHTML = listHtml();
    const box = $('#found-list');
    if (box && keepTop !== null) box.scrollTop = keepTop;
    bindScroll($('.found-list-wrap'));
  }
  function setView(view) { state.view = view; $('#found-layout').dataset.view = view; el.scrollTop = 0; }

  // Redraw after the data changed. focus: what to focus afterwards, so keyboard use keeps its place.
  async function reload(focus = '', keepScroll = false) {
    const top = keepScroll ? $('#found-list')?.scrollTop ?? null : null;
    try {
      if (await load()) await loadDetail();
    } catch (err) {
      status = err.message;
    }
    if (stale()) return;
    if (!data) return;
    drawStatus(); drawFilters(); drawCount(); drawMore(); drawList(top); drawDetail();
    if (focus) $(focus)?.focus();
  }

  async function selectRow(id) {
    setView('detail');
    if (id === state.selectedId && detail) return;
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
    status = 'Reading the ITPro feeds…';
    drawStatus(); drawCount();
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
    await reload();
    $('#found-refresh')?.focus();
  }

  async function save(id, fromList = false) {
    const asked = data.jobs.find((j) => j.id === id);
    let text;
    try {
      const r = await api(`/api/found/${id}/save`, { method: 'POST' });
      text = r.already ? 'Already in Jobs, so nothing was added again.' : 'Saved to Jobs.';
    } catch (err) {
      text = err.message;
    }
    // From the list the message goes in the status line (the open job may be a different one).
    if (fromList && id !== state.selectedId) status = asked ? `“${asked.title}”: ${text}` : text;
    else detailMsg = text;
    await reload(fromList ? `.found-item[data-id="${id}"] .found-row-actions > :first-child` : '.nj-actions > :first-child', true);
  }

  async function hide(id, to) {
    const list = data.jobs;
    const at = list.findIndex((j) => j.id === id);
    try {
      await api(`/api/found/${id}`, { method: 'PATCH', body: { hidden: to === 1 } });
      status = to === 1 ? 'Hidden. “Show hidden” brings it back.' : 'Unhidden.';
      detailMsg = '';
      if (id === state.selectedId) { state.selectedId = list[at + 1]?.id ?? list[at - 1]?.id ?? null; setView('list'); }
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
    drawMore();
    try {
      data.categories = (await api('/api/found/settings', { method: 'PATCH', body: { categories: next } })).categories;
    } catch (err) {
      data.categories = cats;
      status = err.message;
      drawStatus();
    }
    if (!stale()) { drawMore(); $(`[data-cat="${slug}"]`)?.focus(); }
  }

  function closeMore(focusButton = false) {
    if (!state.moreOpen) return;
    state.moreOpen = false; state.saveOpen = false; state.linkOpen = false;
    drawMore();
    if (focusButton) $('#found-more')?.focus();
  }

  // ---- first load, then the page ----

  try {
    if (query.saved) {
      const found = (await api('/api/saved-searches')).searches.find((x) => String(x.id) === String(query.saved));
      if (found) { state.q = found.q; state.mode = found.work_mode; state.posted = found.posted; state.place = ''; state.selectedId = null; }
    }
    await load();
    await loadDetail();
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`<div class="card"><h2>Could not load New jobs</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;

  el.innerHTML = html`
    <div class="found-page">
      <h1 class="sr-only">New jobs</h1>
      <div class="found-layout" id="found-layout" data-view="${state.view}">
        <section class="card compact found-list" aria-label="Jobs">
          <div class="nj-controls">
            <div class="nj-searchrow">
              <div class="nj-search">
                <label class="sr-only" for="found-q">Search new jobs</label>
                <input class="input" id="found-q" type="search" autocomplete="off" placeholder="Search by title, skill or company" value="${state.q}">
              </div>
              <button type="button" class="btn btn-secondary icon-btn nj-morebtn" id="found-more" aria-expanded="false" aria-controls="found-more-slot" aria-label="More filters" title="More filters">${ICON.settings}<span class="nj-dot" aria-hidden="true" hidden></span></button>
            </div>
            <div id="found-more-slot"></div>
            <div class="nj-filters" id="found-filters"></div>
            <div class="nj-count" id="found-count"></div>
            <p class="text-sm found-status" id="found-status" role="status"></p>
          </div>
          <div class="nj-listarea" id="found-listarea"></div>
        </section>
        <div id="found-detail"></div>
      </div>
    </div>`;
  drawStatus(); drawFilters(); drawCount(); drawMore(); drawList(); drawDetail();

  el.onclick = (e) => {
    const inMore = e.target.closest('.nj-more, #found-more');
    if (state.moreOpen && !inMore) closeMore();
    const t = e.target.closest('button, .found-row');
    if (!t || t.disabled) return;
    if (t.dataset.more !== undefined) { const box = t.closest('.scroll-wrap')?.querySelector('.scroller'); box?.scrollBy({ top: box.clientHeight * 0.8, behavior: 'smooth' }); }
    else if (t.id === 'found-refresh') refresh();
    else if (t.id === 'found-more') { state.moreOpen = !state.moreOpen; if (!state.moreOpen) { state.saveOpen = false; state.linkOpen = false; } drawMore(); }
    else if (t.id === 'found-star') {
      state.saveOpen = true; state.saveError = ''; state.saveName = suggestName(state.q, state.mode);
      drawMore(); $('#found-save-name')?.focus(); $('#found-save-name')?.select();
    }
    else if (t.dataset.saved !== undefined) {
      const x = saved.find((v) => v.id === Number(t.dataset.saved));
      if (!x) return;
      state.q = x.q; state.mode = x.work_mode; state.posted = x.posted; state.place = ''; state.selectedId = null; state.showHidden = false;
      state.moreOpen = false; state.saveOpen = false; state.linkOpen = false;
      $('#found-q').value = x.q;
      reload('#found-more');
    }
    else if (t.dataset.back !== undefined) { setView('list'); $('.found-row[aria-current="true"]')?.focus(); }
    else if (t.dataset.id !== undefined && t.classList.contains('found-row')) selectRow(Number(t.dataset.id));
    else if (t.dataset.cat !== undefined) toggleCategory(t.dataset.cat);
    else if (t.dataset.paste !== undefined) { state.linkOpen = !state.linkOpen; state.linkError = ''; drawMore(); if (state.linkOpen) $('#found-link')?.focus(); else $('[data-paste]')?.focus(); }
    else if (t.dataset.save !== undefined) { t.disabled = true; save(Number(t.dataset.save), Boolean(t.closest('.found-row-actions'))); }
    else if (t.dataset.hide !== undefined) { t.disabled = true; hide(Number(t.dataset.hide), Number(t.dataset.to)); }
    else if (t.dataset.toggleHidden !== undefined) { state.showHidden = !state.showHidden; state.selectedId = null; reload(); }
  };

  el.onkeydown = (e) => { if (e.key === 'Escape' && state.moreOpen) { e.preventDefault(); closeMore(true); } };

  el.onchange = (e) => {
    const id = e.target.id;
    if (id === 'found-posted') {
      const v = e.target.value;
      if (v === 'pick') {
        drawFilters();                       // show the real choice again while the date picker is open
        const input = $('#found-date');
        try { input.showPicker(); } catch { input.focus(); input.click(); }
        return;
      }
      state.posted = v;
      reload('#found-posted');
    } else if (id === 'found-date') {
      if (e.target.value) { state.since = e.target.value; state.posted = 'date'; } else { state.posted = '3d'; }
      reload('#found-posted');
    } else if (id === 'found-mode') {
      state.mode = e.target.value;
      reload('#found-mode');
    } else if (id === 'found-place') {
      state.place = e.target.value;
      reload('#found-place');
    }
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
        state.saveError = 'Saved searches use Today, Last 3 days, Last week or Any time. Pick one of those to save.';
        drawMore();
        return;
      }
      try {
        await api('/api/saved-searches', { method: 'POST', body: { name: state.saveName, q: state.q, work_mode: state.mode, posted: state.posted } });
        state.saveOpen = false; state.saveError = '';
        status = 'Saved. Find it under More filters.';
        await reload();
        if (!stale()) $('#found-star')?.focus();
      } catch (err) {
        state.saveError = err.message;
        drawMore();
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
      drawMore();
      $('#found-link')?.focus();
      return;
    }
    state.linkOpen = false; state.linkValue = ''; state.linkError = ''; state.moreOpen = false;
    location.hash = '#/jobs/new?url=' + encodeURIComponent(link);
  };
}
