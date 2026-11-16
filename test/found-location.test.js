import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { placesOf } from '../routes/found.js';

// Its own database: the jobs are put in directly, nothing is fetched.
const db = openDb(':memory:');
const add = db.prepare(
  `INSERT INTO found_jobs (itpro_id, title, company, location, job_type, url, description, published_on, work_mode, closes_on, first_seen_at, last_seen_at)
   VALUES (?, ?, 'Acme', ?, 'Full-time', 'https://itpro.lk/job/1/x/', 'Linux', '2026-11-10', ?, '', '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z')`,
);
add.run(1, 'DevOps Engineer', 'Colombo', 'remote');
add.run(2, 'QA Engineer', 'Colombo', '');
add.run(3, 'Support Analyst', 'Panadura', '');
add.run(4, 'Web Developer', 'kandy', '');
add.run(5, 'No place given', '', '');

const server = createServer(db, {});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const get = async (path) => (await fetch(base + path)).json();
test.after(() => server.close());

test('placesOf counts each place once, most jobs first, and skips empty places', () => {
  assert.deepEqual(placesOf([{ location: 'B' }, { location: 'A' }, { location: 'A ' }, { location: '' }]), [{ name: 'A', count: 2 }, { name: 'B', count: 1 }]);
});

test('The list tells which places are in the results', async () => {
  const { locations } = await get('/api/found?posted=any');
  assert.deepEqual(locations, [{ name: 'Colombo', count: 2 }, { name: 'kandy', count: 1 }, { name: 'Panadura', count: 1 }]);
});

test('Location shows one place at a time, any letter case, and the other filters still apply', async () => {
  const titles = (d) => d.jobs.map((j) => j.title).sort();
  assert.deepEqual(titles(await get('/api/found?posted=any&location=Panadura')), ['Support Analyst']);
  assert.deepEqual(titles(await get('/api/found?posted=any&location=KANDY')), ['Web Developer']);
  assert.deepEqual(titles(await get('/api/found?posted=any&location=Colombo&work_mode=remote')), ['DevOps Engineer']);
  assert.equal((await get('/api/found?posted=any&location=Galle')).jobs.length, 0);
  assert.equal((await get('/api/found?posted=any&location=')).jobs.length, 5);
});

test('With a place chosen, the list of places still shows the other places', async () => {
  const { locations } = await get('/api/found?posted=any&location=Panadura');
  assert.equal(locations.length, 3);
});

test('Places follow the other filters (work mode, search words)', async () => {
  assert.deepEqual((await get('/api/found?posted=any&work_mode=remote')).locations, [{ name: 'Colombo', count: 1 }]);
  assert.deepEqual((await get('/api/found?posted=any&q=analyst')).locations, [{ name: 'Panadura', count: 1 }]);
});
