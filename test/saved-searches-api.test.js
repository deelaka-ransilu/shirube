import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';

const clock = { now: new Date('2026-11-14T06:00:00Z') };
const rfc = (daysAgo) => new Date(clock.now.getTime() - daysAgo * 86400000).toUTCString().replace('GMT', '+0000');
const item = (id, title, company, daysAgo, advert = '<p>Work with Linux.</p>', location = 'Colombo') => `
  <item><title>${title} at ${company}</title><link>https://itpro.lk/job/${id}/x/</link><guid>https://itpro.lk/job/${id}/x/</guid>
  <pubDate>${rfc(daysAgo)}</pubDate><description>Location: ${location}</description>
  <content:encoded><![CDATA[<strong>Company:</strong> ${company}<br> <strong>Location:</strong> ${location}<br> <strong>Job Type:</strong> Full-time<br><br> <strong>Description:</strong><br>${advert}]]></content:encoded></item>`;
const xml = (...items) => `<rss version="2.0"><channel><title>ITPro</title><ttl>30</ttl>${items.join('')}</channel></rss>`;

const db = openDb(':memory:');
const feedText = xml(
  item(1, 'DevOps Engineer', 'Northwind', 0, '<p>Kubernetes, Colombo office.</p>'),
  item(2, 'Remote QA Engineer', 'Globex', 1, '<p>Remote role.</p>', 'Anywhere'),
  item(3, 'DevOps Trainee', 'Initech', 9),
);
const server = createServer(db, { fetchFeed: async () => feedText, now: () => clock.now });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (path, method = 'GET', body) => {
  const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
};
test.after(() => server.close());

test('starts empty', async () => {
  assert.deepEqual((await call('/api/saved-searches')).data, { searches: [] });
});

test('create checks the input and fills defaults', async () => {
  assert.equal((await call('/api/saved-searches', 'POST', { name: '', q: 'devops' })).status, 400);
  assert.equal((await call('/api/saved-searches', 'POST', { name: 'Empty' })).status, 400);        // no words, any work mode
  assert.equal((await call('/api/saved-searches', 'POST', { name: 'X', q: 'a', work_mode: 'moon' })).status, 400);
  assert.equal((await call('/api/saved-searches', 'POST', { name: 'X', q: 'a', posted: 'year' })).status, 400);
  assert.equal((await call('/api/saved-searches', 'POST', { name: 'X', q: 'a', notify: 'daily' })).status, 400);
  assert.equal((await call('/api/saved-searches', 'POST', { name: 'x'.repeat(61), q: 'a' })).status, 400);
  const r = await call('/api/saved-searches', 'POST', { name: '  DevOps,   Colombo ', q: ' devops  colombo ' });
  assert.equal(r.status, 200);
  assert.deepEqual({ ...r.data.search, id: 0 }, { id: 0, name: 'DevOps, Colombo', q: 'devops colombo', work_mode: 'any', posted: '3d', notify: 'open', position: 1 });
  const m = await call('/api/saved-searches', 'POST', { name: 'Remote', q: '', work_mode: 'remote' });   // a work mode alone is enough
  assert.equal(m.status, 200);
});

test('new counts use the same rule as the Found list', async () => {
  await call('/api/found/refresh', 'POST');
  let { searches } = (await call('/api/saved-searches')).data;
  assert.deepEqual(searches.map((s) => [s.name, s.new_count]), [['DevOps, Colombo', 1], ['Remote', 1]]);   // job 3 is older than 3 days
  const list = (await call('/api/found?q=devops+colombo&posted=3d&work_mode=any')).data;
  assert.equal(searches[0].new_count, list.new_count);

  // Leaving Found moves the marker: nothing is new any more.
  await call('/api/found/left', 'POST');
  searches = (await call('/api/saved-searches')).data.searches;
  assert.deepEqual(searches.map((s) => s.new_count), [0, 0]);
});

