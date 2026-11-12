import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';

const db = openDb(':memory:');
const server = createServer(db);
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

test('a fresh database has one preset and it is active', async () => {
  const { data } = await call('/api/profile');
  assert.equal(data.presets.length, 1);
  assert.equal(data.profile.active_preset_id, data.presets[0].id);
  assert.deepEqual(data.presets[0].skills, []);
});

test('Save profile stores basics, settings, skills and checks them', async () => {
  const first = (await call('/api/profile')).data.presets[0];
  const ok = await call('/api/profile', { method: 'PATCH', body: {
    name: ' Dee ', email: 'dee@example.com', portfolio: 'https://dee.example', follow_up_days: '5', time_zone: 'Asia/Colombo',
    active_preset_id: first.id,
    presets: [{ id: first.id, name: 'SRE', target_role: 'DevOps', summary: 'Hi', skills: ['Linux', ' linux ', 'Docker', ''] }],
  } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.profile.name, 'Dee');
  assert.equal(ok.data.profile.follow_up_days, 5);
  assert.deepEqual(ok.data.presets[0].skills, ['Linux', 'Docker']);
  assert.equal(ok.data.presets[0].name, 'SRE');
  for (const body of [{ email: 'nope' }, { portfolio: 'javascript:1' }, { follow_up_days: 0 }, { follow_up_days: '' }, { time_zone: 'Mars/Base' }, { presets: [{ id: first.id, name: '  ' }] }, { presets: [{ id: 999 }] }, { active_preset_id: 999 }, []]) {
    const r = await call('/api/profile', { method: 'PATCH', body });
    assert.ok([400, 404].includes(r.status), JSON.stringify(body));
  }
  // a failed save changes nothing
  assert.equal((await call('/api/profile')).data.profile.name, 'Dee');
});

test('presets: create, cannot delete the last one, active moves on delete', async () => {
  const created = await call('/api/presets', { method: 'POST', body: { name: 'Designer' } });
  assert.equal(created.data.presets.length, 2);
  assert.equal((await call('/api/presets', { method: 'POST', body: { name: ' ' } })).status, 400);
  const before = (await call('/api/profile')).data;
  await call('/api/profile', { method: 'PATCH', body: { active_preset_id: created.data.id } });
  const del = await call(`/api/presets/${created.data.id}`, { method: 'DELETE' });
  assert.equal(del.data.presets.length, 1);
  assert.equal(del.data.profile.active_preset_id, before.presets[0].id);
  assert.equal((await call(`/api/presets/${before.presets[0].id}`, { method: 'DELETE' })).status, 400);
  assert.equal((await call('/api/presets/999', { method: 'DELETE' })).status, 404);
});

test('education and experience: add, edit, remove, shown per preset', async () => {
  const preset = (await call('/api/profile')).data.presets[0];
  const edu = await call('/api/education', { method: 'POST', body: { school: 'UOM', qualification: 'BIT', start_date: '2021' } });
  assert.equal(edu.data.education.length, 1);
  assert.equal((await call('/api/education', { method: 'POST', body: { school: '' } })).status, 400);
  const eid = edu.data.id;
  assert.equal((await call(`/api/education/${eid}`, { method: 'PATCH', body: { end_date: '2026' } })).data.education[0].end_date, '2026');
  assert.equal((await call(`/api/education/${eid}`, { method: 'PATCH', body: { school: '' } })).status, 400);
  assert.equal((await call('/api/education/999', { method: 'PATCH', body: { note: 'x' } })).status, 404);

  const exp = await call('/api/experience', { method: 'POST', body: { company: 'myPOS', role: 'Support', show_in: preset.id } });
  assert.deepEqual(exp.data.presets[0].experience_ids, [exp.data.id]);
  const other = (await call('/api/presets', { method: 'POST', body: { name: 'Web' } })).data;
  assert.deepEqual(other.presets[1].experience_ids, []);
  // Hide in the first preset, show in the second
  const saved = await call('/api/profile', { method: 'PATCH', body: { presets: [
    { id: preset.id, experience_ids: [] }, { id: other.id, experience_ids: [exp.data.id, 12345] },
  ] } });
  assert.deepEqual(saved.data.presets.map((p) => p.experience_ids), [[], [exp.data.id]]);
  // removing an entry removes its Shown links
  const gone = await call(`/api/experience/${exp.data.id}`, { method: 'DELETE' });
  assert.deepEqual(gone.data.presets.map((p) => p.experience_ids), [[], []]);
  assert.equal((await call(`/api/education/${eid}`, { method: 'DELETE' })).data.education.length, 0);
});

test('backup then restore brings everything back, a bad file changes nothing', async () => {
  const preset = (await call('/api/profile')).data.presets[0];
  const exp = (await call('/api/experience', { method: 'POST', body: { company: 'Acme', show_in: preset.id } })).data.id;
  const job = (await call('/api/jobs', { method: 'POST', body: { title: 'SRE', company: 'Globex' } })).data.job.id;
  await call(`/api/jobs/${job}/stages`, { method: 'POST', body: { kind: 'applied', happened_on: '2026-11-04' } });
  const backup = (await call('/api/backup')).data;
  assert.equal(backup.app, 'shirube');
  assert.equal(backup.tables.jobs.length, 1);
  assert.equal(backup.tables.stages.length, 1);

  // wipe things, then restore
  await call(`/api/jobs/${job}`, { method: 'DELETE' });
  await call(`/api/experience/${exp}`, { method: 'DELETE' });
  await call('/api/profile', { method: 'PATCH', body: { name: 'Changed' } });
  const r = await call('/api/restore', { method: 'POST', body: backup });
  assert.equal(r.status, 200);
  assert.equal(r.data.jobs, 1);
  const after = (await call('/api/profile')).data;
  assert.equal(after.profile.name, 'Dee');
  assert.equal(after.experience.length, 1);
  assert.deepEqual(after.presets[0].experience_ids, [exp]);
  const j = (await call(`/api/jobs/${job}`)).data;
  assert.equal(j.job.status, 'applied');
  assert.equal(j.stages.length, 1);

  const broken = structuredClone(backup);
  broken.tables.jobs[0].status = 'nonsense';
  assert.equal((await call('/api/restore', { method: 'POST', body: broken })).status, 400);
  assert.equal((await call('/api/jobs')).data.jobs.length, 1); // untouched
  for (const body of [{}, { app: 'other', version: 1, tables: {} }, { app: 'shirube', version: 99, tables: {} }, { app: 'shirube', version: 1, tables: { jobs: 'x' } }]) {
    assert.equal((await call('/api/restore', { method: 'POST', body })).status, 400);
  }
});

test('restoring a backup with no presets still leaves one active preset', async () => {
  const r = await call('/api/restore', { method: 'POST', body: { app: 'shirube', version: 1, tables: { jobs: [] } } });
  assert.equal(r.status, 200);
  const { data } = await call('/api/profile');
  assert.equal(data.presets.length, 1);
  assert.equal(data.profile.active_preset_id, data.presets[0].id);
});
