import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextUp, statRow, whenText, sinceStart } from '../public/js/lib/dash.js';

const TODAY = '2026-11-18';

test('nextUp: an urgent step wins and says how many more wait', () => {
  const up = nextUp({
    next_steps: [
      { kind: 'follow_up', job_id: 4, title: 'Ops Engineer', company: 'Sysco LABS', date: '2026-11-10', days: 8, since: 'applied' },
      { kind: 'apply', job_id: 1, title: 'DevOps', company: 'Velaris', date: '2026-11-30', open_count: 3 },
    ],
    open: [],
  }, TODAY);
  assert.equal(up.sentence, 'Follow up with Sysco LABS');
  assert.equal(up.href, '#/jobs/4');
  assert.match(up.line, /Applied 10 Nov, 8 days with no reply\./);
  assert.match(up.line, /1 more after this\./);
});

test('nextUp: an apply step names the job and the closing date', () => {
  const up = nextUp({ next_steps: [{ kind: 'apply', job_id: 1, title: 'DevOps', company: 'Velaris', date: '2026-11-30', open_count: 1 }], open: [] }, TODAY);
  assert.equal(up.sentence, 'Start with DevOps');
  assert.equal(up.line, 'Velaris · Closes 30 Nov, the soonest of your 1 open job.');
});

test('nextUp: with nothing urgent, the first open job is suggested and the line is honest', () => {
  const up = nextUp({ next_steps: [], open: [{ id: 2, title: 'React Web Developer', company: 'Affno', found_on: '2026-11-16' }] }, TODAY);
  assert.equal(up.sentence, 'Start with React Web Developer');
  assert.equal(up.href, '#/jobs/2');
  assert.equal(up.line, 'Affno · found 16 Nov. Nothing is due and no open job has a closing date coming up.');
});

test('nextUp: nothing open and nothing due is said plainly', () => {
  const up = nextUp({ next_steps: [], open: [] }, TODAY);
  assert.equal(up.sentence, 'All caught up');
  assert.equal(up.href, '');
});

test('statRow gives applied, reply, interview, offer in that order', () => {
  assert.deepEqual(statRow({ applied: 2, reply: 1, interview: 0, offer: 0, rejected: 5 }).map((s) => [s.key, s.n]),
    [['applied', 2], ['reply', 1], ['interview', 0], ['offer', 0]]);
  assert.equal(statRow({}).every((s) => s.n === 0), true);
});

test('whenText: closing date, else the day it was found', () => {
  assert.equal(whenText({ closes_on: '', found_on: '2026-11-16' }, TODAY), 'Found 16 Nov');
  assert.equal(whenText({ closes_on: '2026-11-30', found_on: '' }, TODAY), 'Closes 30 Nov · 12 days');
  assert.equal(whenText({ closes_on: '', found_on: '' }, TODAY), 'No closing date');
});

test('sinceStart: nothing applied yet says so and draws no boxes', () => {
  const none = sinceStart([], TODAY);
  assert.equal(none.empty, true);
  assert.equal(none.total, 0);
  assert.deepEqual(none.cells, []);
  assert.equal(sinceStart([{ date: '2026-11-17', count: 0 }], TODAY).empty, true);
});

test('sinceStart: one box per day from the first application to today', () => {
  const s = sinceStart([{ date: '2026-11-15', count: 1 }, { date: '2026-11-17', count: 2 }], TODAY);
  assert.equal(s.empty, false);
  assert.equal(s.unit, 'day');
  assert.deepEqual(s.cells, [1, 0, 2, 0]); // 15, 16, 17, 18 Nov
  assert.equal(s.total, 3);
  assert.equal(s.label, 'applied · since 15 Nov');
  assert.equal(s.line, '3 applications in 4 days');
  assert.match(s.aria, /^Applications sent since 15 Nov, one box per day: 3 in total/);
});

test('sinceStart: the first day alone is one box and "1 application in 1 day"', () => {
  const s = sinceStart([{ date: TODAY, count: 1 }], TODAY);
  assert.deepEqual(s.cells, [1]);
  assert.equal(s.line, '1 application in 1 day');
});

test('sinceStart: a long history switches to one box per week and keeps the newest 147', () => {
  const s = sinceStart([{ date: '2026-01-01', count: 2 }, { date: '2026-11-18', count: 1 }], TODAY);
  assert.equal(s.unit, 'week');
  assert.equal(s.cells[0], 2);
  assert.equal(s.cells[s.cells.length - 1], 1);
  assert.equal(s.cells.length, Math.ceil(322 / 7)); // 1 Jan to 18 Nov is 322 days
  const huge = sinceStart([{ date: '2020-01-01', count: 5 }, { date: '2026-11-18', count: 1 }], TODAY);
  assert.equal(huge.cells.length, 147);
  assert.equal(huge.cells[146], 1);
  assert.equal(huge.total, 6);
});
