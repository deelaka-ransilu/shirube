import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routes, parseHash, matchRoute } from '../public/js/routes.js';
import { html, esc, raw } from '../public/js/lib/html.js';
import { openDb } from '../db.js';
import { createServer } from '../server.js';

test('parseHash handles empty, plain and query hashes', () => {
  assert.deepEqual(parseHash(''), { path: '/', query: {} });
  assert.deepEqual(parseHash('#/jobs'), { path: '/jobs', query: {} });
  assert.deepEqual(parseHash('#/jobs?q=acme%20corp'), { path: '/jobs', query: { q: 'acme corp' } });
  assert.equal(parseHash('#jobs').path, '/jobs');
});

test('matchRoute finds pages and ids, rejects unknown paths', () => {
  assert.equal(matchRoute('/').route.nav, 'dashboard');
  assert.equal(matchRoute('/jobs').route.nav, 'jobs');
  assert.equal(matchRoute('/jobs/new').route.title, 'Add job');
  assert.deepEqual(matchRoute('/jobs/42').params, { id: '42' });
  assert.equal(matchRoute('/jobs/abc'), null);
  assert.equal(matchRoute('/nope'), null);
});

test('every page module loads and has render()', async () => {
  for (const r of routes) {
    const page = await r.load();
    assert.equal(typeof page.render, 'function', `${r.title} has no render()`);
  }
});

test('html`` escapes values but not nested html or raw()', () => {
  const evil = '<img src=x onerror="alert(1)">';
  assert.equal(String(html`<p>${evil}</p>`), '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>');
  assert.equal(String(html`<ul>${[1, 2].map((n) => html`<li>${n}</li>`)}</ul>`), '<ul><li>1</li><li>2</li></ul>');
  assert.equal(String(html`${raw('<b>ok</b>')}`), '<b>ok</b>');
  assert.equal(esc(null), '');
});

test('every file linked from index.html is served', async () => {
  const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const local = [...page.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(local.length >= 4);
  const server = createServer(openDb(':memory:'));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  try {
    for (const path of local) {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
      assert.equal(res.status, 200, `${path} gave ${res.status}`);
    }
  } finally {
    server.close();
  }
});
