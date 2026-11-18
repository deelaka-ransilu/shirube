import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { todayLocal, addDays } from '../lib/dates.js';

const db = openDb(':memory:');
const server = createServer(db);
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const dash = () => fetch(base + '/api/dashboard').then((r) => r.json());

test('applied_days: empty when nothing was applied', async () => {
  const d = await dash();
  assert.deepEqual(d.applied_days, []);
});

test('applied_days: one row per day from the first application, oldest first; open jobs and future days are left out', async () => {
  const today = todayLocal();
  await post('/api/jobs', { title: 'A', status: 'applied', applied_on: today });
  await post('/api/jobs', { title: 'B', status: 'applied', applied_on: today });
  await post('/api/jobs', { title: 'C', status: 'applied', applied_on: addDays(today, -3) });
  await post('/api/jobs', { title: 'D', status: 'applied', applied_on: addDays(today, -40) });
  await post('/api/jobs', { title: 'E' }); // still open
  const d = await dash();
  assert.deepEqual(d.applied_days, [
    { date: addDays(today, -40), count: 1 },
    { date: addDays(today, -3), count: 1 },
    { date: today, count: 2 },
  ]);
  assert.equal('sent' in d, false);
});
