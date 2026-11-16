import { html, raw } from '../lib/html.js';
import { api } from '../lib/api.js';
import { STATUS, hasStatus, badgeText, nextStatuses } from '../lib/status.js';
import { closingWithDays, initials, todayISO } from '../lib/format.js';
import { MODE_LABEL } from '../lib/found-marker.js';
import { ICON } from '../lib/icons.js';
import { closeBadge } from '../lib/badges.js';
import { bindScroll } from '../lib/scroll.js';
import { setTopAction } from '../lib/shell.js';

const TILES = ['open', 'applied', 'interview', 'offer'];   // the four tiles are the stage filters
const OTHER_VIEWS = ['', 'reply', 'rejected'];             // All, Reply and Rejected sit in a line under the tiles

function jobsHash(status, q) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (q) p.set('q', q);
  const text = p.toString();
  return '#/jobs' + (text ? '?' + text : '');
}

// The stage: a small dropdown that moves the job forward (it adds a dated stage for today), or a plain badge at the end.
function stageCell(job) {
  const next = nextStatuses(job.status);
  if (!next.length) return html`<span class="badge b-${job.status}">${badgeText(job.status)}</span>`;
  return html`
    <label class="status-select">
      <span class="sr-only">Stage of ${job.title}</span>
      <select data-stage="${job.id}" data-current="${job.status}" data-title="${job.title}">
        <option value="${job.status}" selected>${badgeText(job.status)}</option>
        ${next.map((k) => html`<option value="${k}">→ ${badgeText(k)}</option>`)}
      </select>
    </label>`;
}

function row(job, today) {
  const name = job.company || job.title;
  return html`
    <div class="list-row row-click">
      <div class="avatar" aria-hidden="true">${initials(name)}</div>
      <div class="row-main">
        ${job.company ? html`<div class="text-muted">${job.company}</div>` : ''}
        <a class="row-title" href="#/jobs/${job.id}">${job.title}</a>
      </div>
      <div class="row-badges">
        ${job.location ? html`<span class="badge b-loc">${job.location}</span>` : ''}
        ${MODE_LABEL[job.work_mode] ? html`<span class="badge b-mode">${MODE_LABEL[job.work_mode]}</span>` : ''}
        ${closeBadge(job.closes_on, today, job.found_on)}
      </div>
      ${stageCell(job)}
      <div class="row-menu-wrap">
        <button type="button" class="btn btn-secondary icon-btn sm" data-menu aria-haspopup="menu" aria-expanded="false" aria-label="More for ${job.title}" title="More">${ICON.dots}</button>
        <div class="row-menu" role="menu" hidden>
          <button type="button" role="menuitem" class="menu-del" data-delete="${job.id}" data-title="${job.title}">${ICON.trash} Delete job</button>
        </div>
      </div>
    </div>`;
}

