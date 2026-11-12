import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { statusText } from '../lib/status.js';
import { formatDay, initials, todayISO } from '../lib/format.js';

const KIND = {
  applied:   { label: 'Applied',   symbol: '●' },
  follow_up: { label: 'Follow-up', symbol: '□' },
  reply:     { label: 'Reply',     symbol: '○' },
  interview: { label: 'Interview', symbol: '■' },
  offer:     { label: 'Offer',     symbol: '◆' },
  rejected:  { label: 'Rejected',  symbol: '▲' },
  other:     { label: 'Other',     symbol: '•' },
};
const SLOTS = ['applied', 'follow_up', 'reply', 'interview', 'offer'];
const OUTCOMES = ['applied', 'reply', 'interview', 'offer', 'rejected'];
const WORK_MODE = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };

function stageCard(s, today) {
  const k = KIND[s.kind];
  let state = 'Done';
  if (s.kind === 'follow_up' && s.happened_on >= today) state = '□ Due';
  return html`
    <button type="button" class="stage" data-stage="${s.id}">
      <span class="stage-sym" aria-hidden="true">${k.symbol}</span>
      <b>${k.label}</b>
      <small>${s.happened_on ? formatDay(s.happened_on) : 'No date'}</small>
      <small>${state}</small>
      ${s.note ? html`<small class="stage-note">${s.note}</small>` : ''}
    </button>`;
}

function pendingCard(kind) {
  const k = KIND[kind];
  return html`
    <button type="button" class="stage pending" data-new="${kind}">
      <span class="stage-sym" aria-hidden="true">${k.symbol}</span>
      <b>${k.label}</b>
      <small>No date yet</small>
      <small>Not yet</small>
      <small class="stage-note">+ Add note</small>
    </button>`;
}

function stageRow(stages, today) {
  const cards = [];
  for (const kind of SLOTS) {
    const mine = stages.filter((s) => s.kind === kind);
    if (mine.length) mine.forEach((s) => cards.push(stageCard(s, today)));
    else cards.push(pendingCard(kind));
  }
  stages.filter((s) => s.kind === 'rejected' || s.kind === 'other').forEach((s) => cards.push(stageCard(s, today)));
  cards.push(html`
    <button type="button" class="stage pending" data-new="">
      <span class="stage-sym" aria-hidden="true">+</span>
      <b>Add stage</b>
      <small>HR call, second interview, test</small>
    </button>`);
  return cards;
}

function stageForm(form, stages) {
  const existing = form.id ? stages.find((s) => s.id === form.id) : null;
  const kind = existing ? existing.kind : form.kind;
  const title = existing ? `Edit ${KIND[kind].label}` : kind ? `Add ${KIND[kind].label}` : 'Add stage';
  return html`
    <form class="inner-box stage-form" data-form="stage">
      <b>${title}</b>
      <div class="fields">
        ${!existing && !kind ? html`
          <div>
            <label class="label" for="sf-kind">Stage</label>
            <select class="input" id="sf-kind" name="kind" data-focus>
              ${['follow_up', 'reply', 'interview', 'offer', 'rejected', 'applied', 'other'].map((k) => html`<option value="${k}">${KIND[k].label}</option>`)}
            </select>
          </div>` : ''}
        <div>
          <label class="label" for="sf-date">Date</label>
          <input class="input" type="date" id="sf-date" name="happened_on" value="${existing ? existing.happened_on : todayISO()}" ${kind || existing ? 'data-focus' : ''}>
        </div>
        <div class="wide">
          <label class="label" for="sf-note">Note</label>
          <input class="input" id="sf-note" name="note" maxlength="2000" value="${existing ? existing.note : ''}" placeholder="One line, for example: Sent a short email to HR">
        </div>
      </div>
      <div class="row">
        <button type="submit" class="btn btn-primary">Save stage</button>
        <button type="button" class="btn btn-secondary" data-act="cancel-stage">Cancel</button>
        ${existing ? html`<button type="button" class="btn btn-danger" data-act="remove-stage" data-id="${existing.id}">Remove</button>` : ''}
      </div>
    </form>`;
}

function field(label, name, value, { wide = false, type = 'text', max } = {}) {
  return html`
    <div class="${wide ? 'wide' : ''}">
      <label class="label" for="ej-${name}">${label}</label>
      <input class="input" id="ej-${name}" name="${name}" type="${type}" value="${value}" ${max ? html`maxlength="${max}"` : ''}>
    </div>`;
}

