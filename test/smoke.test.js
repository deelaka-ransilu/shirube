import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../db.js';
import { createServer } from '../server.js';

const db = openDb(':memory:');
const server = createServer(db);
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

// fetch() cannot change the Host or Origin header, so use http.request.
function raw(path, { method = 'GET', headers = {} } = {}) {
  return new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => ok({ status: res.statusCode, text }));
    });
    req.on('error', fail);
    req.end();
  });
}

test('database has all tables and one profile row', () => {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const t of ['profile', 'presets', 'education', 'experience', 'preset_experience', 'jobs', 'stages']) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM profile').get().n, 1);
});

test('database rejects a bad job status and cascades stage deletes', () => {
  assert.throws(() => db.prepare("INSERT INTO jobs (title, status) VALUES ('x', 'nonsense')").run());
  const { lastInsertRowid: id } = db.prepare("INSERT INTO jobs (title) VALUES ('Test job')").run();
  db.prepare("INSERT INTO stages (job_id, kind) VALUES (?, 'applied')").run(id);
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stages').get().n, 0);
});

test('GET /api/health works', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, app: 'shirube', jobs: 0 });
});

test('home page is served', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Shirube/);
});

test('unknown API route gives 404 JSON', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});

test('path traversal is blocked', async () => {
  const res = await raw('/..%2fpackage.json');
  assert.ok(res.status === 403 || res.status === 404);
  assert.doesNotMatch(res.text, /"name": "shirube"/);
});

test('other hosts and other websites are refused', async () => {
  assert.equal((await raw('/api/health', { headers: { Host: 'evil.example.com' } })).status, 403);
  const post = await raw('/api/health', { method: 'POST', headers: { Origin: 'http://evil.example.com' } });
  assert.equal(post.status, 403);
});

test.after(() => server.close());