export async function render(el, ctx) {
  const { query, stale } = ctx;
  const status = hasStatus(query.status) ? query.status : '';
  const q = String(query.q ?? '').trim();

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);

  let data;
  try {
    data = await api('/api/jobs' + (params.size ? '?' + params : ''));
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`<div class="card"><h2>Could not load your jobs</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;

  const { jobs, counts, next_closing } = data;
  const today = todayISO();
  const countOf = (k) => (k ? counts[k] : counts.all);
  const viewName = status ? STATUS[status].label : 'All';

  let list;
  if (counts.all === 0) {
    list = html`<div class="empty"><h2>No jobs yet</h2><p class="text-muted">Add the first job you want to track.</p><a class="btn btn-secondary" href="#/jobs/new">Add a job</a></div>`;
  } else if (jobs.length === 0) {
    list = html`<div class="empty"><h2>Nothing matches</h2><p class="text-muted">Try another filter or search word.</p><a class="btn btn-secondary" href="#/jobs">Show all jobs</a></div>`;
  } else {
    list = html`
      <div class="scroll-wrap jobs-list-wrap">
        <div class="scroller" tabindex="0" role="region" aria-label="Your jobs">${jobs.map((j) => row(j, today))}</div>
        <div class="scroll-fade" aria-hidden="true"></div>
        <button type="button" class="more-pill" data-more hidden aria-label="Show more jobs"></button>
      </div>`;
  }

  el.innerHTML = html`
    <div class="jobs-page">
      <h1 class="sr-only">Jobs</h1>

      <div class="grid-tiles tiles sm" role="group" aria-label="Filter jobs by stage">
        ${TILES.map((k) => html`<button type="button" class="tile tile-btn" data-status="${k}" aria-pressed="${k === status}"><span>${STATUS[k].label}</span><strong>${counts[k]}</strong></button>`)}
      </div>

      <div class="jobs-views" role="group" aria-label="Other views">
        <b>Showing: ${viewName} (${countOf(status)})</b>
        ${OTHER_VIEWS.filter((k) => k !== status).map((k) => html`<button type="button" class="link-btn" data-status="${k}">${k ? STATUS[k].label : 'All'} (${countOf(k)})</button>`)}
      </div>
      ${q ? html`<p class="text-muted jobs-note">Results for “${q}”. <a class="link" href="${jobsHash(status, '')}">Clear search</a></p>` : ''}

      <div class="jobs-layout">
        <div class="card compact jobs-card">${list}</div>
        ${next_closing ? html`
          <div class="card compact jobs-closing">
            <span class="text-muted">Next closing</span>
            <a class="row-title" href="#/jobs/${next_closing.id}">${next_closing.title}</a>
            <span class="text-muted">${next_closing.company ? next_closing.company + ' · ' : ''}${closingWithDays(next_closing.closes_on, today)}</span>
          </div>` : ''}
      </div>
    </div>`;

  setTopAction(html`<a class="btn btn-primary" href="#/jobs/new">+ Add job</a>`);
  bindScroll(el.querySelector('.jobs-list-wrap'), '.list-row');
  if (ctx.keepTop) { const box = el.querySelector('.jobs-list-wrap .scroller'); if (box) box.scrollTop = ctx.keepTop; }

  const closeMenus = () => el.querySelectorAll('.row-menu:not([hidden])').forEach((m) => {
    m.hidden = true;
    m.parentElement.querySelector('[data-menu]')?.setAttribute('aria-expanded', 'false');
  });
  const redraw = () => {
    // Draw again but stay where the person was in the list.
    const keepTop = el.querySelector('.jobs-list-wrap .scroller')?.scrollTop ?? 0;
    if (!stale()) render(el, { ...ctx, keepTop });
  };

  el.onclick = async (e) => {
    const menuBtn = e.target.closest('[data-menu]');
    if (!menuBtn) closeMenus();

    const chip = e.target.closest('[data-status]');
    if (chip) {
      // Pressing the stage that is already showing goes back to All.
      const next = chip.dataset.status === status ? '' : chip.dataset.status;
      location.hash = jobsHash(next, q);
      return;
    }

    if (e.target.closest('[data-more]')) {
      const box = el.querySelector('.jobs-list-wrap .scroller');
      box?.scrollBy({ top: box.clientHeight * 0.8, behavior: 'smooth' });
      return;
    }

    if (menuBtn) {
      const menu = menuBtn.parentElement.querySelector('.row-menu');
      const wasOpen = !menu.hidden;
      closeMenus();
      if (wasOpen) return;
      menu.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
      // Open upwards when there is no room below inside the list.
      const box = el.querySelector('.jobs-list-wrap .scroller');
      const room = box ? box.getBoundingClientRect().bottom - menuBtn.getBoundingClientRect().bottom : 999;
      menu.classList.toggle('up', room < menu.offsetHeight + 12);
      menu.querySelector('button')?.focus();
      return;
    }

    const del = e.target.closest('[data-delete]');
    if (del) {
      closeMenus();
      if (!confirm(`Delete “${del.dataset.title}”? This cannot be undone.`)) return;
      del.disabled = true;
      try {
        await api(`/api/jobs/${del.dataset.delete}`, { method: 'DELETE' });
        window.dispatchEvent(new Event('followups-changed'));
      } catch (err) {
        alert(err.message);
      }
      redraw();
    }
  };

  el.onkeydown = (e) => {
    if (e.key === 'Escape' && el.querySelector('.row-menu:not([hidden])')) {
      const btn = el.querySelector('.row-menu:not([hidden])').parentElement.querySelector('[data-menu]');
      closeMenus();
      btn?.focus();
    }
  };

  // Move a job forward from the list: the same dated stage as in Job detail, dated today.
  el.onchange = async (e) => {
    const sel = e.target.closest('[data-stage]');
    if (!sel || sel.value === sel.dataset.current) return;
    sel.disabled = true;
    try {
      await api(`/api/jobs/${sel.dataset.stage}/stages`, { method: 'POST', body: { kind: sel.value, happened_on: todayISO() } });
      window.dispatchEvent(new Event('followups-changed'));
    } catch (err) {
      alert(err.message);
    }
    redraw();
  };
}
