import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { STATUS, hasStatus, statusText } from '../lib/status.js';
import { formatDay, initials, todayISO } from '../lib/format.js';
import { ICON } from '../lib/icons.js';
import { bindScroll } from '../lib/scroll.js';
import { closeBadge } from '../lib/badges.js';
import { cvPaper, matchLine } from '../lib/cv-paper.js';
import { printCv } from '../lib/print-cv.js';
import { setTopAction } from '../lib/shell.js';

const KIND = {
  applied:   { label: 'Applied',   symbol: '●' },
  follow_up: { label: 'Follow-up', symbol: '□' },
  reply:     { label: 'Reply',     symbol: '○' },
  interview: { label: 'Interview', symbol: '■' },
  offer:     { label: 'Offer',     symbol: '◆' },
  rejected:  { label: 'Rejected',  symbol: '▲' },
  other:     { label: 'Other',     symbol: '•' },
};
const SLOTS = ['applied', 'reply', 'interview', 'offer'];   // the slim row; follow-ups, Rejected and Other are added after it
const WORK_MODE = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };

// Each stage has its own colour. Always paired with its word; stages not reached yet stay grey.
const TINT = { applied: 'blue', reply: 'green', interview: 'lilac', offer: 'yellow', follow_up: 'peach' };
const tintAttr = (key) => (TINT[key] ? raw(`data-tint="${TINT[key]}"`) : '');
const kindBadge = (kind) => html`<span class="badge s-${kind}">${KIND[kind].label}</span>`;

// The slim stage row. A reached stage is filled and shows its date (click to change the date or add a note).
// A stage not reached yet is dashed: one click marks it for today.
function stagePill(s, today) {
  const due = s.kind === 'follow_up' && s.happened_on > today;
  return html`
    <button type="button" class="stage-pill" ${tintAttr(s.kind)} data-stage="${s.id}" title="${s.note || 'Change the date or add a note'}">
      <span class="sp-name"><span aria-hidden="true">${KIND[s.kind].symbol}</span> ${KIND[s.kind].label}</span>
      <small>${s.happened_on ? formatDay(s.happened_on) : 'No date'}${due ? ' · Due' : ''}</small>
    </button>`;
}

function pendingPill(kind) {
  return html`
    <button type="button" class="stage-pill pending" data-new="${kind}" title="Mark ${KIND[kind].label} for today">
      <span class="sp-name"><span aria-hidden="true">${KIND[kind].symbol}</span> ${KIND[kind].label}</span>
      <small>Not yet</small>
    </button>`;
}

