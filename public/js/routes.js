// The list of pages. Pure data and functions, no browser code,
// so it can be tested in Node. Pages are loaded only when visited.
export const routes = [
  { pattern: /^\/$/,                    nav: 'dashboard', title: 'Dashboard', load: () => import('./pages/dashboard.js') },
  { pattern: /^\/jobs$/,                nav: 'jobs',      title: 'Jobs',      load: () => import('./pages/jobs.js') },
  { pattern: /^\/jobs\/new$/,           nav: 'jobs',      title: 'Add job',   load: () => import('./pages/job-new.js') },
  { pattern: /^\/jobs\/(?<id>\d+)$/,    nav: 'jobs',      title: 'Job',       load: () => import('./pages/job-detail.js') },
  { pattern: /^\/found$/,               nav: 'found',     title: 'Found',     load: () => import('./pages/found.js') },
  { pattern: /^\/followups$/,           nav: 'followups', title: 'Follow-ups', load: () => import('./pages/followups.js') },
  { pattern: /^\/profile$/,             nav: 'profile',   title: 'My profile', load: () => import('./pages/profile.js') },
];

// "#/jobs?q=acme" -> { path: "/jobs", query: { q: "acme" } }
export function parseHash(hash) {
  const text = String(hash || '').replace(/^#/, '') || '/';
  const [path, qs = ''] = text.split('?');
  return {
    path: path.startsWith('/') ? path : '/' + path,
    query: Object.fromEntries(new URLSearchParams(qs)),
  };
}

export function matchRoute(path) {
  for (const route of routes) {
    const m = path.match(route.pattern);
    if (m) return { route, params: { ...(m.groups ?? {}) } };
  }
  return null;
}
