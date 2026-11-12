// Shows the page that matches the address (#/jobs, #/jobs/12 ...).
// A page module exports render(el, { params, query, stale }).
// Rule for pages: do your fetches first, check stale(), then write to el.
// stale() is true when the person already went to another page.
import { parseHash, matchRoute } from './routes.js';
import { html } from './lib/html.js';

function markNav(nav) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

export function startRouter(el) {
  let current = 0;

  async function show() {
    const mine = ++current;
    const stale = () => mine !== current;
    const { path, query } = parseHash(location.hash);
    const hit = matchRoute(path);
    markNav(hit?.route.nav);

    if (!hit) {
      document.title = 'Not found · Shirube';
      el.innerHTML = html`<div class="page-head"><div><h1>Page not found</h1><p class="text-muted"><a class="link" href="#/">Go to the dashboard</a></p></div></div>`;
      return;
    }

    try {
      const page = await hit.route.load();
      if (stale()) return;
      document.title = `${hit.route.title} · Shirube`;
      el.scrollTop = 0;
      // Pages attach events with el.onclick = ..., so clear the last page's events first.
      el.onclick = el.oninput = el.onchange = el.onsubmit = null;
      await page.render(el, { params: hit.params, query, stale });
    } catch (err) {
      if (stale()) return;
      console.error(err);
      el.innerHTML = html`<div class="card"><h2>This page could not load</h2><p class="text-muted">Try again, or go back to the <a class="link" href="#/">dashboard</a>.</p></div>`;
    }
  }

  window.addEventListener('hashchange', show);
  return show();
}