function stageRow(stages, today) {
  const pills = [];
  for (const kind of SLOTS) {
    const mine = stages.filter((s) => s.kind === kind);
    if (mine.length) mine.forEach((s) => pills.push(stagePill(s, today)));
    else pills.push(pendingPill(kind));
  }
  stages.filter((s) => !SLOTS.includes(s.kind)).forEach((s) => pills.push(stagePill(s, today)));
  return pills;
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
        ${field('Posted date', 'posted_on', job.posted_on, { type: 'date' })}
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

function scrollBox(content) {
  return html`<div class="scroll-wrap jd-scroll"><div class="scroller">${content}</div><div class="scroll-fade"></div></div>`;
}

function detailBadges(job) {
  return html`
    ${String(job.job_type ?? '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => html`<span class="badge b-type">${t}</span>`)}
    ${job.location ? html`<span class="badge b-loc">${job.location}</span>` : ''}
    ${job.posted_on ? html`<span class="badge b-date">Posted ${formatDay(job.posted_on)}</span>` : ''}
    ${job.found_on ? html`<span class="badge b-date">Found ${formatDay(job.found_on)}</span>` : ''}`;
}

// The notes box opens in a small dialog (the Notes button beside Edit and Delete). It saves by itself.
function notesDialog(job) {
  return html`
    <div class="pf-modal"><div class="pf-dialog" role="dialog" aria-modal="true" aria-label="Notes">
      <div class="inner-box nt-box">
        <div class="row jd-notes-head"><h2>Notes</h2><span class="jd-saved text-muted" id="notes-state" aria-live="polite"></span><button type="button" class="btn btn-secondary" data-act="close-notes">Close</button></div>
        <textarea class="input jd-notes-box" id="job-notes" aria-label="Notes for this job" maxlength="20000" placeholder="Add a note…" data-focus>${job.notes}</textarea>
      </div>
    </div></div>`;
}

function cvPane(job, cv, mark) {
  if (!cv) return html`<p class="text-muted">Could not load your CV. Refresh the page to try again.</p>`;
  const empty = !cv.person.name && !cv.preset.id;
  if (empty) {
    return html`<p class="text-muted">Your CV is empty. Fill in <a class="link" href="#/profile">My profile</a> and it shows here, built for each job.</p>`;
  }
  const line = matchLine(cv);
  return html`
    <div class="jd-aside-head">
      <h2>CV for this job</h2>
      ${cv.presets.length > 1
        ? html`<select class="input cv-select" id="cv-preset" aria-label="CV preset">${cv.presets.map((p) => html`<option value="${p.id}" ${p.id === cv.preset.id ? 'selected' : ''}>${p.name}${p.id === cv.best_preset_id ? ' · best match' : ''}</option>`)}</select>`
        : html`<span class="text-muted text-sm">${cv.preset.name}</span>`}
    </div>
    <div class="cv-strip">
      <span>${line.text}</span>
      ${job.description ? html`<a class="link text-sm" href="#/jobs/${job.id}/match">More details</a>` : ''}
    </div>
    <div class="cv-strip cv-actions">
      ${line.hasMatch ? html`
        <button type="button" class="chip sm" data-act="mark" aria-pressed="${mark}">Mark matches</button>
        ${mark ? html`<span class="text-muted text-sm">Highlighted skills are the ones this advert asks for.</span>` : ''}` : ''}
      <span class="cv-export">
        <span class="text-muted text-sm">Download clean CV</span>
        <button type="button" class="chip sm" data-act="cv-pdf" title="Opens the print window: choose Save as PDF">${ICON.download} PDF</button>
        <a class="chip sm" href="/api/jobs/${job.id}/cv.docx?preset=${cv.preset.id ?? ''}" download title="Word file, no highlight">${ICON.download} Word</a>
      </span>
    </div>
    <div class="cv-scroll" tabindex="0" role="region" aria-label="CV preview">${cvPaper(cv, { mark })}</div>`;
}

function details(state) {
  const { job, cv, mark } = state;
  return html`
    <div class="card">
      <h2>Description</h2>
      ${job.description ? scrollBox(html`<div class="pre">${job.description}</div>`) : html`<div class="text-muted">Not added yet. Use Edit job to paste the advert here.</div>`}
    </div>
    <div class="side-stack jd-side">
      <div class="card jd-aside">
        ${cvPane(job, cv, mark)}
      </div>
    </div>`;
}

export async function render(el, { params, stale }) {
  const id = Number(params.id);
  let data;
  const cvRequest = api(`/api/jobs/${id}/match`).catch(() => null); // the CV panel must never stop the page from opening
  try {
    data = await api(`/api/jobs/${id}`);
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`
      <a class="link back" href="#/jobs">← Jobs</a>
      <div class="card"><h2>Could not open this job</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  const cv = await cvRequest;
  if (stale()) return;

  const state = { job: data.job, stages: data.stages, editing: false, form: null, error: '', busy: false, draft: null, cv, notesOpen: false, mark: true, presetId: null };
  document.title = `${state.job.title} · Shirube`;

  function draw() {
    const { job, stages, editing, form, error } = state;
    const today = todayISO();
    const last = stages.length ? Math.max(...stages.map((s) => s.id)) : null;
    const hasNote = job.notes.trim() !== '';
    const safeLink = /^https?:\/\//i.test(job.url);

    el.innerHTML = html`
      <div class="jd-page${editing ? ' is-editing' : ''}">
      <div class="jd-head">
        <a class="btn btn-secondary icon-btn md back-btn" href="#/jobs" aria-label="Back to Jobs" title="Back to Jobs">${ICON.back}</a>
        <div class="avatar big" aria-hidden="true">${initials(job.company || job.title)}</div>
        <div class="jd-title">
          ${job.company ? html`<div class="text-muted">${job.company}</div>` : ''}
          <h1>${job.title}</h1>
          <div class="found-badges">
            <span class="badge s-${job.status}">${hasStatus(job.status) ? STATUS[job.status].label : job.status}</span>
            ${closeBadge(job.closes_on)}
            ${WORK_MODE[job.work_mode] ? html`<span class="badge b-mode">${WORK_MODE[job.work_mode]}</span>` : ''}
            ${detailBadges(job)}
            <span class="badge">${job.source === 'manual' ? 'Added by hand' : job.source}</span>
          </div>
        </div>
        <div class="jd-actions">
          ${safeLink ? html`<a class="btn btn-secondary jd-advert" href="${job.url}" target="_blank" rel="noopener noreferrer" title="${job.url}">${ICON.open}<span>Open advert</span></a>` : ''}
          <button type="button" class="btn btn-secondary icon-btn md notes-btn" data-act="open-notes" aria-label="${hasNote ? 'Notes (this job has a note)' : 'Notes'}" title="${hasNote ? 'Notes (this job has a note)' : 'Notes'}" ${editing ? 'disabled' : ''}>${ICON.note}${hasNote ? html`<span class="notes-dot" aria-hidden="true"></span>` : ''}</button>
          <button type="button" class="btn btn-secondary icon-btn md" data-act="edit-job" aria-label="Edit job" title="Edit job" ${editing ? 'disabled' : ''}>${ICON.edit}</button>
          <div class="row-menu-wrap">
            <button type="button" class="btn btn-secondary icon-btn md" data-act="menu" aria-haspopup="menu" aria-expanded="false" aria-label="More" title="More" ${editing ? 'disabled' : ''}>${ICON.dots}</button>
            <div class="row-menu" role="menu" hidden>
              <button type="button" role="menuitem" class="menu-del" data-act="delete-job">${ICON.trash} Delete job</button>
            </div>
          </div>
        </div>
      </div>

      ${error && !editing ? html`<div class="card compact" role="alert">◇ ${error}</div>` : ''}

      <div class="card jd-stages">
        <span class="jd-stages-label text-muted">Stages</span>
        <div class="stage-row">${stageRow(stages, today)}</div>
        <button type="button" class="btn btn-secondary jd-addstage" data-new="">+ Add stage</button>
        <button type="button" class="btn btn-secondary icon-btn md undo" data-act="undo" aria-label="Undo last step" title="Undo last step" ${last === null ? 'disabled' : ''}>${ICON.undo}</button>
        ${form ? html`<div class="jd-stage-form">${stageForm(form, stages)}</div>` : ''}
      </div>

      ${editing
        ? editForm(state.draft ? { ...job, ...state.draft } : job, error)
        : html`<div class="grid-main-side section">${details(state)}</div>`}
      ${state.notesOpen ? notesDialog(job) : ''}
      </div>`;

    el.querySelectorAll('.scroll-wrap').forEach((w) => bindScroll(w, '.pre'));

    // The one orange button of this screen: mark the job applied (today), until it is.
    if (job.status === 'open' && !editing) {
      setTopAction(html`<button type="button" class="btn btn-primary" id="mark-applied">Mark applied</button>`);
      const btn = document.getElementById('mark-applied');
      if (btn) btn.onclick = markApplied;
    } else {
      setTopAction('');
    }
    el.querySelector('[data-focus]')?.focus();
  }

  // Draw again but stay where the person was on the page (the preset menu).
  function redraw() {
    const top = el.scrollTop;
    draw();
    el.scrollTop = top;
  }

  // Read the CV again, for the preset the person picked (or the main one).
  async function loadCv() {
    try {
      state.cv = await api(`/api/jobs/${id}/match` + (state.presetId ? `?preset=${state.presetId}` : ''));
    } catch {
      state.cv = null;
    }
  }

  async function run(fn) {
    if (state.busy) return;
    state.busy = true;
    state.error = '';
    try {
      const result = await fn();
      if (stale()) return;
      if (result) { state.job = result.job; state.stages = result.stages; }
      window.dispatchEvent(new Event('followups-changed'));   // the bell may have a different count now
    } catch (err) {
      if (stale()) return;
      state.error = err.message;
    } finally {
      state.busy = false;
    }
    if (!stale()) draw();
  }

  // Save the notes text. With no status tag (the dialog is already closed) a failure shows in the page banner.
  async function saveNotes(text, tag) {
    state.job = { ...state.job, notes: text }; // keep it if the page redraws before the save finishes
    if (tag) tag.textContent = 'Saving…';
    try {
      const result = await api(`/api/jobs/${id}`, { method: 'PATCH', body: { notes: text } });
      if (stale()) return;
      state.job = result.job;
      if (tag) tag.textContent = '✓ Saved';
    } catch (err) {
      if (stale()) return;
      if (tag) tag.textContent = `◇ ${err.message}`;
      else { state.error = err.message; draw(); }
    }
  }

  function openNotes() {
    state.notesOpen = true;
    state.error = '';
    draw();
    const box = el.querySelector('#job-notes');
    if (box) box.setSelectionRange(box.value.length, box.value.length);
  }

  function closeNotes() {
    const box = el.querySelector('#job-notes');
    if (box && box.value !== state.job.notes) saveNotes(box.value, null); // typed but not saved yet (for example Escape)
    state.notesOpen = false;
    draw();
  }

  function markApplied() {
    if (state.job.status !== 'open') return;
    run(() => api(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind: 'applied', happened_on: todayISO() } }));
  }

  const closeMenu = () => el.querySelectorAll('.row-menu:not([hidden])').forEach((m) => {
    m.hidden = true;
    m.parentElement.querySelector('[data-act="menu"]')?.setAttribute('aria-expanded', 'false');
  });

  el.onkeydown = (e) => {
    if (e.key !== 'Escape') return;
    if (state.notesOpen) { closeNotes(); return; }
    const open = el.querySelector('.row-menu:not([hidden])');
    if (open) { const btn = open.parentElement.querySelector('[data-act="menu"]'); closeMenu(); btn?.focus(); }
  };

  el.onclick = (e) => {
    if (e.target.classList?.contains('pf-modal') && state.notesOpen) { closeNotes(); return; }
    if (!e.target.closest('.row-menu-wrap')) closeMenu();
    const t = e.target.closest('button');
    if (!t) return;

    if (t.dataset.act === 'menu') {
      const menu = t.parentElement.querySelector('.row-menu');
      const wasOpen = !menu.hidden;
      closeMenu();
      if (!wasOpen) { menu.hidden = false; t.setAttribute('aria-expanded', 'true'); menu.querySelector('button')?.focus(); }
      return;
    }
    if (t.dataset.act === 'open-notes') { openNotes(); return; }
    if (t.dataset.act === 'close-notes') { closeNotes(); return; }

    if (t.dataset.act === 'mark') { state.mark = !state.mark; redraw(); return; }
    if (t.dataset.act === 'cv-pdf') { if (state.cv) printCv(state.cv); return; }

    if (t.dataset.stage) { state.form = { id: Number(t.dataset.stage) }; state.editing = false; state.error = ''; draw(); return; }
    if (t.dataset.new !== undefined) {
      if (t.dataset.new) {
        // A step not reached yet: one click marks it for today. The date and a note can be changed after.
        run(() => api(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind: t.dataset.new, happened_on: todayISO() } }));
      } else {
        state.form = { id: null, kind: '' }; state.editing = false; state.error = ''; draw();
      }
      return;
    }

    switch (t.dataset.act) {
      case 'edit-job': state.editing = true; state.draft = null; state.form = null; state.error = ''; draw(); break;
      case 'delete-job':
        closeMenu();
        if (!confirm(`Delete “${state.job.title}”? This cannot be undone.`)) return;
        run(async () => {
          await api(`/api/jobs/${id}`, { method: 'DELETE' });
          location.hash = '#/jobs';
        });
        break;
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

  el.onchange = async (e) => {
    if (e.target.id === 'cv-preset') {
      state.presetId = Number(e.target.value);
      await loadCv();
      if (!stale()) redraw();
      return;
    }
    if (e.target.id !== 'job-notes') return;
    await saveNotes(e.target.value, el.querySelector('#notes-state'));
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
        if (state.error && !stale()) { state.editing = true; state.draft = values; draw(); return; }
        // The advert may have changed, so read the match again.
        if (!stale()) loadCv().then(() => { if (!stale()) redraw(); });
      });
    }
  };

  draw();
}