function editForm(job, error) {
  return html`
    <form class="card edit-job" data-form="job" novalidate>
      <h2>Edit job</h2>
      <div class="fields">
        <div>
          <label class="label" for="ej-title">Job title</label>
          <input class="input" id="ej-title" name="title" value="${job.title}" maxlength="200" data-focus>
          <div class="field-error" id="ej-title-error" hidden>◇ Title is required.</div>
        </div>
        ${field('Company', 'company', job.company, { max: 200 })}
        ${field('Location', 'location', job.location, { max: 200 })}
        ${field('Job type', 'job_type', job.job_type, { max: 100 })}
        <div>
          <label class="label" for="ej-work_mode">Work mode</label>
          <select class="input" id="ej-work_mode" name="work_mode">
            <option value="">Not set</option>
            ${Object.entries(WORK_MODE).map(([k, v]) => html`<option value="${k}" ${job.work_mode === k ? 'selected' : ''}>${v}</option>`)}
          </select>
        </div>
        ${field('Source', 'source', job.source, { max: 100 })}
        ${field('Date found', 'found_on', job.found_on, { type: 'date' })}
        ${field('Closing date', 'closes_on', job.closes_on, { type: 'date' })}
        ${field('Job link', 'url', job.url, { wide: true, max: 2000 })}
        <div class="wide">
          <label class="label" for="ej-description">Description (paste the advert here)</label>
          <textarea class="input" id="ej-description" name="description" rows="8">${job.description}</textarea>
        </div>
        <div class="wide">
          <label class="label" for="ej-notes">General notes</label>
          <textarea class="input" id="ej-notes" name="notes" rows="4">${job.notes}</textarea>
        </div>
      </div>
      ${error ? html`<div class="field-error" role="alert">◇ ${error}</div>` : ''}
      <div class="row">
        <button type="submit" class="btn btn-primary">Save changes</button>
        <button type="button" class="btn btn-secondary" data-act="cancel-edit">Cancel</button>
      </div>
    </form>`;
}

