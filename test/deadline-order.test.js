import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { todayLocal } from '../lib/dates.js';
import { closingWithDays, daysUntil } from '../public/js/lib/format.js';

const db = openDb(':memory:');
const server = createServer(db);
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const get = async (path) => (await fetch(base + path)).json();
const post = async (body) => (await fetch(base + '/api/jobs', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})).json();
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return todayLocal(d);
}

await post({ title: 'No date, found early', found_on: day(-9) });
await post({ title: 'Closes later', closes_on: day(12), found_on: day(-1) });
await post({ title: 'No date, found last', found_on: day(-1) });
await post({ title: 'Closes soon', closes_on: day(2), found_on: day(-8) });
await post({ title: 'Already closed', closes_on: day(-3), found_on: day(-10) });

const ORDER = ['Closes soon', 'Closes later', 'No date, found last', 'No date, found early', 'Already closed'];

test('Dashboard open list: nearest closing first, then no date with the newest found first, then closed', async () => {
  const d = await get('/api/dashboard');
  assert.deepEqual(d.open.map((j) => j.title), ORDER);
  assert.equal(d.open[2].found_on, day(-1));
});

test('Jobs list with the open filter uses the same order, other views stay newest first', async () => {
  const open = await get('/api/jobs?status=open');
  assert.deepEqual(open.jobs.map((j) => j.title), ORDER);
  const all = await get('/api/jobs');
  assert.equal(all.jobs[0].title, 'Already closed'); // created last
});

test('closing text with days left', () => {
  assert.equal(daysUntil('2026-11-28', '2026-11-16'), 12);
  assert.equal(closingWithDays('2026-11-28', '2026-11-16'), 'Closes 28 Nov \u00b7 12 days');
  assert.equal(closingWithDays('2026-11-17', '2026-11-16'), 'Closes 17 Nov \u00b7 tomorrow');
  assert.equal(closingWithDays('2026-11-16', '2026-11-16'), 'Closes 16 Nov \u00b7 today');
  assert.equal(closingWithDays('2026-11-10', '2026-11-16'), 'Closed 10 Nov');
  assert.equal(closingWithDays('', '2026-11-16'), 'No closing date');
});
