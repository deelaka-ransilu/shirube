import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, nextTheme, THEME_KEY } from '../public/js/lib/theme.js';

test('a saved choice wins over the system setting', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('with no saved choice the system setting decides', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('blue', true), 'dark'); // junk in storage is ignored
});

test('the switch flips between light and dark', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(THEME_KEY, 'shirube-theme');
});
