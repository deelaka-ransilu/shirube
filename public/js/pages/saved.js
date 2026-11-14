// Saved searches: see them all, run one, edit, delete. Counts come from the server (same code as Found).
import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { watchLeavingFound, MODE_LABEL, POSTED_LABEL, suggestName } from '../lib/found-marker.js';

const WORK_MODES = [['any', 'Any'], ['onsite', 'On-site'], ['hybrid', 'Hybrid'], ['remote', 'Remote']];
const POSTED = [['today', 'Today'], ['3d', '3 days'], ['week', 'Week'], ['any', 'Any']];
const NOTIFY = [['open', 'When I open Found'], ['never', 'Never']];

export async function render(el, { stale }) {
  watchLeavingFound();
  let searches = [];
  let form = null;          // null = closed; { id|null, name, q, work_mode, posted, notify, error }
  let confirmId = null;     // the card whose Delete is waiting for a second press
  let status = '';

  async function load() { searches = (await api('/api/saved-searches')).searches; }

  function chips(label, attr, options, current) {
    return html`
      <div class="found-group" role="group" aria-label="${label}">
        <span class="label">${label}</span>
        <div class="chip-group">
          ${options.map(([v, text]) => html`<button type="button" class="chip" data-${raw(attr)}="${v}" aria-pressed="${v === current}">${text}</button>`)}
        </div>
      </div>`;
  }

  function cardHtml(s) {
    const words = s.q.split(/\s+/).filter(Boolean);
    const count = s.new_count === null ? '○ Not counted' : s.new_count ? `● ${s.new_count} new job${s.new_count === 1 ? '' : 's'}` : '○ No new jobs';
    return html`
      <article class="card compact saved-card" aria-label="${s.name}">
        <h2>${s.name}</h2>
        <div class="saved-words">${words.length ? words.map((w) => html`<span class="tag">${w}</span>`) : html`<span class="text-sm text-muted">No search words</span>`}</div>
        <div class="text-sm text-muted">${MODE_LABEL[s.work_mode]} · posted ${POSTED_LABEL[s.posted]} · ITPro</div>
        <div class="saved-count">${count}</div>
        <div class="found-actions">
          <a class="btn btn-secondary" href="#/found?saved=${s.id}">Search now</a>
          <button type="button" class="btn btn-secondary" data-edit="${s.id}">Edit</button>
          ${confirmId === s.id
            ? html`<button type="button" class="btn btn-danger" data-delete="${s.id}">Press again to delete</button>`
            : html`<button type="button" class="btn btn-secondary" data-delete="${s.id}">Delete</button>`}
        </div>
      </article>`;
  }

  function formHtml() {
    const f = form;
    return html`
      <form class="card compact saved-form" id="saved-form" novalidate aria-label="${f.id ? 'Edit saved search' : 'New saved search'}">
        <h2>${f.id ? `Edit: ${f.original}` : 'New saved search'}</h2>
        <div>
          <label class="label" for="saved-name">Name</label>
          <input class="input" id="saved-name" maxlength="60" autocomplete="off" placeholder="e.g. DevOps, Colombo" value="${f.name}">
        </div>
        <div>
          <label class="label" for="saved-q">Search words (every word must appear in the job)</label>
          <input class="input" id="saved-q" maxlength="200" autocomplete="off" placeholder="e.g. devops colombo" value="${f.q}">
        </div>
        ${chips('Work mode', 'mode', WORK_MODES, f.work_mode)}
        ${chips('Posted', 'posted', POSTED, f.posted)}
        <div class="found-group" role="group" aria-label="Sites"><span class="label">Sites</span>
          <div class="chip-group"><button type="button" class="chip" aria-pressed="true" disabled>ITPro</button><button type="button" class="chip" disabled>TopJobs (later)</button></div>
        </div>
        ${chips('Tell me about new jobs', 'notify', NOTIFY, f.notify)}
        ${f.error ? html`<p class="field-error" role="alert">◇ ${f.error}</p>` : ''}
        <div class="found-actions">
          <button type="submit" class="btn btn-primary">Save search</button>
          <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
        </div>
      </form>`;
  }

  function draw(focus = '') {
    el.innerHTML = html`
      <div class="page-head">
        <div>
          <h1>Saved searches</h1>
          <p class="text-muted">Keep the roles you look for, and search again in one tap.</p>
        </div>
        ${form ? '' : html`<button type="button" class="btn btn-secondary" data-new>+ New saved search</button>`}
      </div>
      <p class="text-sm found-status" role="status">${status}</p>
      ${searches.length || form ? '' : html`<div class="card empty"><h2>No saved searches yet</h2><p class="text-muted">On Found, type some words and press “Save this search”, or use the button above.</p></div>`}
      <div class="saved-layout">
        <div class="saved-grid">${searches.map(cardHtml)}</div>
        ${form ? formHtml() : ''}
      </div>`;
    if (focus) el.querySelector(focus)?.focus();
  }

  try { await load(); } catch (err) {
    if (stale()) return;
    el.innerHTML = html`<div class="card"><h2>Could not load saved searches</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;
  draw();

  const blank = () => ({ id: null, original: '', name: '', q: '', work_mode: 'any', posted: '3d', notify: 'open', error: '' });

  async function reloadAll(focus) {
    try { await load(); } catch (err) { status = err.message; }
    if (!stale()) draw(focus);
  }

  el.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    const d = t.dataset;
    if (d.new !== undefined) { form = blank(); status = ''; draw('#saved-name'); }
    else if (d.edit !== undefined) {
      const s = searches.find((x) => x.id === Number(d.edit));
      if (!s) return;
      form = { id: s.id, original: s.name, name: s.name, q: s.q, work_mode: s.work_mode, posted: s.posted, notify: s.notify, error: '' };
      status = ''; confirmId = null; draw('#saved-name');
    }
    else if (d.cancel !== undefined) { form = null; draw(); }
    else if (d.delete !== undefined) {
      const id = Number(d.delete);
      if (confirmId !== id) { confirmId = id; draw(`[data-delete="${id}"]`); return; }
      confirmId = null;
      try { await api(`/api/saved-searches/${id}`, { method: 'DELETE' }); status = 'Deleted.'; if (form?.id === id) form = null; } catch (err) { status = err.message; }
      await reloadAll();
    }
    else if (form && (d.mode !== undefined || d.posted !== undefined || d.notify !== undefined)) {
      if (d.mode !== undefined) form.work_mode = d.mode;
      if (d.posted !== undefined) form.posted = d.posted;
      if (d.notify !== undefined) form.notify = d.notify;
      draw(`[data-${d.mode !== undefined ? 'mode' : d.posted !== undefined ? 'posted' : 'notify'}="${d.mode ?? d.posted ?? d.notify}"]`);
    }
  };

  el.oninput = (e) => {
    if (!form) return;
    if (e.target.id === 'saved-name') form.name = e.target.value;
    else if (e.target.id === 'saved-q') form.q = e.target.value;
  };

  el.onsubmit = async (e) => {
    if (e.target.id !== 'saved-form') return;
    e.preventDefault();
    const name = form.name.trim() || suggestName(form.q, form.work_mode);
    const body = { name, q: form.q, work_mode: form.work_mode, posted: form.posted, notify: form.notify };
    try {
      await api(form.id ? `/api/saved-searches/${form.id}` : '/api/saved-searches', { method: form.id ? 'PATCH' : 'POST', body });
      status = 'Saved.';
      form = null;
      await reloadAll('[data-new]');
    } catch (err) {
      form.error = err.message;
      draw('#saved-name');
    }
  };
}
