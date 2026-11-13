import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { todayLocal } from '../lib/dates.js';

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

// A date this many days from today (negative = in the past), as YYYY-MM-DD.
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return todayLocal(d);
}
const job = async (body) => (await call('/api/jobs', { method: 'POST', body })).data.job;
const stage = (id, kind, offset, note = '') => call(`/api/jobs/${id}/stages`, { method: 'POST', body: { kind, happened_on: day(offset), note } });
const dash = async () => (await call('/api/dashboard')).data;

test('empty database gives empty lists and zero counts', async () => {
  const d = await dash();
  assert.equal(d.counts.all, 0);
  assert.deepEqual([d.open, d.applied, d.activity, d.next_steps], [[], [], [], []]);
});

test('open jobs: closing soonest first, then no date, then already closed', async () => {
  await job({ title: 'Later', closes_on: day(10) });
  await job({ title: 'No date' });
  await job({ title: 'Closed', closes_on: day(-2) });
  await job({ title: 'Soon', closes_on: day(3) });
  const d = await dash();
  assert.deepEqual(d.open.map((j) => j.title), ['Soon', 'Later', 'No date', 'Closed']);
  assert.equal(d.counts.open, 4);
});

test('applied list skips open and rejected jobs, newest application first', async () => {
  const a = await job({ title: 'Old apply', company: 'Acme' });
  const b = await job({ title: 'New apply', company: 'Globex' });
  const c = await job({ title: 'Turned down' });
  await stage(a.id, 'applied', -20);
  await stage(b.id, 'applied', -1);
  await stage(c.id, 'applied', -5);
  await stage(c.id, 'rejected', -2);
  const d = await dash();
  assert.deepEqual(d.applied.map((j) => j.title), ['New apply', 'Old apply']);
  assert.equal(d.counts.rejected, 1);
});

test('what happened: latest first, future dates left out', async () => {
  const j = await job({ title: 'Activity job' });
  await stage(j.id, 'applied', -3);
  await stage(j.id, 'reply', -1);
  await stage(j.id, 'interview', 4); // booked for later: not "happened" yet
  const d = await dash();
  const mine = d.activity.filter((a) => a.job_id === j.id);
  assert.deepEqual(mine.map((a) => a.kind), ['reply', 'applied']);
  assert.ok(d.activity.every((a) => a.happened_on <= d.today));
  assert.ok(d.activity.length <= 5);
});

test('next steps: follow-up, interview, offer, apply, in that order', async () => {
  const fresh = openDb(':memory:');
  const srv = createServer(fresh);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const send = (path, body) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const mk = async (title, extra = {}) => (await send('/api/jobs', { title, company: title + ' Ltd', ...extra })).job;
  const st = (id, kind, offset) => send(`/api/jobs/${id}/stages`, { kind, happened_on: day(offset) });

  try {
    const stale = await mk('Stale');     // applied 8 days ago, wait is 7 days: due
    const fine = await mk('Fine');       // applied 2 days ago: not due
    const chased = await mk('Chased');   // applied long ago but followed up 2 days ago: not due
    const talk = await mk('Talk');       // interview in 3 days
    const deal = await mk('Deal');       // offer
    await mk('Apply me', { closes_on: day(5) });
    await st(stale.id, 'applied', -8);
    await st(fine.id, 'applied', -2);
    await st(chased.id, 'applied', -20);
    await st(chased.id, 'follow_up', -2);
    await st(talk.id, 'applied', -6);
    await st(talk.id, 'interview', 3);
    await st(deal.id, 'applied', -9);
    await st(deal.id, 'offer', -1);

    const d = await (await fetch(url + '/api/dashboard')).json();
    assert.deepEqual(d.next_steps.map((s) => s.kind), ['follow_up', 'interview', 'offer', 'apply']);
    const [f, i, o, a] = d.next_steps;
    assert.equal(f.title, 'Stale');
    assert.equal(f.days, 8);
    assert.equal(f.since, 'applied');
    assert.equal(i.title, 'Talk');
    assert.equal(i.days, 3);
    assert.equal(o.title, 'Deal');
    assert.equal(a.title, 'Apply me');
    assert.equal(a.days, 5);
    assert.equal(a.open_count, 1);

    // A longer wait in My profile removes the follow-up step.
    await fetch(url + '/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ follow_up_days: 30 }) });
    const later = await (await fetch(url + '/api/dashboard')).json();
    assert.ok(!later.next_steps.some((s) => s.kind === 'follow_up'));
  } finally {
    srv.close();
  }
});

test.after(() => server.close());
