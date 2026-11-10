// Routes each screen to its page module.
import { renderJobs } from './pages/jobs.js';
import { renderJobPage } from './pages/job-detail.js';
import { renderFollowups } from './pages/followups.js';
import { renderProfile } from './pages/profile.js';

// Screens that are not built yet.
const PLACEHOLDERS = {
  learn: 'What works',
  settings: 'Settings',
  backup: 'Export backup',
};

function drawPlaceholder(app, title) {
  document.title = `${title} | Shirube`;
  app.innerHTML = '';

  const heading = document.createElement('h1');
  heading.className = 'screen-title';
  heading.textContent = title;

  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = 'This screen is not built yet.';

  app.append(heading, note);
}

// Marks the current page in the navbar and in the account menu.
function markCurrentNav(name) {
  document.querySelectorAll('[data-screen]').forEach((link) => {
    const isCurrent =
      link.dataset.screen === name ||
      (name.startsWith('job/') && link.dataset.screen === 'jobs') ||
      (name === 'jobs/new' && link.dataset.screen === 'jobs');
    link.setAttribute('aria-current', isCurrent ? 'page' : 'false');
  });

  // Close the account menu after a choice is made.
  document.querySelectorAll('.avatar-menu').forEach((menu) => {
    menu.open = false;
  });
}

function route() {
  const name = location.hash.slice(1) || 'jobs';
  const app = document.getElementById('app');

  document.body.classList.toggle('job-page-active', name.startsWith('job/'));

  if (name === 'jobs' || name === 'jobs/new') {
    document.title = 'Jobs | Shirube';
    renderJobs(app, name === 'jobs/new');
  } else if (name.startsWith('job/')) {
    renderJobPage(app, name.slice(4));
  } else if (name === 'followups') {
    document.title = 'Follow-ups | Shirube';
    renderFollowups(app);
  } else if (name === 'profile') {
    document.title = 'My profile | Shirube';
    renderProfile(app);
  } else if (Object.hasOwn(PLACEHOLDERS, name)) {
    drawPlaceholder(app, PLACEHOLDERS[name]);
  } else {
    document.title = 'Page not found | Shirube';
    app.textContent = 'Page not found.';
  }

  markCurrentNav(name);
}

window.addEventListener('hashchange', route);
route();
