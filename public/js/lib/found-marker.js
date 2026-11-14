// The "New" marker on Found moves when the person leaves Found (and its Manage page), not while they are on either.
let stopWatching = () => {};

export function watchLeavingFound() {
  stopWatching();
  const onChange = () => {
    if (location.hash.startsWith('#/found') || location.hash.startsWith('#/saved')) return;
    stopWatching();
    fetch('/api/found/left', { method: 'POST' }).catch(() => {});
  };
  window.addEventListener('hashchange', onChange);
  stopWatching = () => { window.removeEventListener('hashchange', onChange); stopWatching = () => {}; };
}

export const MODE_LABEL = { any: 'Any work mode', onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
export const POSTED_LABEL = { today: 'today', '3d': 'last 3 days', week: 'last week', any: 'any date' };

// A name to suggest for a search: its words and work mode, e.g. "devops colombo, Remote".
export function suggestName(q, mode) {
  const words = String(q || '').trim().replace(/\s+/g, ' ');
  const m = mode && mode !== 'any' ? MODE_LABEL[mode] : '';
  return [words, m].filter(Boolean).join(', ').slice(0, 60);
}
