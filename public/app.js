// Switches screens by the #hash in the address bar.
// Screens that are not built yet show a plain message.
const SCREENS = {
  jobs: 'Jobs',
  followups: 'Follow-ups',
  learn: 'What works',
  profile: 'My profile',
  settings: 'Settings',
  backup: 'Export backup',
};

function showScreen() {
  const name = location.hash.slice(1) || 'jobs';
  const title = SCREENS[name];
  const app = document.getElementById('app');

  if (title) {
    document.title = `${title} | Shirube`;
    app.innerHTML = '';

    const heading = document.createElement('h1');
    heading.className = 'screen-title';
    heading.textContent = title;

    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'This screen is not built yet.';

    app.append(heading, note);
  } else {
    document.title = 'Page not found | Shirube';
    app.textContent = 'Page not found.';
  }

  // Mark the current page in the navbar and in the account menu.
  document.querySelectorAll('[data-screen]').forEach((link) => {
    link.setAttribute('aria-current', link.dataset.screen === name ? 'page' : 'false');
  });

  // Close the account menu after a choice is made.
  document.querySelectorAll('.avatar-menu').forEach((menu) => {
    menu.open = false;
  });
}

window.addEventListener('hashchange', showScreen);
showScreen();