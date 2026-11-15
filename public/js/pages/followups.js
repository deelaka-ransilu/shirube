import { html } from '../lib/html.js';
import { bindScroll } from '../lib/scroll.js';
import { api } from '../lib/api.js';
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
const ADD_KINDS = ['follow_up', 'reply', 'interview', 'offer', 'rejected', 'other'];

const state = { data: null, openId: null, error: '' };

// The follow-up state under the Applied stage (waiting column only): a small badge, always a word.
function followLine(f) {
  if (!f) return '';
  if (f.state === 'overdue') return html`<div class="fu-line"><span class="badge b-overdue">◇ Overdue · due ${formatDay(f.due_on)}</span></div>`;
  if (f.state === 'today') return html`<div class="fu-line"><span class="badge">□ Due today</span></div>`;
  return html`<div class="fu-line"><span class="badge b-none">Follow up ${formatDay(f.due_on)}</span></div>`;
}

function stageRow(s, today) {
  const k = KIND[s.kind] ?? KIND.other;
  const planned = s.happened_on && s.happened_on > today;
  return html`
    <div class="fu-stage">
      <div class="fu-stage-head"><span aria-hidden="true">${k.symbol}</span> <b>${k.label}</b>
        <span class="text-muted"> · ${s.happened_on ? formatDay(s.happened_on) : 'No date'}${planned ? ' · Planned' : ''}</span></div>
      ${s.note ? html`<div class="fu-note text-muted text-sm">${s.note}</div>` : ''}
    </div>`;
}

function addForm(job) {
  return html`
    <form class="fu-form inner-box" data-job="${job.id}" novalidate>
      <div class="fields">
        <div>
          <label class="label" for="fu-kind-${job.id}">Stage</label>
          <select class="input" id="fu-kind-${job.id}" name="kind" data-focus>
            ${ADD_KINDS.map((k) => html`<option value="${k}">${KIND[k].symbol} ${KIND[k].label}</option>`)}
          </select>
        </div>
        <div>
          <label class="label" for="fu-date-${job.id}">Date</label>
          <input class="input" type="date" id="fu-date-${job.id}" name="happened_on" value="${todayISO()}">
        </div>
      </div>
      <div>
        <label class="label" for="fu-note-${job.id}">Note (optional)</label>
        <input class="input" id="fu-note-${job.id}" name="note" maxlength="2000" autocomplete="off">
      </div>
      ${state.error ? html`<p class="field-error" role="alert">◇ ${state.error}</p>` : ''}
      <div class="row">
        <button class="btn btn-secondary" type="submit">Save</button>
        <button class="link-btn" type="button" data-cancel>Cancel</button>
      </div>
    </form>`;
}

function jobCard(job, colKey, today) {
  const f = job.follow_up;
  const hasReply = job.stages.some((s) => s.kind === 'reply');
  return html`
    <article class="card compact fu-card row-click">
      <div class="row fu-who">
        <div class="avatar" aria-hidden="true">${initials(job.company || job.title)}</div>
        <div class="row-main">
          <div class="text-muted text-sm">${job.company || ''}</div>
          <a class="row-title" href="#/jobs/${job.id}">${job.title}</a>
        </div>
      </div>
      <div class="fu-stages">
        ${job.stages.map((s) => stageRow(s, today))}
        ${colKey === 'waiting' && !hasReply ? html`<div class="fu-stage text-muted"><div class="fu-stage-head">○ Reply · Not yet</div></div>` : ''}
        ${colKey === 'waiting' ? followLine(f) : ''}
      </div>
      ${state.openId === job.id ? addForm(job) : ''}
      <div class="fu-foot">
        <button class="link-btn" type="button" data-add="${job.id}">${state.openId === job.id ? '− Close' : '+ Add stage or note'}</button>
        ${f?.due ? html`<button class="chip sm" type="button" data-today="${job.id}">Followed up today</button>` : ''}
      </div>
    </article>`;
}

