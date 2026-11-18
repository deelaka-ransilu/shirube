import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextUp, statRow, whenText, sentSummary } from '../public/js/lib/dash.js';

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

test('sentSummary: none, one day, several days', () => {
  const days = (counts) => counts.map((count, i) => ({ date: `2026-11-${12 + i}`, count }));
  assert.equal(sentSummary(days([0, 0, 0, 0, 0, 0, 0]), TODAY).line, 'None sent in the last 7 days');
  assert.equal(sentSummary([], TODAY).line, 'None sent in the last 7 days');
  assert.equal(sentSummary(days([0, 0, 0, 0, 0, 2, 0]), TODAY).line, '2 sent on 17 Nov');
  const many = sentSummary(days([1, 0, 0, 0, 0, 2, 0]), TODAY);
  assert.equal(many.line, '3 sent in the last 7 days');
  assert.deepEqual(many.columns, [1, 0, 0, 0, 0, 2, 0]);
  assert.match(many.aria, /^Applications sent each day, last 7 days: 12 Nov 1, 13 Nov 0/);
});
