// The bell in the top bar opens a small card over the page (on every screen) with the follow-ups that are due.
// It never changes the page behind it. The pure helpers at the top are tested; initBell() needs a browser page.
import { html } from './html.js';
import { api } from './api.js';
import { initials } from './format.js';

export const SHOW = 5;

// Whole days between two YYYY-MM-DD dates (later minus earlier).
function dayGap(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function dueText(followUp, today) {
  if (followUp.state === 'today') return 'Due today';
  const n = dayGap(followUp.due_on, today);
  return `${n} day${n === 1 ? '' : 's'} overdue`;
}

// The Applied-and-waiting jobs whose follow-up is due, most overdue first (the server already sorts them).
export function dueJobs(data) {
  const waiting = data.columns.find((c) => c.key === 'waiting');
  return (waiting?.jobs ?? []).filter((j) => j.follow_up?.due);
}

export function bellHtml(data) {
  const jobs = dueJobs(data);
  const shown = jobs.slice(0, SHOW);
  return html`
    <div class="bp-head"><b>Follow-ups due</b><span class="text-muted text-sm">${jobs.length}</span></div>
    ${jobs.length
      ? html`<div class="bp-list">${shown.map((j) => html`
          <a class="bp-row" href="#/jobs/${j.id}">
            <span class="avatar" aria-hidden="true">${initials(j.company || j.title)}</span>
            <span class="bp-main"><b>${j.title}</b>${j.company ? html`<small class="text-muted">${j.company}</small>` : ''}</span>
            <span class="badge ${j.follow_up.state === 'overdue' ? 'b-overdue' : ''}">${dueText(j.follow_up, data.today)}</span>
          </a>`)}</div>`
      : html`<p class="bp-empty text-muted">Nothing due. You're up to date.</p>`}
    ${jobs.length > SHOW ? html`<p class="bp-more text-sm text-muted">+ ${jobs.length - SHOW} more</p>` : ''}
    <a class="bp-foot" href="#/followups"><span>See all follow-ups</span><span aria-hidden="true">→</span></a>`;
}

export function initBell() {
  const bell = document.getElementById('bell');
  const pop = document.getElementById('bell-pop');
  if (!bell || !pop) return;
  let open = false;
  let seq = 0;

  function hide() {
    open = false; seq++;
    pop.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
  }

  async function show() {
    open = true;
    const mine = ++seq;
    bell.setAttribute('aria-expanded', 'true');
    pop.innerHTML = html`<p class="bp-empty text-muted">Loading…</p>`;
    pop.hidden = false;
    try {
      const data = await api('/api/followups');
      if (mine === seq && open) pop.innerHTML = bellHtml(data);
    } catch (err) {
      if (mine === seq && open) pop.innerHTML = html`<p class="bp-empty text-muted">Could not load follow-ups.</p><a class="bp-foot" href="#/followups"><span>See all follow-ups</span><span aria-hidden="true">→</span></a>`;
    }
  }

  bell.addEventListener('click', () => (open ? hide() : show()));
  pop.addEventListener('click', (e) => { if (e.target.closest('a')) hide(); });
  document.addEventListener('click', (e) => { if (open && !e.target.closest('.bell-wrap')) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { hide(); bell.focus(); } });
  window.addEventListener('hashchange', hide);
}
