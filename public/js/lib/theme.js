// Light / dark theme. Follows the system until the person picks one with the switch in the top bar;
// the pick is kept in localStorage (wrapped in try/catch: storage can be blocked).
// The pure helpers are tested; initTheme() needs a browser page. index.html sets the first value early.
export const THEME_KEY = 'shirube-theme';

export function resolveTheme(stored, systemDark) {
  if (stored === 'light' || stored === 'dark') return stored;
  return systemDark ? 'dark' : 'light';
}

export function nextTheme(current) {
  return current === 'dark' ? 'light' : 'dark';
}

function readStored() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}

function systemDark() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function initTheme(button) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    if (!button) return;
    const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  apply(resolveTheme(readStored(), systemDark()));

  button?.addEventListener('click', () => {
    const next = nextTheme(root.getAttribute('data-theme'));
    apply(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* the choice just lasts until the page closes */ }
  });

  // With no pick of their own, follow the system when it changes.
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (readStored() === 'light' || readStored() === 'dark') return;
      apply(resolveTheme(null, e.matches));
    });
  }
}
