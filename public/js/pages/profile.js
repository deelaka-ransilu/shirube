// My profile: basics, settings, presets (skills, shown experience), education, experience, backup.
// Text typed into the main fields lives in the page until Save profile is pressed.
// Adding or editing an education or experience entry is saved at once (its own small form).
import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { initials, todayISO } from '../lib/format.js';

const BASICS = [
  ['name', 'Full name', 'Your name'],
  ['email', 'Email', 'name@example.com'],
  ['phone', 'Phone', '+94 ...'],
  ['location', 'Location', 'Colombo'],
  ['portfolio', 'Portfolio', 'https://...'],
  ['social', 'GitHub or LinkedIn', 'https://...'],
];

function period(start, end) {
  if (start && end) return `${start} to ${end}`;
  if (start) return `${start} to now`;
  return end || '';
}

function sub(...parts) {
  return parts.filter(Boolean).join(' · ');
}

function lines(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

export async function render(el, { stale }) {
  const data = await api('/api/profile');
  if (stale()) return;

  const state = {
    profile: data.profile, presets: data.presets, education: data.education, experience: data.experience,
    activeId: data.profile.active_preset_id ?? data.presets[0].id,
    form: null,        // { kind: 'preset' | 'skill' | 'edu' | 'exp', id, draft, error }
    status: '',        // line next to the Save button
    backup: '',        // line in the Backup card
    busy: false,
  };
  const active = () => state.presets.find((p) => p.id === state.activeId) ?? state.presets[0];

  function load(r) {
    state.profile = r.profile; state.presets = r.presets; state.education = r.education; state.experience = r.experience;
    state.activeId = r.profile.active_preset_id ?? r.presets[0].id;
  }

  // Keep what was typed (the small forms and the main fields) before drawing again.
  function collect() {
    el.querySelectorAll('[data-p]').forEach((i) => { state.profile[i.dataset.p] = i.value; });
    const p = active();
    el.querySelectorAll('[data-pp]').forEach((i) => { p[i.dataset.pp] = i.value; });
    const f = el.querySelector('form[data-form]');
    if (f && state.form && state.form.kind !== 'skill') state.form.draft = Object.fromEntries(new FormData(f));
  }

  // Bring in the server's lists without throwing away unsaved typing in presets.
  function merge(r, { activeId, showId } = {}) {
    const old = new Map(state.presets.map((p) => [p.id, p]));
    state.presets = r.presets.map((p) => old.get(p.id) ?? p);
    state.education = r.education;
    state.experience = r.experience;
    const ids = new Set(r.experience.map((x) => x.id));
    state.presets.forEach((p) => { p.experience_ids = p.experience_ids.filter((i) => ids.has(i)); });
    if (activeId) state.activeId = activeId;
    if (!state.presets.some((p) => p.id === state.activeId)) state.activeId = r.profile.active_preset_id ?? state.presets[0].id;
    if (showId && !active().experience_ids.includes(showId)) active().experience_ids.push(showId);
  }

  function field(label, id, value, attrs = '', ph = '') {
    return html`<div><label class="label" for="${id}">${label}</label><input class="input" id="${id}" value="${value}" placeholder="${ph}" ${raw(attrs)}></div>`;
  }

  function entryForm() {
    const { kind, id, draft, error } = state.form;
    if (kind === 'preset') {
      return html`
        <form class="inner-box" data-form="preset">
          <b>New preset</b>
          <div><label class="label" for="np-name">Preset name</label><input class="input" id="np-name" name="name" maxlength="60" placeholder="UI/UX designer" data-focus></div>
          ${error ? html`<div class="field-error" role="alert">◇ ${error}</div>` : ''}
          <div class="row"><button class="btn btn-primary" type="submit">Create preset</button><button class="btn btn-secondary" type="button" data-act="close-form">Cancel</button></div>
        </form>`;
    }
    const isEdu = kind === 'edu';
    const row = (isEdu ? state.education : state.experience).find((r) => r.id === id) ?? {};
    const v = (k) => (draft ? draft[k] ?? '' : row[k] ?? '');
    return html`
      <form class="inner-box" data-form="${kind}">
        <b>${id ? 'Edit' : 'Add'} ${isEdu ? 'education' : 'experience'}</b>
        <div class="fields">
          ${isEdu
            ? html`${field('School', 'f-school', v('school'), 'name="school" maxlength="200" data-focus')}
                   ${field('Qualification', 'f-qual', v('qualification'), 'name="qualification" maxlength="200"')}`
            : html`${field('Company', 'f-company', v('company'), 'name="company" maxlength="200" data-focus')}
                   ${field('Role', 'f-role', v('role'), 'name="role" maxlength="200"')}`}
          ${field('Start', 'f-start', v('start_date'), 'name="start_date" maxlength="20"', '2021')}
          ${field('End (empty = now)', 'f-end', v('end_date'), 'name="end_date" maxlength="20"', '2025')}
          <div class="wide">
            <label class="label" for="f-more">${isEdu ? 'Note' : 'Details'}</label>
            <textarea class="input" id="f-more" name="${isEdu ? 'note' : 'details'}" rows="${isEdu ? 2 : 4}">${isEdu ? v('note') : v('details')}</textarea>
          </div>
        </div>
        ${error ? html`<div class="field-error" role="alert">◇ ${error}</div>` : ''}
        <div class="row">
          <button class="btn btn-primary" type="submit">Save ${isEdu ? 'education' : 'experience'}</button>
          <button class="btn btn-secondary" type="button" data-act="close-form">Cancel</button>
          ${id ? html`<button class="btn btn-danger" type="button" data-act="delete-entry" data-kind="${kind}" data-id="${id}">Remove</button>` : ''}
        </div>
      </form>`;
  }

  function draw() {
    const p = active();
    const f = state.form;
    el.innerHTML = html`
      <div class="page-head">
        <div>
          <h1>My profile</h1>
          <p class="text-muted" role="status">${state.status}</p>
        </div>
        <button type="button" class="btn btn-primary" data-act="save" ${state.busy ? 'disabled' : ''}>Save profile</button>
      </div>

      <div class="card compact preset-bar">
        <b class="text-md">Role preset</b>
        <div class="chip-group" role="group" aria-label="Role preset">
          ${state.presets.map((x) => html`<button type="button" class="chip" data-preset="${x.id}" aria-pressed="${x.id === p.id}">${x.name}</button>`)}
        </div>
        <button type="button" class="btn btn-dashed" data-act="new-preset">+ New preset</button>
        <span class="text-muted text-sm preset-hint">Pick a preset to edit it. The one with ✓ is your main one.</span>
      </div>
      ${f?.kind === 'preset' ? html`<div class="section">${entryForm()}</div>` : ''}

      <div class="profile-grid section">
        <div class="col">
          <div class="card compact">
            <div class="fields3">
              ${BASICS.map(([key, label, ph]) => field(label, `p-${key}`, state.profile[key], `data-p="${key}" maxlength="2000"`, ph))}
              ${field('Preset name', 'pp-name', p.name, 'data-pp="name" maxlength="60"')}
              ${field('Target role', 'pp-role', p.target_role, 'data-pp="target_role" maxlength="200"', 'SRE / DevOps Engineer')}
            </div>
            <div class="mt">
              <label class="label" for="pp-summary">Summary (for this preset)</label>
              <textarea class="input" id="pp-summary" rows="3" data-pp="summary" maxlength="2000" placeholder="Two lines about you">${p.summary}</textarea>
            </div>
            ${state.presets.length > 1 ? html`<div class="mt"><button type="button" class="btn btn-danger" data-act="delete-preset">Delete this preset</button></div>` : ''}
          </div>

          <div class="card compact">
            <div class="card-head">
              <div><h2>Skills</h2><span class="text-muted text-sm">changes with the preset</span></div>
              <button type="button" class="btn btn-dashed" data-act="add-skill">+ Add skill</button>
            </div>
            <div class="skills">
              ${p.skills.length ? p.skills.map((s, i) => html`<span class="skill">${s}<button type="button" data-skill-remove="${i}" aria-label="Remove ${s}">×</button></span>`) : html`<span class="text-muted">No skills yet.</span>`}
            </div>
            ${f?.kind === 'skill' ? html`
              <form class="skill-form row" data-form="skill">
                <label class="sr-only" for="sk-new">New skill</label>
                <input class="input" id="sk-new" name="skill" maxlength="50" placeholder="Type a skill, press Enter" autocomplete="off" data-focus>
                <button class="btn btn-secondary" type="submit">Add</button>
                <button class="btn btn-secondary" type="button" data-act="close-form">Done</button>
              </form>` : ''}
          </div>

          <div class="card compact">
            <div class="card-head"><div><h2>Settings</h2></div></div>
            <div class="fields">
              <div><label class="label" for="s-days">Follow up after (days)</label><input class="input" id="s-days" type="number" min="1" max="365" value="${state.profile.follow_up_days}" data-p="follow_up_days"></div>
              ${field('Time zone', 's-tz', state.profile.time_zone, 'data-p="time_zone"')}
            </div>
          </div>
        </div>

        <div class="col">
          <div class="card compact">
            <div class="card-head">
              <div><h2>Education</h2><span class="text-muted text-sm">same for all presets</span></div>
              <button type="button" class="btn btn-dashed" data-act="add-edu">+ Add education</button>
            </div>
            ${f?.kind === 'edu' && !f.id ? entryForm() : ''}
            ${state.education.length ? state.education.map((r) => (f?.kind === 'edu' && f.id === r.id ? entryForm() : html`
              <div class="entry">
                <div class="entry-text"><b>${r.qualification || r.school}</b><span class="text-muted text-sm">${sub(r.qualification ? r.school : '', period(r.start_date, r.end_date))}</span></div>
                <button type="button" class="link-btn" data-edit="edu" data-id="${r.id}" aria-label="Edit ${r.qualification || r.school}">Edit</button>
              </div>`)) : (f?.kind === 'edu' ? '' : html`<div class="text-muted">Nothing added yet.</div>`)}
          </div>

          <div class="card compact">
            <div class="card-head">
              <div><h2>Experience</h2><span class="text-muted text-sm">choose what this preset shows</span></div>
              <button type="button" class="btn btn-dashed" data-act="add-exp">+ Add experience</button>
            </div>
            ${f?.kind === 'exp' && !f.id ? entryForm() : ''}
            ${state.experience.length ? state.experience.map((r) => {
              if (f?.kind === 'exp' && f.id === r.id) return entryForm();
              const shown = p.experience_ids.includes(r.id);
              return html`
                <div class="entry">
                  <div class="entry-text"><b>${r.role || r.company}</b><span class="text-muted text-sm">${sub(r.role ? r.company : '', period(r.start_date, r.end_date))}</span></div>
                  <button type="button" class="link-btn" data-edit="exp" data-id="${r.id}" aria-label="Edit ${r.role || r.company}">Edit</button>
                  <button type="button" class="shown" data-shown="${r.id}" aria-pressed="${shown}" aria-label="${r.role || r.company}: ${shown ? 'shown' : 'hidden'} in ${p.name}">${shown ? '✓ Shown' : '○ Hidden'}</button>
                </div>`;
            }) : (f?.kind === 'exp' ? '' : html`<div class="text-muted">Nothing added yet.</div>`)}
          </div>

          <div class="card compact">
            <div class="card-head"><div><h2>Backup</h2><span class="text-muted text-sm">your data stays on this laptop</span></div></div>
            <p class="text-muted">Save a copy of all your jobs, notes and profile.</p>
            <div class="row">
              <button type="button" class="btn btn-secondary" data-act="download">Download backup</button>
              <button type="button" class="btn btn-secondary" data-act="restore">Restore from a backup</button>
              <input type="file" id="restore-file" accept=".json,application/json" hidden>
            </div>
            <p class="text-sm" role="status">${state.backup}</p>
          </div>
        </div>
      </div>`;
    el.querySelector('[data-focus]')?.focus();
  }

  async function run(fn) {
    if (state.busy) return false;
    state.busy = true;
    try {
      await fn();
      return true;
    } catch (err) {
      if (!stale()) state.status = `◇ ${err.message}`;
      return false;
    } finally {
      state.busy = false;
    }
  }

  // Create/update/delete one small thing. Errors stay inside the open small form.
  async function entryCall(fn, after) {
    collect();
    const ok = await run(async () => { after(await fn()); });
    if (stale()) return;
    if (!ok && state.form) { state.form.error = state.status.replace(/^◇ /, ''); state.status = ''; }
    draw();
  }

  async function save() {
    collect();
    state.status = '';
    const body = {
      ...Object.fromEntries(['name', 'email', 'phone', 'location', 'portfolio', 'social', 'follow_up_days', 'time_zone'].map((k) => [k, state.profile[k]])),
      active_preset_id: state.activeId,
      presets: state.presets.map(({ id, name, target_role, summary, skills, experience_ids }) => ({ id, name, target_role, summary, skills, experience_ids })),
    };
    await run(async () => {
      const r = await api('/api/profile', { method: 'PATCH', body });
      if (stale()) return;
      load(r);
      state.status = '✓ Saved';
      window.dispatchEvent(new CustomEvent('profile-saved', { detail: { name: r.profile.name } }));
    });
    if (stale()) return;
    draw();
  }

  async function download() {
    state.backup = '';
    const ok = await run(async () => {
      const backup = await api('/api/backup');
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `shirube-backup-${todayISO()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      state.backup = `✓ Backup downloaded (${backup.tables.jobs.length} jobs).`;
    });
    if (!ok) { state.backup = state.status; state.status = ''; }
    if (!stale()) draw();
  }

  async function restore(file) {
    state.backup = '';
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      state.backup = '◇ That file is not a Shirube backup.';
      draw();
      return;
    }
    const n = Array.isArray(backup?.tables?.jobs) ? backup.tables.jobs.length : 0;
    if (!confirm(`Replace everything in Shirube with this backup (${n} jobs)?\n\nYour current jobs, notes and profile will be replaced. Download a backup first if you are not sure.`)) return;
    const ok = await run(async () => {
      await api('/api/restore', { method: 'POST', body: backup });
      load(await api('/api/profile'));
      state.form = null;
      state.backup = `✓ Restored ${n} jobs and your profile.`;
      window.dispatchEvent(new CustomEvent('profile-saved', { detail: { name: state.profile.name } }));
    });
    if (!ok) { state.backup = state.status; state.status = ''; }
    if (!stale()) draw();
  }

  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t || state.busy) return;

    if (t.dataset.preset) { collect(); state.activeId = Number(t.dataset.preset); state.status = ''; draw(); return; }
    if (t.dataset.shown) {
      collect();
      const ids = active().experience_ids;
      const id = Number(t.dataset.shown);
      active().experience_ids = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
      state.status = '';
      draw();
      return;
    }
    if (t.dataset.skillRemove !== undefined) { collect(); active().skills.splice(Number(t.dataset.skillRemove), 1); draw(); return; }
    if (t.dataset.edit) { collect(); state.form = { kind: t.dataset.edit, id: Number(t.dataset.id) }; draw(); return; }

    switch (t.dataset.act) {
      case 'save': save(); break;
      case 'new-preset': collect(); state.form = { kind: 'preset' }; draw(); break;
      case 'add-skill': collect(); state.form = { kind: 'skill' }; draw(); break;
      case 'add-edu': collect(); state.form = { kind: 'edu', id: null }; draw(); break;
      case 'add-exp': collect(); state.form = { kind: 'exp', id: null }; draw(); break;
      case 'close-form': collect(); state.form = null; draw(); break;
      case 'delete-preset': {
        const p = active();
        if (!confirm(`Delete the preset "${p.name}"? Its skills and shown experience are removed. Your jobs are not touched.`)) return;
        entryCall(() => api(`/api/presets/${p.id}`, { method: 'DELETE' }), (r) => {
          state.presets = state.presets.filter((x) => x.id !== p.id);
          merge(r);
          state.form = null;
        });
        break;
      }
      case 'delete-entry': {
        const { kind, id } = t.dataset;
        if (!confirm('Remove this entry from every preset?')) return;
        entryCall(() => api(`/api/${kind === 'edu' ? 'education' : 'experience'}/${id}`, { method: 'DELETE' }), (r) => { merge(r); state.form = null; });
        break;
      }
      case 'download': download(); break;
      case 'restore': el.querySelector('#restore-file').click(); break;
      default:
    }
  };

  el.onchange = (e) => {
    if (e.target.id !== 'restore-file') return;
    const file = e.target.files[0];
    e.target.value = '';
    if (file) restore(file);
  };

  el.onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const kind = f.dataset.form;
    const v = Object.fromEntries(new FormData(f));

    if (kind === 'skill') {
      const s = String(v.skill ?? '').trim().replace(/\s+/g, ' ');
      collect();
      const p = active();
      if (s && !p.skills.some((x) => x.toLowerCase() === s.toLowerCase())) p.skills.push(s);
      draw();
      return;
    }
    if (kind === 'preset') {
      entryCall(() => api('/api/presets', { method: 'POST', body: { name: v.name } }), (r) => {
        merge(r, { activeId: r.id });
        state.form = null;
      });
      return;
    }
    const isEdu = kind === 'edu';
    const id = state.form?.id;
    const path = `/api/${isEdu ? 'education' : 'experience'}`;
    entryCall(
      () => (id ? api(`${path}/${id}`, { method: 'PATCH', body: v }) : api(path, { method: 'POST', body: isEdu ? v : { ...v, show_in: state.activeId } })),
      (r) => { merge(r, { showId: !isEdu && !id ? r.id : null }); state.form = null; },
    );
  };

  draw();
}
