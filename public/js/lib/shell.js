// Small helpers for the top bar. Safe to import in Node (they do nothing without a browser page).

// The page name shown at the top left (replaces the Shirube logo text).
export function setPageTitle(text) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('page-title');
  if (el) el.textContent = text;
}

// A page can put its one main action in the top bar, e.g. "+ Add job". The router clears it on every page change.
// content must be trusted html (built with html``).
export function setTopAction(content = '') {
  if (typeof document === 'undefined') return;
  const slot = document.getElementById('top-action');
  if (slot) slot.innerHTML = String(content);
}
