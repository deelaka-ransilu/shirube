import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOUND_OPTIONS, publicFoundOptions } from '../lib/found-options.js';
import { POSTED_KEYS, MODE_KEYS } from '../routes/found.js';

test('found options: the server keys come from the one config', () => {
  assert.deepEqual(POSTED_KEYS, ['today', '3d', 'week', 'any']);
  assert.deepEqual(MODE_KEYS, ['any', 'onsite', 'hybrid', 'remote']);
  assert.ok(POSTED_KEYS.includes(FOUND_OPTIONS.default_posted));
});

test('found options: the page copy has labels and no server-only days', () => {
  const o = publicFoundOptions();
  assert.equal(o.source, 'ITPro');
  assert.equal(o.refresh_minutes, 30);
  assert.deepEqual(o.posted.map((p) => p.key), POSTED_KEYS);
  assert.ok(o.posted.every((p) => p.label && !('days' in p)));
  assert.deepEqual(o.work_modes.map((m) => m.key), MODE_KEYS);
});
