// Switches screens by the #hash in the address bar. Screens are added one by one.
const SCREENS = {
  jobs: 'Jobs',
  profile: 'Profile',
};

function showScreen() {
  const name = location.hash.slice(1) || 'jobs';
  const app = document.getElementById('app');

  if (SCREENS[name]) {
    app.textContent = `${SCREENS[name]}: coming in the next step.`;
  } else {
    app.textContent = 'Page not found.';
  }

  document.querySelectorAll('.nav-item').forEach((link) => {
    link.setAttribute('aria-current', link.getAttribute('href') === `#${name}` ? 'page' : 'false');
  });
}

window.addEventListener('hashchange', showScreen);
showScreen();