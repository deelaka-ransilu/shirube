import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { cvPaper } from '../public/js/lib/cv-paper.js';

const db = openDb(':memory:');
const server = createServer(db, {});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test('certifications: add, edit, remove, checks', async () => {
  assert.deepEqual((await call('/api/profile')).data.certifications, []);
  const made = await call('/api/certifications', { method: 'POST', body: { name: 'GH-900', issuer: 'Microsoft', issued_on: '2026' } });
  assert.equal(made.data.certifications.length, 1);
  const id = made.data.id;
  assert.equal((await call('/api/certifications', { method: 'POST', body: { name: '' } })).status, 400);
  assert.equal((await call('/api/certifications', { method: 'POST', body: { name: 'X', url: 'not a link' } })).status, 400);
  const ok = await call(`/api/certifications/${id}`, { method: 'PATCH', body: { url: 'https://example.com/badge' } });
  assert.equal(ok.data.certifications[0].url, 'https://example.com/badge');
  assert.equal((await call(`/api/certifications/${id}`, { method: 'PATCH', body: { name: '' } })).status, 400);
  assert.equal((await call('/api/certifications/999', { method: 'PATCH', body: { issuer: 'x' } })).status, 404);
  assert.equal((await call(`/api/certifications/${id}`, { method: 'DELETE' })).data.certifications.length, 0);
});

test('certifications go into backup, restore, the match answer and the CV paper', async () => {
  await call('/api/certifications', { method: 'POST', body: { name: 'Linux Essentials', issuer: 'LPI', issued_on: '2025' } });
  const backup = (await call('/api/backup')).data;
  assert.equal(backup.tables.certifications.length, 1);

  const job = (await call('/api/jobs', { method: 'POST', body: { title: 'SRE', company: 'Globex', description: 'Docker and Linux' } })).data.job.id;
  const m = (await call(`/api/jobs/${job}/match`)).data;
  assert.equal(m.certifications[0].name, 'Linux Essentials');
  assert.match(String(cvPaper(m)), /Certifications[\s\S]*Linux Essentials[\s\S]*LPI/);

  await call('/api/certifications', { method: 'POST', body: { name: 'Extra' } });
  assert.equal((await call('/api/restore', { method: 'POST', body: backup })).status, 200);
  assert.deepEqual((await call('/api/profile')).data.certifications.map((c) => c.name), ['Linux Essentials']);

  // an older backup without certifications keeps the ones you have now
  const old = structuredClone(backup);
  delete old.tables.certifications;
  assert.equal((await call('/api/restore', { method: 'POST', body: old })).status, 200);
  assert.equal((await call('/api/profile')).data.certifications.length, 1);
});