const EMPTY = {
  waiting: 'Nothing waiting. Jobs you applied to and have not heard back from show here.',
  talks: 'No replies or interviews yet.',
  offer: 'No offers yet.',
  closed: 'No closed jobs.',
};

function column(col, today) {
  const all = col.jobs.length;
  return html`
    <section class="fu-col" aria-label="${col.title}">
      <div class="card compact fu-colhead"><b>${col.symbol} ${col.title}</b><span>${all}</span></div>
      <div class="scroll-wrap">
        <div class="scroller" data-col="${col.key}" tabindex="0" role="region" aria-label="${col.title}, ${all} job${all === 1 ? '' : 's'}">
          ${all ? col.jobs.map((j) => jobCard(j, col.key, today)) : html`<p class="text-muted text-sm fu-empty">${EMPTY[col.key]}</p>`}
        </div>
        <div class="scroll-fade" aria-hidden="true"></div>
        <button type="button" class="more-pill" data-more hidden aria-label="Show more in ${col.title}"></button>
      </div>
    </section>`;
}

export async function render(el, { stale }) {
  state.openId = null; state.error = '';

  async function load() {
    state.data = await api('/api/followups');
  }

  function draw() {
    const { columns, today, due } = state.data;
    const total = columns.reduce((n, c) => n + c.jobs.length, 0);
    // A redraw rebuilds the columns, so remember where each one was scrolled.
    const tops = {};
    el.querySelectorAll('.fu-col .scroller').forEach((box) => { tops[box.dataset.col] = box.scrollTop; });
    el.innerHTML = html`
      <div class="fu-page">
        <h1 class="sr-only">Applied jobs</h1>
        <p class="text-muted fu-intro">Every job you applied to, and what happened at each stage.${due ? ` ${due} follow-up${due === 1 ? '' : 's'} due.` : ''}</p>
        ${total === 0
          ? html`<div class="card empty"><h2>No applications yet</h2><p class="text-muted">Open a job and mark it Applied. It shows up here and waits for your follow-up.</p></div>`
          : html`<div class="fu-grid">${columns.map((c) => column(c, today))}</div>`}
      </div>`;
    el.querySelectorAll('.fu-col .scroller').forEach((box) => { box.scrollTop = tops[box.dataset.col] ?? 0; });
    el.querySelectorAll('.scroll-wrap').forEach((wrap) => bindScroll(wrap, '.fu-card'));
    // A form that just opened: show all of it inside its column, then focus the first field.
    el.querySelector('.fu-form')?.scrollIntoView({ block: 'nearest' });
    el.querySelector('[data-focus]')?.focus({ preventScroll: true });
  }

  async function reload() {
    try { await load(); } catch (err) { state.error = err.message; }
    window.dispatchEvent(new Event('followups-changed'));
    draw();
  }

  async function addStage(id, body) {
    try {
      await api(`/api/jobs/${id}/stages`, { method: 'POST', body });
      state.openId = null; state.error = '';
    } catch (err) {
      state.error = err.message;
    }
    await reload();
  }

  try {
    await load();
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`<div class="card"><h2>Could not load follow-ups</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;
  draw();

  el.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.more !== undefined) {
      const box = t.closest('.scroll-wrap')?.querySelector('.scroller');
      box?.scrollBy({ top: box.clientHeight * 0.8, behavior: 'smooth' });
    } else if (t.dataset.add !== undefined) {
      const id = Number(t.dataset.add);
      state.openId = state.openId === id ? null : id;
      state.error = '';
      draw();
    } else if (t.dataset.cancel !== undefined) {
      state.openId = null; state.error = '';
      draw();
    } else if (t.dataset.today !== undefined) {
      addStage(Number(t.dataset.today), { kind: 'follow_up', happened_on: todayISO() });
    }
  };

  el.onsubmit = (e) => {
    const form = e.target.closest('form[data-job]');
    if (!form) return;
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    addStage(Number(form.dataset.job), { kind: values.kind, happened_on: values.happened_on, note: values.note ?? '' });
  };
}
