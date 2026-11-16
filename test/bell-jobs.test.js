import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { dueText, dueJobs, bellHtml, SHOW } from '../public/js/lib/bell.js';
import { nextStatuses } from '../public/js/lib/status.js';

const col = (jobs) => ({ today: '2026-11-16', columns: [{ key: 'waiting', jobs }, { key: 'talks', jobs: [] }] });
const job = (id, state, due_on, extra = {}) => ({ id, title: `Job ${id}`, company: 'Acme', follow_up: { state, due: state !== 'later', due_on }, ...extra });

test('dueText: days overdue, one day, and due today', () => {
  assert.equal(dueText({ state: 'overdue', due_on: '2026-11-14' }, '2026-11-16'), '2 days overdue');
  assert.equal(dueText({ state: 'overdue', due_on: '2026-11-15' }, '2026-11-16'), '1 day overdue');
  assert.equal(dueText({ state: 'today', due_on: '2026-11-16' }, '2026-11-16'), 'Due today');
});

test('the bell card lists only due follow-ups, shows at most five, and links to all of them', () => {
  const jobs = [job(1, 'overdue', '2026-11-10'), job(2, 'later', '2026-11-30'), ...[3, 4, 5, 6, 7, 8].map((i) => job(i, 'today', '2026-11-16'))];
  assert.equal(dueJobs(col(jobs)).length, 7);
  const card = bellHtml(col(jobs));
  assert.equal((String(card).match(/class="bp-row"/g) ?? []).length, SHOW);
  assert.match(String(card), /\+ 2 more/);
  assert.match(String(card), /href="#\/followups"/);
  assert.doesNotMatch(String(card), /Job 2</);
});

test('the bell card says so when nothing is due, and escapes job text', () => {
  assert.match(String(bellHtml(col([job(1, 'later', '2026-11-30')]))), /Nothing due/);
  assert.doesNotMatch(String(bellHtml(col([job(1, 'today', '2026-11-16', { title: '<b>x</b>' })]))), /<b>x<\/b>/);
});

test('a job can only move forward from the list', () => {
  assert.deepEqual(nextStatuses('open'), ['applied']);
  assert.deepEqual(nextStatuses('interview'), ['offer', 'rejected']);
  assert.deepEqual(nextStatuses('rejected'), []);
  assert.deepEqual(nextStatuses('made-up'), []);
});

test('the Jobs list carries the location, and a stage added for today moves the job forward', async () => {
  const db = openDb(':memory:');
  const server = createServer(db, {});
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const call = async (path, method = 'GET', body) => {
      const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, data: await res.json() };
    };
    const made = await call('/api/jobs', 'POST', { title: 'Support Engineer', company: 'Acme', location: 'Colombo' });
    assert.ok(made.status < 300);
    const id = made.data.job?.id ?? made.data.id;
    assert.equal((await call('/api/jobs')).data.jobs[0].location, 'Colombo');
    const moved = await call(`/api/jobs/${id}/stages`, 'POST', { kind: 'applied', happened_on: '2026-11-16' });
    assert.ok(moved.status < 300);
    assert.equal((await call('/api/jobs')).data.jobs[0].status, 'applied');
  } finally {
    server.close();
  }
});
