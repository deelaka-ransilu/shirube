import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { todayLocal, addDays, daysBetween } from '../lib/dates.js';
import { followUpInfo } from '../lib/followups.js';

const day = (offset) => addDays(todayLocal(), offset);

test('date helpers', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-11-04', '2026-11-12'), 8);
});

test('followUpInfo: only applied jobs, counted from the last applied or follow-up', () => {
  const job = { status: 'applied', applied_on: '2026-11-04' };
  const applied = { id: 1, kind: 'applied', happened_on: '2026-11-04' };
  assert.equal(followUpInfo({ ...job, status: 'reply' }, [applied], 7, '2026-11-20'), null);
  assert.equal(followUpInfo(job, [applied], 7, '2026-11-10').state, 'later');
  assert.equal(followUpInfo(job, [applied], 7, '2026-11-11').state, 'today');
  const late = followUpInfo(job, [applied], 7, '2026-11-14');
  assert.equal(late.state, 'overdue');
  assert.equal(late.due_on, '2026-11-11');
  assert.equal(late.days_since, 10);
  // a follow-up resets the wait; one dated in the future has not happened yet
  const chased = { id: 2, kind: 'follow_up', happened_on: '2026-11-12' };
  assert.equal(followUpInfo(job, [applied, chased], 7, '2026-11-14').state, 'later');
  assert.equal(followUpInfo(job, [applied, chased], 7, '2026-11-14').since, 'follow_up');
  const planned = { id: 3, kind: 'follow_up', happened_on: '2026-12-20' };
  assert.equal(followUpInfo(job, [applied, planned], 7, '2026-11-14').since, 'applied');
  assert.equal(followUpInfo({ status: 'applied', applied_on: '' }, [], 7, '2026-11-14'), null);
});

test('Follow-ups board: columns, order, due state, bell count and quick follow-up', async () => {
  const server = createServer(openDb(':memory:'));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET', body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  };
  const mk = async (title) => (await call('/api/jobs', 'POST', { title, company: title + ' Ltd' })).job.id;
  const st = (id, kind, offset, note = '') => call(`/api/jobs/${id}/stages`, 'POST', { kind, happened_on: day(offset), note });

  try {
    assert.deepEqual(await call('/api/followups/count'), { due: 0 });

    await mk('Not applied');                       // open: not on the board
    const fresh = await mk('Fresh');   await st(fresh, 'applied', -2);
    const old = await mk('Old');       await st(old, 'applied', -12);
    const edge = await mk('Edge');     await st(edge, 'applied', -7);
    const talk = await mk('Talk');     await st(talk, 'applied', -9); await st(talk, 'reply', -5, 'HR call'); await st(talk, 'interview', 3);
    const deal = await mk('Deal');     await st(deal, 'applied', -9); await st(deal, 'offer', -1);
    const gone = await mk('Gone');     await st(gone, 'applied', -9); await st(gone, 'rejected', -2);

    const board = await call('/api/followups');
    assert.deepEqual(board.columns.map((c) => c.key), ['waiting', 'talks', 'offer', 'closed']);
    const names = (key) => board.columns.find((c) => c.key === key).jobs.map((j) => j.title);
    assert.deepEqual(names('waiting'), ['Old', 'Edge', 'Fresh']);   // overdue, due today, then waiting
    assert.deepEqual(names('talks'), ['Talk']);
    assert.deepEqual(names('offer'), ['Deal']);
    assert.deepEqual(names('closed'), ['Gone']);
    assert.equal(board.due, 2);

    const waiting = board.columns[0].jobs;
    assert.equal(waiting[0].follow_up.state, 'overdue');
    assert.equal(waiting[1].follow_up.state, 'today');
    assert.equal(waiting[2].follow_up.state, 'later');
    assert.equal(board.columns[1].jobs[0].follow_up, null);
    assert.deepEqual(board.columns[1].jobs[0].stages.map((s) => s.kind), ['applied', 'reply', 'interview']);
    assert.equal(board.columns[1].jobs[0].stages[1].note, 'HR call');

    assert.deepEqual(await call('/api/followups/count'), { due: 2 });

    // "Followed up today" = a follow-up stage dated today: the wait starts again
    await call(`/api/jobs/${old}/stages`, 'POST', { kind: 'follow_up', happened_on: todayLocal() });
    const after = await call('/api/followups');
    assert.equal(after.due, 1);
    assert.equal(after.columns[0].jobs.find((j) => j.id === old).follow_up.since, 'follow_up');
  } finally {
    server.close();
  }
});
