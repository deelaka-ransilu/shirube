import { startRouter } from './router.js';

// The search box in the top bar opens the Jobs list with a search word.
document.getElementById('search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
  location.hash = '#/jobs' + (q ? '?q=' + encodeURIComponent(q) : '');
});

startRouter(document.getElementById('page'));
