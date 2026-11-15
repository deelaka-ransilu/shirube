import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foundChips, closeChips } from '../public/js/lib/quick-dates.js';

test('foundChips counts back from today', () => {
  const now = new Date(2026, 10, 15);
  assert.deepEqual(foundChips(now), [['Today', '2026-11-15'], ['Yesterday', '2026-11-14'], ['2 days ago', '2026-11-13'], ['Last week', '2026-11-08']]);
});

test('closeChips counts forward, adds end of month and None', () => {
  const list = closeChips(new Date(2026, 10, 15));
  assert.deepEqual(list.map(([l]) => l), ['Tomorrow', '1 week', '2 weeks', 'End of month', '3 weeks', 'None']);
  assert.deepEqual(Object.fromEntries(list), { Tomorrow: '2026-11-16', '1 week': '2026-11-22', '2 weeks': '2026-11-29', 'End of month': '2026-11-30', '3 weeks': '2026-12-06', None: '' });
});

test('closeChips drops end of month when it is today or repeats another chip', () => {
  assert.ok(!closeChips(new Date(2026, 10, 30)).some(([l]) => l === 'End of month'));
  assert.ok(!closeChips(new Date(2026, 10, 29)).some(([l]) => l === 'End of month'));
  const dates = closeChips(new Date(2026, 10, 23)).map(([, d]) => d);
  assert.equal(new Set(dates).size, dates.length);
});

test('closeChips handles a year change', () => {
  const list = Object.fromEntries(closeChips(new Date(2026, 11, 28)));
  assert.equal(list['1 week'], '2027-01-04');
  assert.equal(list['Tomorrow'], '2026-12-29');
});
