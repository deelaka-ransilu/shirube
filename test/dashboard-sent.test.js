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

test('sent: 7 days, oldest first, today last, all zero when nothing was applied', async () => {
  const d = await dash();
  const today = todayLocal();
  assert.equal(d.sent.length, 7);
  assert.equal(d.sent[6].date, today);
  assert.equal(d.sent[0].date, addDays(today, -6));
  assert.equal(d.sent.every((x) => x.count === 0), true);
});

test('sent: counts applications per day, ignores old ones and open jobs', async () => {
  const today = todayLocal();
  await post('/api/jobs', { title: 'A', status: 'applied', applied_on: today });
  await post('/api/jobs', { title: 'B', status: 'applied', applied_on: today });
  await post('/api/jobs', { title: 'C', status: 'applied', applied_on: addDays(today, -3) });
  await post('/api/jobs', { title: 'D', status: 'applied', applied_on: addDays(today, -7) }); // too old
  await post('/api/jobs', { title: 'E' }); // still open
  const d = await dash();
  assert.deepEqual(d.sent.map((x) => x.count), [0, 0, 0, 1, 0, 0, 2]);
});
