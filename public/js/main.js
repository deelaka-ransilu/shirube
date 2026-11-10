// Routes each screen to its page module.
// Profile and the other screens are still drawn by public/app.js until they are split out too.
import { renderJobs } from './pages/jobs.js';
import { renderJobPage } from './pages/job-detail.js';
import { renderFollowups } from './pages/followups.js';

function route() {
  const name = location.hash.slice(1) || 'jobs';
  const app = document.getElementById('app');

  if (name === 'jobs' || name === 'jobs/new') {
    document.title = 'Jobs | Shirube';
    renderJobs(app, name === 'jobs/new');
  } else if (name.startsWith('job/')) {
    renderJobPage(app, name.slice(4));
  } else if (name === 'followups') {
    document.title = 'Follow-ups | Shirube';
    renderFollowups(app);
  }
}

window.addEventListener('hashchange', route);
route();
