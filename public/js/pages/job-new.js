import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { todayISO, formatDay, initials } from '../lib/format.js';
import { statusText } from '../lib/status.js';
import { parseAdvert } from '../lib/parse-advert.js';

const WORK_MODES = [['onsite', 'On-site'], ['hybrid', 'Hybrid'], ['remote', 'Remote']];
const SOURCES = [['ITPro', 'ITPro'], ['TopJobs', 'TopJobs'], ['LinkedIn', 'LinkedIn'], ['Company site', 'Company site'], ['Referral', 'Referral'], ['__other', 'Other']];
const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'].map((t) => [t, t]);

function chips(name, labelId, options) {
  return html`<div class="chip-group" role="group" aria-labelledby="${labelId}" data-group="${name}">
    ${options.map(([value, label]) => html`<button type="button" class="chip" data-value="${value}" aria-pressed="false">${label}</button>`)}
  </div>`;
}

export function render(el) {
  const state = { work_mode: '', source: '', job_type: '' };
  let timer;

  el.innerHTML = html`
    <div class="page-head">
      <div>
        <h1>Add job</h1>
        <p class="text-muted">Only the job title is required. Everything else is optional.</p>
      </div>
    </div>

    <form id="job-form" class="add-job" novalidate>
      <div class="col">
        <section class="card compact" aria-labelledby="h-paste">
          <h2 class="step" id="h-paste"><span class="step-num" aria-hidden="true">1</span>Paste the advert</h2>
          <label class="label" for="paste">Job post text or link</label>
          <textarea class="input" id="paste" rows="4" placeholder="Paste the job description or the link here..."></textarea>
          <div class="row" style="margin-top: var(--space-3)">
            <button type="button" class="btn btn-secondary" id="fill">Fill the fields</button>
            <span class="text-sm" id="fill-msg" role="status">You check every field next.</span>
          </div>
        </section>

        <section class="card compact" aria-labelledby="h-details">
          <h2 class="step" id="h-details"><span class="step-num" aria-hidden="true">2</span>Check the details</h2>
          <div class="fields">
            <div class="wide">
              <label class="label" for="title">Job title (required)</label>
              <input class="input" id="title" autocomplete="off" placeholder="e.g. Junior DevOps Engineer" aria-describedby="title-error">
              <div class="field-error" id="title-error" hidden>◇ Title is required.</div>
            </div>
            <div>
              <label class="label" for="company">Company</label>
              <input class="input" id="company" autocomplete="off" placeholder="e.g. Northwind Ltd">
            </div>
            <div>
              <label class="label" for="url">Job link</label>
              <input class="input" id="url" type="url" autocomplete="off" placeholder="https://...">
            </div>
            <div class="wide">
              <span class="label" id="lbl-mode">Work mode</span>
              ${chips('work_mode', 'lbl-mode', WORK_MODES)}
            </div>
            <div class="wide">
              <span class="label" id="lbl-source">Source</span>
              ${chips('source', 'lbl-source', SOURCES)}
              <div id="source-other-wrap" hidden style="margin-top: var(--space-2)">
                <label class="label" for="source-other">Where did you find it?</label>
                <input class="input" id="source-other" autocomplete="off">
              </div>
            </div>
            <div class="wide">
              <span class="label" id="lbl-type">Job type</span>
              ${chips('job_type', 'lbl-type', JOB_TYPES)}
            </div>
            <div>
              <label class="label" for="found">Date found</label>
              <input class="input" id="found" type="date" value="${todayISO()}">
            </div>
            <div>
              <label class="label" for="closes">Closing date (leave empty if none)</label>
              <input class="input" id="closes" type="date">
            </div>
          </div>
        </section>
      </div>

      <div class="col">
        <section class="card compact" aria-labelledby="h-preview">
          <h2 id="h-preview">How it will look</h2>
          <div class="inner-box" id="preview"></div>
        </section>

        <section class="card compact" aria-labelledby="h-notes">
          <h2 class="step" id="h-notes"><span class="step-num" aria-hidden="true">3</span>Add your notes</h2>
          <label class="label" for="description">Description</label>
          <textarea class="input" id="description" rows="5" placeholder="Full job description from the advert..."></textarea>
          <label class="label" for="notes" style="margin-top: var(--space-3)">Notes</label>
          <textarea class="input" id="notes" rows="3" placeholder="Referrals, follow-up ideas, questions to ask..."></textarea>
        </section>

        <section class="card compact" id="dup" aria-live="polite" hidden></section>

        <section class="card compact save-box">
          <div class="field-error" id="form-error" role="alert" hidden></div>
          <button type="submit" class="btn btn-primary" id="save">Save job</button>
          <a class="btn btn-secondary" href="#/jobs">Cancel</a>
        </section>
      </div>
    </form>`;

  const $ = (id) => el.querySelector('#' + id);
  const MODE_LABEL = Object.fromEntries(WORK_MODES);

  function readForm() {
    return {
      title: $('title').value.trim(),
      company: $('company').value.trim(),
      url: $('url').value.trim(),
      work_mode: state.work_mode,
      source: state.source === '__other' ? $('source-other').value.trim() : state.source,
      job_type: state.job_type,
      found_on: $('found').value,
      closes_on: $('closes').value,
      description: $('description').value,
      notes: $('notes').value,
    };
  }

  function updatePreview() {
    const f = readForm();
    $('preview').innerHTML = html`
      <div class="row">
        <div class="avatar" aria-hidden="true">${initials(f.company || f.title)}</div>
        <div>
          <b class="${f.title ? '' : 'text-muted'}">${f.title || 'Job title'}</b>
          <span class="text-muted">${f.company || 'Company'}</span>
        </div>
      </div>
      <div class="tags">
        <span class="tag">${statusText('open')}</span>
        ${f.work_mode ? html`<span class="tag">${MODE_LABEL[f.work_mode]}</span>` : ''}
        ${f.job_type ? html`<span class="tag">${f.job_type}</span>` : ''}
        ${f.closes_on ? html`<span class="tag">Closes ${formatDay(f.closes_on)}</span>` : ''}
      </div>`;
  }

  function selectChip(name, value) {
    state[name] = value;
    const group = el.querySelector(`[data-group="${name}"]`);
    group.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === value)));
    if (name === 'source') $('source-other-wrap').hidden = value !== '__other';
  }

  async function checkDuplicate() {
    if (!el.querySelector('#title')) return; // the person already left this page
    const { title, company } = readForm();
    const box = $('dup');
    if (!title) { box.hidden = true; return; }
    try {
      const { job } = await api(`/api/jobs/duplicate?title=${encodeURIComponent(title)}&company=${encodeURIComponent(company)}`);
      if (!el.contains(box)) return;
      if (!job) { box.hidden = true; return; }
      box.innerHTML = html`
        <h2>◇ Possible duplicate</h2>
        <p style="margin: 0 0 var(--space-3)">${job.company ? job.company + ' · ' : ''}${job.title} is already in your list, saved ${formatDay(job.created_at)}.</p>
        <a class="btn btn-secondary" href="#/jobs/${job.id}">Open the saved job</a>`;
      box.hidden = false;
    } catch { /* the warning is only a hint, so ignore errors */ }
  }

  function fill() {
    const found = parseAdvert($('paste').value);
    const msg = $('fill-msg');
    const setText = (id, value) => { if (value) $(id).value = value; };
    setText('title', found.title);
    setText('company', found.company);
    setText('url', found.url);
    setText('closes', found.closes_on);
    if (found.work_mode) selectChip('work_mode', found.work_mode);
    if (found.job_type) selectChip('job_type', found.job_type);
    if (found.onlyLink) {
      msg.textContent = 'I saved the link only. Reading a link comes later: paste the advert text to fill more.';
    } else if ($('paste').value.trim()) {
      if (!$('description').value.trim()) $('description').value = $('paste').value.trim();
      const count = Object.keys(found).length;
      msg.textContent = count ? `Filled ${count} field${count === 1 ? '' : 's'}. Check each one.` : 'I could not find anything to fill. The text went into Description.';
    } else {
      msg.textContent = 'Paste the advert first.';
    }
    updatePreview();
    clearTimeout(timer);
    timer = setTimeout(checkDuplicate, 100);
  }

  el.onclick = (e) => {
    const chip = e.target.closest('.chip[data-value]');
    if (chip) {
      const name = chip.closest('[data-group]').dataset.group;
      selectChip(name, state[name] === chip.dataset.value ? '' : chip.dataset.value);
      updatePreview();
      return;
    }
    if (e.target.closest('#fill')) fill();
  };

  el.oninput = (e) => {
    updatePreview();
    if (e.target.id === 'title') { $('title').removeAttribute('aria-invalid'); $('title-error').hidden = true; }
    if (e.target.id === 'title' || e.target.id === 'company') {
      clearTimeout(timer);
      timer = setTimeout(checkDuplicate, 400);
    }
  };

  el.onsubmit = async (e) => {
    e.preventDefault();
    const f = readForm();
    $('form-error').hidden = true;
    if (!f.title) {
      $('title').setAttribute('aria-invalid', 'true');
      $('title-error').hidden = false;
      $('title').focus();
      return;
    }
    $('save').disabled = true;
    try {
      await api('/api/jobs', { method: 'POST', body: { ...f, source: f.source || 'manual' } });
      location.hash = '#/jobs';
    } catch (err) {
      $('form-error').textContent = err.message;
      $('form-error').hidden = false;
      $('save').disabled = false;
    }
  };

  updatePreview();
}
