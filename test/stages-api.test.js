import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { statusFromStages, appliedOnFromStages } from '../lib/stage-rules.js';

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
const newJob = async (title = 'Frontend Engineer') => (await call('/api/jobs', { method: 'POST', body: { title, company: 'Acme' } })).data.job.id;

test('status rules', () => {
  assert.equal(statusFromStages([]), 'open');
  assert.equal(statusFromStages([{ kind: 'follow_up' }, { kind: 'other' }]), 'open');
  assert.equal(statusFromStages([{ kind: 'applied' }, { kind: 'interview' }]), 'interview');
  assert.equal(statusFromStages([{ kind: 'offer' }, { kind: 'applied' }, { kind: 'rejected' }]), 'rejected');
  assert.equal(appliedOnFromStages([{ kind: 'applied', happened_on: '2026-11-05' }, { kind: 'applied', happened_on: '2026-11-04' }, { kind: 'applied', happened_on: '' }]), '2026-11-04');
  assert.equal(appliedOnFromStages([]), '');
});

test('GET a job gives the job and its stages, 404 for a missing one', async () => {
  const id = await newJob();
  const { status, data } = await call(`/api/jobs/${id}`);
  assert.equal(status, 200);
  assert.equal(data.job.title, 'Frontend Engineer');
  assert.deepEqual(data.stages, []);
  assert.equal((await call('/api/jobs/99999')).status, 404);
  assert.equal((await call('/api/jobs/duplicate?title=x')).status, 200); // still not read as an id
});

test('PATCH edits only the given fields and checks them', async () => {
  const id = await newJob();
  const ok = await call(`/api/jobs/${id}`, { method: 'PATCH', body: { notes: 'Call HR', work_mode: 'remote', closes_on: '2026-11-30' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.job.notes, 'Call HR');
  assert.equal(ok.data.job.work_mode, 'remote');
  assert.equal(ok.data.job.title, 'Frontend Engineer');
  for (const body of [{ title: '  ' }, { closes_on: '2026-02-31' }, { url: 'javascript:1' }, {}, [1]]) {
    assert.equal((await call(`/api/jobs/${id}`, { method: 'PATCH', body })).status, 400);
  }
  assert.equal((await call('/api/jobs/99999', { method: 'PATCH', body: { notes: 'x' } })).status, 404);
});

test('adding stages moves the status and the applied date', async () => {
  const id = await newJob();
  let r = await call(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind: 'applied', happened_on: '2026-11-04', note: 'Via LinkedIn' } });
  assert.equal(r.data.job.status, 'applied');
  assert.equal(r.data.job.applied_on, '2026-11-04');
  assert.equal(r.data.stages[0].note, 'Via LinkedIn');

  r = await call(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind: 'follow_up', happened_on: '2026-11-11' } });
  assert.equal(r.data.job.status, 'applied'); // follow-up does not change status

  r = await call(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind: 'interview', happened_on: '2026-11-12' } });
  assert.equal(r.data.job.status, 'interview');

  r = await call(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind: 'applied', happened_on: '2026-11-01' } });
  assert.equal(r.data.job.status, 'interview'); // an old Applied stage does not move it back
  assert.equal(r.data.job.applied_on, '2026-11-01');
});

test('editing and deleting a stage keeps the status right', async () => {
  const id = await newJob();
  await call(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind: 'applied', happened_on: '2026-11-04' } });
  const rej = (await call(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind: 'rejected', happened_on: '2026-11-20' } })).data;
  assert.equal(rej.job.status, 'rejected');
  const stageId = rej.stages.find((s) => s.kind === 'rejected').id;

  let r = await call(`/api/stages/${stageId}`, { method: 'PATCH', body: { note: 'No reply after 2 weeks' } });
  assert.equal(r.data.stages.find((s) => s.id === stageId).note, 'No reply after 2 weeks');

  r = await call(`/api/stages/${stageId}`, { method: 'DELETE' });
  assert.equal(r.data.job.status, 'applied');
  const appliedId = r.data.stages[0].id;
  r = await call(`/api/stages/${appliedId}`, { method: 'DELETE' });
  assert.equal(r.data.job.status, 'open');
  assert.equal(r.data.job.applied_on, '');
  assert.equal((await call(`/api/stages/${appliedId}`, { method: 'DELETE' })).status, 404);
});

test('stage input is checked', async () => {
  const id = await newJob();
  for (const body of [{ kind: 'nonsense' }, {}, { kind: 'reply', happened_on: '2026-13-01' }, { kind: 'reply', note: 5 }, { kind: 'reply', note: 'x'.repeat(2001) }, [1]]) {
    assert.equal((await call(`/api/jobs/${id}/stages`, { method: 'POST', body })).status, 400);
  }
  assert.equal((await call('/api/jobs/99999/stages', { method: 'POST', body: { kind: 'reply' } })).status, 404);
  assert.equal((await call('/api/stages/99999', { method: 'PATCH', body: { note: 'x' } })).status, 404);
});

test('deleting a job removes its stages', async () => {
  const id = await newJob();
  await call(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind: 'applied' } });
  await call(`/api/jobs/${id}`, { method: 'DELETE' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stages WHERE job_id = ?').get(id).n, 0);
});

test.after(() => server.close());
