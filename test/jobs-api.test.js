import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';

const db = openDb(':memory:');
const server = createServer(db);
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}
const post = (body) => call('/api/jobs', { method: 'POST', body });

test('creates a job with only a title', async () => {
  const { status, data } = await post({ title: '  Junior DevOps Engineer  ' });
  assert.equal(status, 200);
  assert.equal(data.job.title, 'Junior DevOps Engineer');
  assert.equal(data.job.status, 'open');
  assert.equal(data.job.source, 'manual');
});

test('refuses bad input with a clear message', async () => {
  for (const [body, message] of [
    [{}, /title is required/i],
    [{ title: '   ' }, /title is required/i],
    [{ title: 'x', url: 'javascript:alert(1)' }, /http/],
    [{ title: 'x', closes_on: '2026-02-31' }, /real date/],
    [{ title: 'x', status: 'nonsense' }, /status/],
    [{ title: 'x', work_mode: 'moon' }, /work mode/],
    [{ title: 'x'.repeat(201) }, /too long/],
    [{ title: 5 }, /text/],
    [[1, 2], /JSON/],
  ]) {
    const { status, data } = await post(body);
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(data.error, message);
  }
});

test('ignores fields it does not know', async () => {
  const { data } = await post({ title: 'Safe', id: 999, created_at: '1999-01-01', hacked: 1 });
  assert.notEqual(data.job.id, 999);
  assert.notEqual(data.job.created_at, '1999-01-01');
});

test('list, filter by status, search, and counts', async () => {
  await post({ title: 'Frontend Engineer', company: 'Acme Corp' });
  await post({ title: 'QA Engineer', company: 'Globex' });
  db.prepare("UPDATE jobs SET status = 'applied' WHERE title = 'QA Engineer'").run();

  const all = (await call('/api/jobs')).data;
  assert.equal(all.counts.all, all.jobs.length);
  assert.equal(all.counts.applied, 1);
  assert.equal(all.jobs[0].description, undefined, 'list must not send the advert text');

  assert.deepEqual((await call('/api/jobs?status=applied')).data.jobs.map((j) => j.title), ['QA Engineer']);
  assert.deepEqual((await call('/api/jobs?q=ACME')).data.jobs.map((j) => j.title), ['Frontend Engineer']);
  assert.equal((await call('/api/jobs?status=nope')).status, 400);
  assert.equal((await call('/api/jobs?q=zzzz')).data.counts.all, all.counts.all, 'counts ignore filters');
});

test('next closing: only open jobs closing today or later', async () => {
  await post({ title: 'Old one', closes_on: '2000-01-01' });
  await post({ title: 'Far one', closes_on: '2099-06-01' });
  await post({ title: 'Nearer one', closes_on: '2099-01-01' });
  await post({ title: 'Applied one', closes_on: '2098-01-01', status: 'applied' });
  assert.equal((await call('/api/jobs')).data.next_closing.title, 'Nearer one');
});

test('finds a duplicate regardless of case and spaces', async () => {
  await post({ title: 'Data Analyst', company: 'Initech' });
  const hit = (await call('/api/jobs/duplicate?title=%20data%20analyst&company=INITECH')).data.job;
  assert.equal(hit.title, 'Data Analyst');
  assert.equal((await call('/api/jobs/duplicate?title=Data%20Analyst&company=Other')).data.job, null);
  assert.equal((await call('/api/jobs/duplicate?title=')).data.job, null);
});

test('deletes a job, then says 404', async () => {
  const { data } = await post({ title: 'Delete me' });
  assert.deepEqual((await call(`/api/jobs/${data.job.id}`, { method: 'DELETE' })).data, { ok: true });
  assert.equal((await call(`/api/jobs/${data.job.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await call('/api/jobs/abc', { method: 'DELETE' })).status, 404);
});

test.after(() => server.close());
