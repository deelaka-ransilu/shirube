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

startRouter(document.getElementById('page'));
