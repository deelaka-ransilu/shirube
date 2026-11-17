import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { todayISO, formatDay, initials } from '../lib/format.js';
import { badgeText } from '../lib/status.js';
import { closeBadge } from '../lib/badges.js';
import { parseAdvert, parseJobTypes } from '../lib/parse-advert.js';
import { foundChips, closeChips, postedChips, appliedChips } from '../lib/quick-dates.js';
import { setTopAction } from '../lib/shell.js';

const WORK_MODES = [['onsite', 'On-site'], ['hybrid', 'Hybrid'], ['remote', 'Remote']];
const SOURCES = [['ITPro', 'ITPro'], ['TopJobs', 'TopJobs'], ['LinkedIn', 'LinkedIn'], ['Company site', 'Company site'], ['Referral', 'Referral'], ['__other', 'Other']];
const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'].map((t) => [t, t]);

// Small chips (28px). The picked one is filled and gets a check mark from the shared chip style.
function chips(name, labelId, options) {
  return html`<div class="chip-group" role="group" aria-labelledby="${labelId}" data-group="${name}">
    ${options.map(([value, label]) => html`<button type="button" class="chip sm" data-value="${value}" aria-pressed="false">${label}</button>`)}
  </div>`;
}

// Which state field each kind of date chip writes to.
const DATE_KEY = { found: 'found_on', posted: 'posted_on', closes: 'closes_on', applied: 'applied_on' };
const DATE_LIST = { found: foundChips, posted: postedChips, closes: closeChips, applied: appliedChips };

// Quick date chips plus "+ Pick a date". kind = 'found', 'posted', 'closes' or 'applied'.
// A picked date that is not one of the chips shows on the last chip.
function dateChips(kind, current) {
  const list = DATE_LIST[kind]();
  const custom = current !== '' && !list.some(([, v]) => v === current);
  return html`
    ${list.map(([label, value]) => {
      const on = value === current && (kind === 'closes' || value !== '');
      return html`<button type="button" class="chip sm" data-dk="${kind}" data-dv="${value}" aria-pressed="${on}">${on && value ? `${label} · ${formatDay(value)}` : label}</button>`;
    })}
    <span class="found-date">
      <button type="button" class="chip sm" data-pick-open="${kind}" aria-pressed="${custom}">${custom ? formatDay(current) : '+ Pick a date'}</button>
      <input type="date" class="found-date-input" data-pick="${kind}" tabindex="-1" aria-hidden="true" aria-label="Pick a date" value="${current}">
    </span>`;
}

