// Routes the Jobs screens to their page modules.
// Other screens are still drawn by public/app.js until they are split out too.
import { renderJobs } from './pages/jobs.js';

function route() {
  const name = location.hash.slice(1) || 'jobs';
  if (name === 'jobs' || name === 'jobs/new') {
    document.title = 'Jobs | Shirube';
    renderJobs(document.getElementById('app'), name === 'jobs/new');
  }
}

window.addEventListener('hashchange', route);
route();
