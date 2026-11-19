// New jobs (route #/found): jobs read from ITPro's feeds. Refresh fetches (the server asks ITPro at most
// every 30 minutes). Search and the filters only look at jobs already stored, so they are instant.
// Left half: one search box, three filters, the list. Right half: the whole advert.
// Everything is on the page: Location (with the top places as chips), Posted, Work mode and the saved searches
// sit in the top tile; Categories and Sites sit in the orange tile, next to Refresh.
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { formatDay, initials, todayISO, closingText } from '../lib/format.js';
import { watchLeavingFound, suggestName } from '../lib/found-marker.js';
import { ICON } from '../lib/icons.js';
import { bindScroll } from '../lib/scroll.js';

// The Posted and Work mode options, the sites and the refresh time all come from the server (data.options).

// Kept while the app stays open, so coming back to this page finds the same filters.
const state = {
  q: '', posted: '3d', since: '', mode: 'any', place: '', placeExact: false, sort: 'new', showHidden: false, selectedId: null,
  view: 'list',                       // under 1100px wide only one half shows: 'list' or 'detail'
  saveOpen: false, saveName: '', saveError: '', linkOpen: false, linkValue: '', linkError: '',
};

const itproLink = (url) => (/^https:\/\/itpro\.lk\//.test(url) ? url : '');

function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  return `${formatDay(todayISO(d))}, ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
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
    if (state.place.trim()) p.set(state.placeExact ? 'location' : 'location_has', state.place.trim());
    if (state.sort === 'match') p.set('sort', 'match');
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

  function chipsHtml(attr, options, current) {
    return options.map((o) => html`<button type="button" class="chip sm" data-${attr}="${o.key}" aria-pressed="${o.key === current}">${o.label}</button>`);
  }

  // The label of a job's work mode, or '' when it is not stated.
  function modeLabel(mode) {
    return mode && mode !== 'any' ? data.options.work_modes.find((m) => m.key === mode)?.label ?? '' : '';
  }

  function postedHtml() {
    const picked = state.posted === 'date' && state.since;
    const current = picked ? 'pick' : state.posted === 'date' ? '3d' : state.posted;
    return html`<span class="nj-rowlabel">Posted</span><div class="chip-group">${chipsHtml('posted', data.options.posted, current)}<button type="button" class="chip sm" data-posted="pick" aria-pressed="${Boolean(picked)}">${picked ? `From ${formatDay(state.since, data.today)}` : 'Pick a date…'}</button></div>`;
  }

  function modeHtml() {
    return html`<span class="nj-rowlabel">Work mode</span><div class="chip-group">${chipsHtml('mode', data.options.work_modes, state.mode)}</div>`;
  }

  // The three places with most jobs, one tap each. Tap again to clear.
  function quickHtml() {
    const cur = state.place.trim().toLowerCase();
    return data.locations.slice(0, 3).map((l) => html`<button type="button" class="chip sm" data-place="${l.name}" aria-pressed="${l.name.toLowerCase() === cur}" title="${l.count} job${l.count === 1 ? '' : 's'}">${l.name} · ${l.count}</button>`);
  }

  function placesHtml() {
    return data.locations.map((l) => html`<option value="${l.name}" label="${l.count} job${l.count === 1 ? '' : 's'}"></option>`);
  }

  function countHtml() {
    const { hidden_count } = data;
    const hiddenLink = state.showHidden
      ? html`<button type="button" class="link-btn" data-toggle-hidden>← Back to jobs</button>`
      : hidden_count ? html`<button type="button" class="link-btn" data-toggle-hidden>Show hidden (${hidden_count})</button>` : '';
    return html`
      
      <div class="nj-count-right">
        ${data.has_presets ? html`<button type="button" class="chip sm" data-sort aria-pressed="${state.sort === 'match'}" title="Jobs that match your role presets first. Nothing is hidden.">Best match first</button>` : ''}
        <button type="button" class="btn btn-secondary nj-refresh${busy ? ' busy' : ''}" id="found-refresh" title="Read the latest jobs from ITPro" ${busy ? 'disabled' : ''}>${ICON.refresh}<span>${busy ? 'Refreshing…' : 'Refresh'}</span></button>
        ${hiddenLink}
      </div>
      ${data.has_presets ? '' : html`<p class="nj-hint text-sm text-muted">Add skills to a role preset in <a href="#/profile">Profile</a> to see which jobs match you.</p>`}`;
  }

  function countInfo() {
    const { jobs, new_count, last_fetch_at } = data;
    const parts = [state.showHidden || !new_count ? '' : `${new_count} new`, last_fetch_at ? `updated ${stamp(last_fetch_at)}` : ''];
    return { label: state.showHidden ? 'hidden jobs' : 'jobs found', n: jobs.length, cap: parts.filter(Boolean).join(' · ') };
  }

  const sameSearch = (x) => x.q.toLowerCase() === state.q.trim().replace(/\s+/g, ' ').toLowerCase() && x.work_mode === state.mode && x.posted === state.posted;

  // Orange tile: what Refresh reads.
  function sideHtml() {
    const cats = data.categories;
    return html`
      <section class="fc-block" aria-label="Categories to follow">
        <span class="fc-blabel">Categories to follow</span>
        <div class="chip-group">
          <button type="button" class="chip sm" data-cat-all aria-pressed="${cats.length === data.available_categories.length}">All</button>
          ${data.available_categories.map((c) => html`<button type="button" class="chip sm" data-cat="${c.slug}" aria-pressed="${cats.includes(c.slug)}">${c.label}</button>`)}
        </div>
        <span class="fc-bnote">Read on the next refresh</span>
      </section>
      <section class="fc-block" aria-label="Sites">
        <span class="fc-blabel">Sites</span>
        <div class="chip-group">
          <button type="button" class="chip sm" aria-pressed="true" disabled title="${data.options.source} is always read">${data.options.source}</button>
          ${data.options.other_sites.map((n) => html`<span class="badge b-off" title="Not connected">${n}</span>`)}
        </div>
      </section>`;
  }

  // Top tile, last row: saved searches, save this one, manage, paste a link.
  function savedHtml() {
    const match = saved.find(sameSearch);
    return html`
      <span class="nj-rowlabel">Saved</span>
      <div class="chip-group">
        ${saved.map((x) => html`<button type="button" class="chip sm" data-saved="${x.id}" aria-pressed="${x === match}">${x.name}${x.new_count ? ` · ● ${x.new_count} new` : ''}</button>`)}
        ${saved.length ? '' : html`<span class="text-sm text-muted nj-none">None yet</span>`}
        <button type="button" class="chip sm" id="found-star" ${match ? 'disabled' : ''}>${match ? '★ This search is saved' : '☆ Save this search'}</button>
        <a class="chip sm found-manage" href="#/saved">Manage</a>
        <button type="button" class="chip sm" data-paste aria-expanded="${state.linkOpen}">+ Paste a job link</button>
      </div>`;
  }

  function formsHtml() {
    return html`
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
      ${state.linkOpen ? html`
        <form class="found-save" id="found-link-form" novalidate>
          <label class="label" for="found-link">Job link</label>
          <div class="nj-inline">
            <input class="input" id="found-link" name="link" type="url" autocomplete="off" placeholder="https://..." value="${state.linkValue}">
            <button class="btn btn-secondary" type="submit">Open in Add job</button>
          </div>
          ${state.linkError ? html`<p class="field-error" role="alert">◇ ${state.linkError}</p>` : ''}
        </form>` : ''}`;
  }

  // Honest signals, worked out from the role presets. A missing badge means no evidence, never "bad job".
  function matchBadges(j) {
    const m = j.match;
    if (!m) return '';
    const many = (data.preset_count ?? 0) > 1;
    return html`
      ${m.skills ? html`<span class="badge b-skills" title="${m.skills.matched} of the ${m.skills.total} skills this advert asks for are in your “${m.skills.preset}” preset: ${m.skills.names.join(', ')}">${m.skills.matched} of ${m.skills.total} skills${many ? ` · ${m.skills.preset}` : ''}</span>` : ''}
      ${m.role ? html`<span class="badge b-role" title="The job title shares a word with the target role of your “${m.role}” preset">Role fits</span>` : ''}
      ${m.entry ? html`<span class="badge b-entry" title="The advert uses entry-level words such as intern, junior or 1 year. A guide only.">Entry level</span>` : ''}`;
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
              ${j.location ? html`<span class="badge b-loc">${j.location}</span>` : ''}
              ${modeLabel(j.work_mode) ? html`<span class="badge b-mode">${modeLabel(j.work_mode)}</span>` : ''}
              ${matchBadges(j)}
              <span class="text-sm text-muted">${data.options.source} · ${formatDay(j.published_on, data.today)}</span>
            </span>
          </span>
        </button>
        <div class="found-row-actions">
          ${j.job_id
            ? html`<a class="btn btn-secondary icon-btn sm is-saved" href="#/jobs/${j.job_id}" aria-label="Saved. Open job" title="Saved · Open job">${ICON.savedFill}</a>`
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
    if (!detail) return html`<div class="found-detail" id="found-detail-card"><p class="text-muted">${data?.jobs.length ? 'Pick a job to read it here.' : 'No job to show.'}</p></div>`;
    const j = detail;
    const link = itproLink(j.url);
    const mine = data.jobs.find((x) => x.id === j.id)?.match?.skills;
    const hasSkills = mine ? mine.names.join(', ') : '';
    return html`
      <article class="found-detail" id="found-detail-card" aria-label="${j.title}">
        <div class="nj-dhead">
          <button type="button" class="btn btn-secondary icon-btn md nj-back" data-back aria-label="Back to the list" title="Back to the list">${ICON.back}</button>
          <div class="avatar big" aria-hidden="true">${initials(j.company || j.title)}</div>
          <div class="row-main">
            <h2>${j.title}</h2>
            <div class="text-muted">${j.company}</div>
          </div>
        </div>
        <div class="found-badges">
          <span class="badge b-site">${data.options.source}</span>
          <span class="badge b-date">Posted ${formatDay(j.published_on, data.today)}</span>
          ${j.job_type ? html`<span class="badge b-type">${j.job_type}</span>` : ''}
          ${j.location ? html`<span class="badge b-loc">${j.location}</span>` : ''}
          ${modeLabel(j.work_mode) ? html`<span class="badge b-mode">${modeLabel(j.work_mode)}</span>` : html`<span class="badge b-none">Work mode not stated</span>`}
          ${j.closes_on ? html`<span class="badge b-close">${closingText(j.closes_on, data.today)}</span>` : ''}
          ${matchBadges(data.jobs.find((x) => x.id === j.id))}
        </div>
        ${hasSkills ? html`<p class="text-sm text-muted nj-have">Skills in this advert that you have: ${hasSkills}</p>` : ''}
        <div class="nj-actions" role="group" aria-label="Job actions">
          ${j.job_id
            ? html`<a class="btn btn-secondary nj-btn" href="#/jobs/${j.job_id}">${ICON.saved} Saved · Open job</a>`
            : html`<button type="button" class="btn btn-primary nj-btn" data-save="${j.id}">${ICON.save} Save</button>`}
          ${link ? html`<a class="btn btn-secondary nj-btn" href="${link}" target="_blank" rel="noopener noreferrer">${ICON.open} Open advert</a>` : ''}
          <button type="button" class="btn btn-secondary nj-btn" data-hide="${j.id}" data-to="${j.hidden ? 0 : 1}">${j.hidden ? ICON.unhide : ICON.hide} ${j.hidden ? 'Unhide' : 'Hide'}</button>
        </div>
        <p class="text-sm found-msg" role="status">${detailMsg}</p>
        <div class="scroll-wrap found-advert-wrap">
          <div class="found-advert scroller" tabindex="0" role="region" aria-label="About the job">${j.description || `The advert has no text. Open the advert on ${data.options.source}.`}</div>
          <div class="scroll-fade" aria-hidden="true"></div>
          <button type="button" class="more-pill" data-more hidden aria-label="Show more of the advert"></button>
        </div>
      </article>`;
  }

  const $ = (sel) => el.querySelector(sel);
  function drawFilters() {
    $('#found-posted-row').innerHTML = postedHtml();
    $('#found-mode-row').innerHTML = modeHtml();
    $('#found-places').innerHTML = placesHtml();
    $('#found-quick').innerHTML = quickHtml();
    const box = $('#found-place');
    if (document.activeElement !== box) box.value = state.place;   // never rewrite the box while someone types in it
    $('[data-clear-place]').hidden = !state.place;
  }
  function drawCount() {
    $('#found-count').innerHTML = countHtml();
    const c = countInfo();
    $('#found-label').textContent = c.label;
    $('#found-num').textContent = String(c.n);
    $('#found-cap').textContent = c.cap;
  }
  function drawStatus() { $('#found-status').textContent = status; }
  function drawSide() { $('#found-side').innerHTML = sideHtml(); }
  function drawSaved() {
    $('#found-saved').innerHTML = savedHtml();
    $('#found-forms').innerHTML = formsHtml();
  }
  function drawDetail() { $('#found-detail').innerHTML = detailHtml(); bindScroll($('.found-advert-wrap'), null); }
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
    drawStatus(); drawFilters(); drawCount(); drawSide(); drawSaved(); drawList(top); drawDetail();
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
      else if (!r.fetched) status = `Updated ${ago(r.minutes_ago)}. ${data.options.source} is asked at most every ${data.options.refresh_minutes} minutes, so this is the saved list.`;
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
    drawSide();
    try {
      data.categories = (await api('/api/found/settings', { method: 'PATCH', body: { categories: next } })).categories;
    } catch (err) {
      data.categories = cats;
      status = err.message;
      drawStatus();
    }
    if (!stale()) { drawSide(); $(`[data-cat="${slug}"]`)?.focus(); }
  }

  async function toggleAllCategories() {
    const all = data.available_categories.map((c) => c.slug);
    const cats = data.categories;
    data.categories = all;
    drawSide();
    try {
      data.categories = (await api('/api/found/settings', { method: 'PATCH', body: { categories: all } })).categories;
    } catch (err) {
      data.categories = cats;
      status = err.message;
      drawStatus();
    }
    if (!stale()) { drawSide(); $('[data-cat-all]')?.focus(); }
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
      <div class="bento bento-found" id="found-layout" data-view="${state.view}">
        <section class="bento-tile found-count" aria-label="Jobs in this view">
          <span class="mono fc-label" id="found-label"></span>
          <div class="fc-mid">
            <span class="fc-num" id="found-num"></span>
            <p class="fc-cap" id="found-cap"></p>
          </div>
          <div class="nj-count" id="found-count"></div>
          <div class="fc-side" id="found-side"></div>
          <p class="text-sm found-status" id="found-status" role="status"></p>
        </section>
        <section class="bento-tile found-head" aria-label="Search and filters">
          <div class="nj-controls">
            <div class="nj-searchrow">
              <div class="nj-search">
                <label class="sr-only" for="found-q">Search new jobs</label>
                <input class="input" id="found-q" type="search" autocomplete="off" placeholder="Search by title, skill or company" value="${state.q}">
              </div>
              <label class="nj-place">
                <input id="found-place" type="text" list="found-places" autocomplete="off" placeholder="Location: type or pick a place" aria-label="Location" value="${state.place}">
                <button type="button" class="nj-clear" data-clear-place aria-label="Clear location" title="Clear location" ${state.place ? '' : 'hidden'}>×</button>
                <datalist id="found-places"></datalist>
              </label>
              <div class="chip-group nj-quick" id="found-quick"></div>
            </div>
            <div class="nj-filters" id="found-filters">
              <div class="nj-frow">
                <div class="nj-fgroup" id="found-posted-row"></div>
                <div class="nj-fgroup" id="found-mode-row"></div>
              </div>
              <div class="nj-frow nj-savedrow" id="found-saved"></div>
              <div class="nj-forms" id="found-forms"></div>
              <input type="date" id="found-date" class="found-date-input" tabindex="-1" aria-hidden="true" value="${state.since}">
            </div>
          </div>
        </section>
        <section class="bento-tile found-listtile" aria-label="Jobs">
          <div class="nj-listarea" id="found-listarea"></div>
        </section>
        <div class="bento-tile found-dtile" id="found-detail"></div>
      </div>
    </div>`;
  drawStatus(); drawFilters(); drawCount(); drawSide(); drawSaved(); drawList(); drawDetail();

  el.onclick = (e) => {
    const t = e.target.closest('button, .found-row');
    if (!t || t.disabled) return;
    if (t.dataset.more !== undefined) { const box = t.closest('.scroll-wrap')?.querySelector('.scroller'); box?.scrollBy({ top: box.clientHeight * 0.8, behavior: 'smooth' }); }
    else if (t.id === 'found-refresh') refresh();
    else if (t.dataset.posted !== undefined) {
      if (t.dataset.posted === 'pick') {
        const input = $('#found-date');
        try { input.showPicker(); } catch { input.focus(); input.click(); }
      } else { state.posted = t.dataset.posted; reload(`[data-posted="${t.dataset.posted}"]`); }
    }
    else if (t.dataset.mode !== undefined) { state.mode = t.dataset.mode; reload(`[data-mode="${t.dataset.mode}"]`); }
    else if (t.dataset.sort !== undefined) { state.sort = state.sort === 'match' ? 'new' : 'match'; reload('[data-sort]'); }
    else if (t.dataset.place !== undefined) {
      const same = state.place.trim().toLowerCase() === t.dataset.place.toLowerCase();
      state.place = same ? '' : t.dataset.place; state.placeExact = !same;
      reload(same ? '#found-place' : '#found-quick .chip[aria-pressed="true"]');
    }
    else if (t.dataset.clearPlace !== undefined) { state.place = ''; state.placeExact = false; reload('#found-place'); }
    else if (t.dataset.catAll !== undefined) toggleAllCategories();
    else if (t.id === 'found-star') {
      state.saveOpen = true; state.saveError = ''; state.saveName = suggestName(state.q, state.mode);
      drawSaved(); $('#found-save-name')?.focus(); $('#found-save-name')?.select();
    }
    else if (t.dataset.saved !== undefined) {
      const x = saved.find((v) => v.id === Number(t.dataset.saved));
      if (!x) return;
      state.q = x.q; state.mode = x.work_mode; state.posted = x.posted; state.place = ''; state.selectedId = null; state.showHidden = false;
      state.saveOpen = false; state.linkOpen = false;
      $('#found-q').value = x.q;
      reload(`[data-saved="${x.id}"]`);
    }
    else if (t.dataset.back !== undefined) { setView('list'); $('.found-row[aria-current="true"]')?.focus(); }
    else if (t.dataset.id !== undefined && t.classList.contains('found-row')) selectRow(Number(t.dataset.id));
    else if (t.dataset.cat !== undefined) toggleCategory(t.dataset.cat);
    else if (t.dataset.paste !== undefined) { state.linkOpen = !state.linkOpen; state.linkError = ''; drawSaved(); if (state.linkOpen) $('#found-link')?.focus(); else $('[data-paste]')?.focus(); }
    else if (t.dataset.save !== undefined) { t.disabled = true; save(Number(t.dataset.save), Boolean(t.closest('.found-row-actions'))); }
    else if (t.dataset.hide !== undefined) { t.disabled = true; hide(Number(t.dataset.hide), Number(t.dataset.to)); }
    else if (t.dataset.toggleHidden !== undefined) { state.showHidden = !state.showHidden; state.selectedId = null; reload(); }
  };

  el.onchange = (e) => {
    if (e.target.id === 'found-date') {
      if (e.target.value) { state.since = e.target.value; state.posted = 'date'; } else { state.posted = '3d'; }
      reload('[data-posted="pick"]');
    }
  };

  el.oninput = (e) => {
    if (e.target.id === 'found-q') {
      state.q = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => reload(), 150);
    } else if (e.target.id === 'found-place') {
      state.place = e.target.value;
      state.placeExact = data.locations.some((l) => l.name.toLowerCase() === state.place.trim().toLowerCase());
      $('[data-clear-place]').hidden = !state.place;
      clearTimeout(timer);
      timer = setTimeout(() => reload(), 250);
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
        drawSaved();
        return;
      }
      try {
        await api('/api/saved-searches', { method: 'POST', body: { name: state.saveName, q: state.q, work_mode: state.mode, posted: state.posted } });
        state.saveOpen = false; state.saveError = '';
        status = 'Saved. It is in Saved searches.';
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
      drawSaved();
      $('#found-link')?.focus();
      return;
    }
    state.linkOpen = false; state.linkValue = ''; state.linkError = '';
    location.hash = '#/jobs/new?url=' + encodeURIComponent(link);
  };
}