export function render(el, { query = {} } = {}) {
  const state = { work_mode: '', source: '', job_type: [], found_on: todayISO(), posted_on: '', closes_on: '', applied_on: '' };
  const filled = {};   // what the last "Fill the fields" wrote, so a second paste can replace it but never your own edits
  let timer;

  el.innerHTML = html`
    <div class="addjob-page">
      <h1 class="sr-only">Add job</h1>
      <p class="text-muted aj-intro">Only the job title is required. Everything else is optional.</p>

      <form id="job-form" class="add-job" novalidate>
        <div class="col">
          <section class="card compact" aria-labelledby="h-paste">
            <h2 class="step" id="h-paste"><span class="step-num" aria-hidden="true">1</span>Paste the advert</h2>
            <div class="aj-paste">
              <div>
                <label class="label" for="paste">Job post text or link</label>
                <textarea class="input" id="paste" rows="2" placeholder="Paste the job description or the link here..."></textarea>
              </div>
              <div class="aj-fill">
                <button type="button" class="btn btn-secondary" id="fill">Fill the fields</button>
                <span class="text-sm" id="fill-msg" role="status">You check every field next.</span>
              </div>
            </div>
            <div class="aj-block aj-source-block">
              <span class="label" id="lbl-source">Source</span>
              <div class="aj-source">
                ${chips('source', 'lbl-source', SOURCES)}
                <input class="input aj-other" id="source-other" autocomplete="off" placeholder="Where did you find it?" aria-label="Where did you find it?" hidden>
              </div>
            </div>
          </section>

          <section class="card compact" aria-labelledby="h-details">
            <h2 class="step" id="h-details"><span class="step-num" aria-hidden="true">2</span>Check the details</h2>
            <div class="aj-fields">
              <div class="aj-wide">
                <label class="label" for="title">Job title (required)</label>
                <input class="input" id="title" autocomplete="off" placeholder="e.g. Junior DevOps Engineer" aria-describedby="title-error">
                <div class="field-error" id="title-error" hidden>◇ Title is required.</div>
              </div>
            </div>
            <div class="aj-fields aj-fields3">
              <div>
                <label class="label" for="company">Company</label>
                <input class="input" id="company" autocomplete="off" placeholder="e.g. Northwind Ltd">
              </div>
              <div>
                <label class="label" for="location">Location</label>
                <input class="input" id="location" autocomplete="off" placeholder="e.g. Colombo">
              </div>
              <div>
                <label class="label" for="url">Job link</label>
                <input class="input" id="url" type="url" autocomplete="off" placeholder="https://...">
              </div>
            </div>
            <div class="aj-pair">
              <div class="aj-block"><span class="label" id="lbl-mode">Work mode</span>${chips('work_mode', 'lbl-mode', WORK_MODES)}</div>
              <div class="aj-block"><span class="label" id="lbl-type">Job type (pick any that fit)</span>${chips('job_type', 'lbl-type', JOB_TYPES)}</div>
            </div>
          </section>

          <section class="card compact" aria-labelledby="h-dates">
            <h2 class="aj-h" id="h-dates">Dates</h2>
            <div class="aj-dates">
              <div class="aj-block"><span class="label" id="lbl-found">Date found</span><div class="chip-group" role="group" aria-labelledby="lbl-found" id="found-chips"></div></div>
              <div class="aj-block"><span class="label" id="lbl-closes">Closing date</span><div class="chip-group" role="group" aria-labelledby="lbl-closes" id="closes-chips"></div></div>
              <div class="aj-block"><span class="label" id="lbl-posted">Posted (when the company put it up)</span><div class="chip-group" role="group" aria-labelledby="lbl-posted" id="posted-chips"></div></div>
              <div class="aj-block"><span class="label" id="lbl-applied">Already applied? Pick the day</span><div class="chip-group" role="group" aria-labelledby="lbl-applied" id="applied-chips"></div></div>
            </div>
          </section>
        </div>

        <div class="col">
          <section class="card compact" aria-labelledby="h-preview">
            <h2 id="h-preview">How it will look</h2>
            <div class="inner-box" id="preview"></div>
          </section>

          <section class="card compact aj-notes" aria-labelledby="h-notes">
            <h2 class="step" id="h-notes"><span class="step-num" aria-hidden="true">3</span>Add your notes</h2>
            <label class="label" for="description">Description</label>
            <textarea class="input aj-desc" id="description" placeholder="Full job description from the advert..."></textarea>
            <label class="label" for="notes" style="margin-top: var(--space-3)">Notes</label>
            <textarea class="input" id="notes" rows="3" placeholder="Referrals, follow-up ideas, questions to ask..."></textarea>
          </section>

          <section class="card compact" id="dup" aria-live="polite" hidden></section>

          <div class="aj-foot">
            <div class="field-error" id="form-error" role="alert" hidden></div>
            <a class="btn btn-secondary" href="#/jobs">Cancel</a>
          </div>
        </div>
        <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
      </form>
    </div>`;

  // The one orange button lives in the top bar, outside this page, so its click is set on the new node itself.
  setTopAction(html`<button type="button" class="btn btn-primary" id="save">Save job</button>`);
  const saveBtn = typeof document === 'undefined' ? null : document.getElementById('save');

  const $ = (id) => el.querySelector('#' + id);
  const MODE_LABEL = Object.fromEntries(WORK_MODES);

  function readForm() {
    return {
      title: $('title').value.trim(),
      company: $('company').value.trim(),
      location: $('location').value.trim(),
      url: $('url').value.trim(),
      work_mode: state.work_mode,
      source: state.source === '__other' ? $('source-other').value.trim() : state.source,
      job_type: state.job_type.join(', '),
      found_on: state.found_on,
      posted_on: state.posted_on,
      closes_on: state.closes_on,
      applied_on: state.applied_on,
      description: $('description').value,
      notes: $('notes').value,
    };
  }

  function drawDates() {
    $('found-chips').innerHTML = dateChips('found', state.found_on);
    $('closes-chips').innerHTML = dateChips('closes', state.closes_on);
    $('posted-chips').innerHTML = dateChips('posted', state.posted_on);
    $('applied-chips').innerHTML = dateChips('applied', state.applied_on);
  }

  function updatePreview() {
    const f = readForm();
    $('preview').innerHTML = html`
      <div class="row">
        <div class="avatar" aria-hidden="true">${initials(f.company || f.title)}</div>
        <div>
          <div class="text-muted text-sm">${f.company || 'Company'}</div>
          <b class="${f.title ? '' : 'text-muted'}">${f.title || 'Job title'}</b>
        </div>
      </div>
      <div class="row-badges aj-badges">
        ${f.applied_on
          ? html`<span class="badge s-applied">${badgeText('applied')} ${formatDay(f.applied_on)}</span>`
          : html`<span class="badge b-open">${badgeText('open')}</span>`}
        ${f.work_mode ? html`<span class="badge b-mode">${MODE_LABEL[f.work_mode]}</span>` : ''}
        ${state.job_type.map((t) => html`<span class="badge b-type">${t}</span>`)}
        ${f.location ? html`<span class="badge b-loc">${f.location}</span>` : ''}
        ${f.posted_on ? html`<span class="badge b-date">Posted ${formatDay(f.posted_on)}</span>` : ''}
        ${f.applied_on ? '' : closeBadge(f.closes_on)}
      </div>`;
  }

  // Job type takes a list (a full-time internship is both); the other groups take one value.
  function selectChip(name, value) {
    state[name] = value;
    const group = el.querySelector(`[data-group="${name}"]`);
    group.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(Array.isArray(value) ? value.includes(c.dataset.value) : c.dataset.value === value)));
    if (name === 'source') $('source-other').hidden = value !== '__other';
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

  // Fill never overwrites what you typed: a field is replaced only when it is empty or still holds
  // what the last Fill wrote. A field the advert does not mention is cleared the same way.
  function put(key, next, current, write) {
    const mine = JSON.stringify(current) === JSON.stringify(filled[key]);
    const empty = Array.isArray(current) ? current.length === 0 : current === '';
    if (empty || mine) { write(next); filled[key] = next; }
  }

  function fill() {
    const pasted = $('paste').value.trim();
    const found = parseAdvert(pasted);
    const msg = $('fill-msg');
    const text = (id) => (value) => { $(id).value = value; };
    const date = (key) => (value) => { state[DATE_KEY[key]] = value; };
    const types = pasted && !found.onlyLink ? parseJobTypes(pasted) : [];

    if (found.onlyLink) {
      put('url', found.url ?? '', $('url').value, text('url'));
      msg.textContent = 'I saved the link only. Reading a link comes later: paste the advert text to fill more.';
    } else if (pasted) {
      put('title', found.title ?? '', $('title').value, text('title'));
      put('company', found.company ?? '', $('company').value, text('company'));
      put('location', found.location ?? '', $('location').value, text('location'));
      put('url', found.url ?? '', $('url').value, text('url'));
      put('work_mode', found.work_mode ?? '', state.work_mode, (v) => selectChip('work_mode', v));
      put('job_type', types, state.job_type, (v) => selectChip('job_type', v));
      put('closes_on', found.closes_on ?? '', state.closes_on, date('closes'));
      put('posted_on', found.posted_on ?? '', state.posted_on, date('posted'));
      put('applied_on', found.applied_on ?? '', state.applied_on, date('applied'));
      put('description', pasted, $('description').value.trim(), text('description'));
      drawDates();
      const count = ['title', 'company', 'location', 'url', 'work_mode', 'closes_on', 'posted_on', 'applied_on'].filter((k) => found[k]).length + (types.length ? 1 : 0);
      msg.textContent = count ? `Filled ${count} field${count === 1 ? '' : 's'}. Check each one.` : 'I could not find anything to fill. The text went into Description.';
    } else {
      msg.textContent = 'Paste the advert first.';
    }
    updatePreview();
    clearTimeout(timer);
    timer = setTimeout(checkDuplicate, 100);
  }

  async function save() {
    const f = readForm();
    $('form-error').hidden = true;
    if (!f.title) {
      $('title').setAttribute('aria-invalid', 'true');
      $('title-error').hidden = false;
      $('title').focus();
      return;
    }
    if (saveBtn) saveBtn.disabled = true;
    try {
      await api('/api/jobs', { method: 'POST', body: { ...f, source: f.source || 'manual' } });
      location.hash = '#/jobs';
    } catch (err) {
      $('form-error').textContent = err.message;
      $('form-error').hidden = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  el.onclick = (e) => {
    const chip = e.target.closest('.chip[data-value]');
    if (chip) {
      const name = chip.closest('[data-group]').dataset.group;
      const value = chip.dataset.value;
      if (name === 'job_type') selectChip(name, state.job_type.includes(value) ? state.job_type.filter((t) => t !== value) : JOB_TYPES.map(([t]) => t).filter((t) => t === value || state.job_type.includes(t)));
      else selectChip(name, state[name] === value ? '' : value);
      updatePreview();
      return;
    }
    const day = e.target.closest('[data-dk]');
    if (day) {
      const key = DATE_KEY[day.dataset.dk];
      // Posted and Applied have no "none" chip: pressing the picked day again clears it.
      const again = state[key] === day.dataset.dv && ['posted', 'applied'].includes(day.dataset.dk);
      state[key] = again ? '' : day.dataset.dv;
      drawDates();
      updatePreview();
      return;
    }
    const open = e.target.closest('[data-pick-open]');
    if (open) {
      const input = el.querySelector(`[data-pick="${open.dataset.pickOpen}"]`);
      try { input.showPicker(); } catch { input.focus(); input.click(); }
      return;
    }
    if (e.target.closest('#fill')) fill();
  };

  el.oninput = (e) => {
    const pick = e.target.closest?.('[data-pick]');
    if (pick) {
      if (pick.value) {
        state[DATE_KEY[pick.dataset.pick]] = pick.value;
        drawDates();
        updatePreview();
      }
      return;
    }
    updatePreview();
    if (e.target.id === 'title') { $('title').removeAttribute('aria-invalid'); $('title-error').hidden = true; }
    if (e.target.id === 'title' || e.target.id === 'company') {
      clearTimeout(timer);
      timer = setTimeout(checkDuplicate, 400);
    }
  };

  el.onsubmit = (e) => { e.preventDefault(); save(); };
  if (saveBtn) saveBtn.onclick = save;

  // "+ Paste a job link" on Found opens this page with #/jobs/new?url=... . Only a web link is accepted.
  try {
    if (query.url && ['http:', 'https:'].includes(new URL(query.url).protocol)) $('url').value = query.url;
  } catch { /* not a link: leave the field empty */ }

  drawDates();
  updatePreview();
}