test('hidden jobs never count, and Never turns the count off', async () => {
  clock.now = new Date(clock.now.getTime() + 40 * 60000);
  const more = xml(item(1, 'DevOps Engineer', 'Northwind', 0, '<p>Kubernetes, Colombo office.</p>'), item(4, 'Junior DevOps', 'Hooli', 0), item(5, 'DevOps Analyst', 'Pied Piper', 0));
  server.close();
  const s2 = createServer(db, { fetchFeed: async () => more, now: () => clock.now });
  await new Promise((ok) => s2.listen(0, '127.0.0.1', ok));
  const b2 = `http://127.0.0.1:${s2.address().port}`;
  try {
    const r = await fetch(b2 + '/api/found/refresh', { method: 'POST' });
    assert.equal((await r.json()).added, 2);
    const get = async () => (await (await fetch(b2 + '/api/saved-searches')).json()).searches;
    assert.equal((await get())[0].new_count, 2);
    const list = await (await fetch(b2 + '/api/found?q=devops')).json();
    const id = list.jobs.find((j) => j.title === 'Junior DevOps').id;
    await fetch(`${b2}/api/found/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: true }) });
    assert.equal((await get())[0].new_count, 1);
    const first = (await get())[0];
    await fetch(`${b2}/api/saved-searches/${first.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notify: 'never' }) });
    assert.equal((await get())[0].new_count, null);
  } finally {
    s2.close();
  }
});

test('update, delete and unknown ids', async () => {
  const s3 = createServer(db, { now: () => clock.now });
  await new Promise((ok) => s3.listen(0, '127.0.0.1', ok));
  const b3 = `http://127.0.0.1:${s3.address().port}`;
  const send = async (path, method, body) => {
    const res = await fetch(b3 + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  try {
    const { searches } = (await send('/api/saved-searches', 'GET')).data;
    const id = searches[0].id;
    const u = await send(`/api/saved-searches/${id}`, 'PATCH', { name: 'Renamed', posted: 'week' });
    assert.equal(u.data.search.name, 'Renamed');
    assert.equal(u.data.search.posted, 'week');
    assert.equal(u.data.search.q, 'devops colombo');     // not sent, so unchanged
    assert.equal((await send(`/api/saved-searches/${id}`, 'PATCH', { name: ' ' })).status, 400);
    assert.equal((await send('/api/saved-searches/999', 'PATCH', { name: 'x' })).status, 404);
    assert.equal((await send('/api/saved-searches/abc', 'DELETE')).status, 404);
    assert.equal((await send(`/api/saved-searches/${id}`, 'DELETE')).status, 200);
    assert.equal((await send('/api/saved-searches', 'GET')).data.searches.length, 1);
  } finally {
    s3.close();
  }
});

test('at most 20 saved searches', async () => {
  const db2 = openDb(':memory:');
  const s = createServer(db2);
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const b = `http://127.0.0.1:${s.address().port}`;
  try {
    let last;
    for (let i = 0; i < 21; i++) {
      last = await fetch(b + '/api/saved-searches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `S${i}`, q: 'x' }) });
    }
    assert.equal(last.status, 400);
  } finally {
    s.close();
  }
});

test('backup keeps saved searches, and an old backup leaves them alone', async () => {
  const db2 = openDb(':memory:');
  const s = createServer(db2);
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const b = `http://127.0.0.1:${s.address().port}`;
  const send = (path, method, body) => fetch(b + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  try {
    await send('/api/saved-searches', 'POST', { name: 'QA', q: 'qa', work_mode: 'remote' });
    const backup = await (await send('/api/backup', 'GET')).json();
    assert.equal(backup.tables.saved_searches.length, 1);
    await send(`/api/saved-searches/${backup.tables.saved_searches[0].id}`, 'DELETE');
    assert.equal((await send('/api/restore', 'POST', backup)).status, 200);
    assert.equal((await (await send('/api/saved-searches', 'GET')).json()).searches[0].name, 'QA');
    // An old backup (no saved_searches list) restores fine and keeps what is there.
    const old = { ...backup, tables: { ...backup.tables } };
    delete old.tables.saved_searches;
    assert.equal((await send('/api/restore', 'POST', old)).status, 200);
    assert.equal((await (await send('/api/saved-searches', 'GET')).json()).searches.length, 1);
  } finally {
    s.close();
  }
});
