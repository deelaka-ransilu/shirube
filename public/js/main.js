import { startRouter } from './router.js';
import { api } from './lib/api.js';
import { initials } from './lib/format.js';

// The search box in the top bar opens the Jobs list with a search word.
document.getElementById('search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
  location.hash = '#/jobs' + (q ? '?q=' + encodeURIComponent(q) : '');
});

// The round avatar shows the initials from My profile (a person icon until a name is saved).
function showName(name) {
  const link = document.getElementById('avatar');
  const text = link.querySelector('.initials');
  const has = Boolean(name && name.trim());
  link.querySelector('svg').toggleAttribute('hidden', has);
  text.hidden = !has;
  text.textContent = has ? initials(name) : '';
  link.title = has ? `My profile (${name.trim()})` : 'My profile';
}
window.addEventListener('profile-saved', (e) => showName(e.detail.name));
api('/api/profile').then((r) => showName(r.profile.name)).catch(() => {});

// The bell in the top bar shows how many follow-ups are due.
function refreshBell() {
  api('/api/followups/count').then(({ due }) => {
    const bell = document.getElementById('bell');
    const count = document.getElementById('bell-count');
    count.hidden = !due;
    count.textContent = due > 99 ? '99+' : String(due);
    bell.setAttribute('aria-label', due ? `${due} follow-up${due === 1 ? '' : 's'} due` : 'Follow-ups');
    bell.title = due ? `${due} follow-up${due === 1 ? '' : 's'} due` : 'Follow-ups';
  }).catch(() => {});
}
window.addEventListener('hashchange', refreshBell);
window.addEventListener('followups-changed', refreshBell);
refreshBell();

startRouter(document.getElementById('page'));