function linkText(url) {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function details(job) {
  const safeLink = /^https?:\/\//i.test(job.url);
  return html`
    <div class="card">
      <h2>Details</h2>
      <div class="dl">
        <div><b>Job type</b>${job.job_type || 'Not set'}</div>
        <div><b>Location</b>${job.location || 'Not set'}</div>
        <div><b>Date found</b>${job.found_on ? formatDay(job.found_on) : 'Not set'}</div>
        <div><b>Job link</b>${safeLink ? html`<a class="link" href="${job.url}" target="_blank" rel="noopener noreferrer">${linkText(job.url)}</a>` : 'Not added yet'}</div>
      </div>
    </div>
    <div class="side-stack">
      <div class="card"><h2>General notes</h2>${job.notes ? html`<div class="pre">${job.notes}</div>` : html`<div class="text-muted">Not added yet</div>`}</div>
      <div class="card"><h2>Description</h2>${job.description ? html`<div class="pre">${job.description}</div>` : html`<div class="text-muted">Not added yet. Use Edit job to paste the advert here.</div>`}</div>
    </div>`;
}

export async function render(el, { params, stale }) {
  const id = Number(params.id);
  let data;
  try {
    data = await api(`/api/jobs/${id}`);
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`
      <a class="link back" href="#/jobs">← Jobs</a>
      <div class="card"><h2>Could not open this job</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;

  const state = { job: data.job, stages: data.stages, editing: false, form: null, error: '', busy: false, draft: null };
  document.title = `${state.job.title} · Shirube`;

  function draw() {
    const { job, stages, editing, form, error } = state;
    const today = todayISO();
    const last = stages.length ? Math.max(...stages.map((s) => s.id)) : null;

    el.innerHTML = html`
      <a class="link back" href="#/jobs">← Jobs</a>
      <div class="page-head detail-head">
        <div class="row">
          <div class="avatar big" aria-hidden="true">${initials(job.company || job.title)}</div>
          <div>
            ${job.company ? html`<div class="text-muted">${job.company}</div>` : ''}
            <h1>${job.title}</h1>
          </div>
        </div>
        <button type="button" class="btn btn-secondary" data-act="edit-job" ${editing ? 'disabled' : ''}>Edit job</button>
      </div>

      ${error && !editing ? html`<div class="card compact" role="alert">◇ ${error}</div>` : ''}

      <div class="grid-tiles tiles">
        <div class="tile"><span>Status</span><strong class="tile-value">${statusText(job.status)}</strong></div>
        <div class="tile"><span>Closes</span><strong class="tile-value">${job.closes_on ? formatDay(job.closes_on) : 'No date'}</strong></div>
        <div class="tile"><span>Work mode</span><strong class="tile-value">${WORK_MODE[job.work_mode] ?? 'Not set'}</strong></div>
        <div class="tile"><span>Source</span><strong class="tile-value">${job.source === 'manual' ? 'Added by hand' : job.source}</strong></div>
      </div>

      <div class="card section">
        <h2>Stages and notes</h2>
        <div class="stage-row">${stageRow(stages, today)}</div>
        ${form ? stageForm(form, stages) : ''}
      </div>

      <div class="card section">
        <h2>Outcome</h2>
        <div class="row outcome">
          <div class="chip-group" role="group" aria-label="Set the outcome">
            ${OUTCOMES.map((k) => html`<button type="button" class="chip" data-outcome="${k}" aria-pressed="${job.status === k}">${KIND[k].label}</button>`)}
          </div>
          <button type="button" class="btn btn-secondary undo" data-act="undo" ${last === null ? 'disabled' : ''}>Undo last step</button>
        </div>
      </div>

      ${editing
        ? editForm(state.draft ? { ...job, ...state.draft } : job, error)
        : html`<div class="grid-main-side section">${details(job)}</div>`}`;

    el.querySelector('[data-focus]')?.focus();
  }

  async function run(fn) {
    if (state.busy) return;
    state.busy = true;
    state.error = '';
    try {
      const result = await fn();
      if (stale()) return;
      if (result) { state.job = result.job; state.stages = result.stages; }
    } catch (err) {
      if (stale()) return;
      state.error = err.message;
    } finally {
      state.busy = false;
    }
    if (!stale()) draw();
  }

  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;

    if (t.dataset.stage) { state.form = { id: Number(t.dataset.stage) }; state.editing = false; state.error = ''; draw(); return; }
    if (t.dataset.new !== undefined) { state.form = { id: null, kind: t.dataset.new }; state.editing = false; state.error = ''; draw(); return; }

    if (t.dataset.outcome) {
      const kind = t.dataset.outcome;
      if (state.job.status === kind) return;
      const have = state.stages.find((s) => s.kind === kind);
      if (have) { state.form = { id: have.id }; state.editing = false; draw(); return; }
      run(() => api(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind, happened_on: todayISO() } }));
      return;
    }

    switch (t.dataset.act) {
      case 'edit-job': state.editing = true; state.draft = null; state.form = null; state.error = ''; draw(); break;
      case 'cancel-edit': state.editing = false; state.draft = null; state.error = ''; draw(); break;
      case 'cancel-stage': state.form = null; state.error = ''; draw(); break;
      case 'remove-stage':
        if (!confirm('Remove this stage?')) return;
        state.form = null;
        run(() => api(`/api/stages/${t.dataset.id}`, { method: 'DELETE' }));
        break;
      case 'undo': {
        const last = state.stages.reduce((a, b) => (b.id > a.id ? b : a));
        if (!confirm(`Remove the last step you added (${KIND[last.kind].label})?`)) return;
        state.form = null;
        run(() => api(`/api/stages/${last.id}`, { method: 'DELETE' }));
        break;
      }
      default:
    }
  };

  el.onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const values = Object.fromEntries(new FormData(f));

    if (f.dataset.form === 'stage') {
      const { form } = state;
      state.form = null;
      if (form.id) {
        run(() => api(`/api/stages/${form.id}`, { method: 'PATCH', body: { happened_on: values.happened_on, note: values.note } }));
      } else {
        const kind = form.kind || values.kind;
        run(() => api(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind, happened_on: values.happened_on, note: values.note } }));
      }
      return;
    }

    if (f.dataset.form === 'job') {
      if (!String(values.title ?? '').trim()) {
        const input = f.elements.title;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', 'ej-title-error');
        f.querySelector('#ej-title-error').hidden = false;
        input.focus();
        return;
      }
      run(async () => {
        const result = await api(`/api/jobs/${id}`, { method: 'PATCH', body: values });
        state.editing = false;
        state.draft = null;
        document.title = `${result.job.title} · Shirube`;
        return result;
      }).then(() => {
        // A failed save keeps the form open with the server's message.
        if (state.error && !stale()) { state.editing = true; state.draft = values; draw(); }
      });
    }
  };

  draw();
}
