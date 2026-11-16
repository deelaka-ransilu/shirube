import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { bestPresetId } from '../lib/found-match.js';
import { makeMatcher } from '../lib/match.js';

const preset = (id, name, skills) => ({ id, name, matcher: makeMatcher({ skills }, []) });
const SRE = preset(1, 'SRE', ['Docker', 'Linux']);
const WEB = preset(2, 'Web', ['React', 'CSS']);

test('bestPresetId picks the preset with the most matches, the main one wins a tie, none when nothing matches', () => {
  assert.equal(bestPresetId([SRE, WEB], 'Requirements\nReact\nCSS', 1), 2);
  assert.equal(bestPresetId([SRE, WEB], 'Requirements\nDocker\nReact', 2), 2);
  assert.equal(bestPresetId([SRE, WEB], 'Requirements\nDocker\nReact', 1), 1);
  assert.equal(bestPresetId([SRE, WEB], 'We are a friendly team.', 1), null);
  assert.equal(bestPresetId([{ id: 3, name: 'Empty', matcher: null }], 'Requirements\nDocker', 3), null);
});

test('Job details opens on the best preset, and ?preset= still wins', async () => {
  const db = openDb(':memory:');
  const server = createServer(db, {});
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const call = async (path, method = 'GET', body) => {
      const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      return res.json();
    };
    const prof = await call('/api/profile');
    const mainId = prof.presets[0].id;
    await call('/api/profile', 'PATCH', { presets: [{ id: mainId, skills: ['Docker', 'Linux'] }] });
    const web = await call('/api/presets', 'POST', { name: 'Web' });
    const webId = web.preset?.id ?? web.id;
    await call('/api/profile', 'PATCH', { presets: [{ id: webId, skills: ['React', 'CSS'] }] });
    const job = (await call('/api/jobs', 'POST', { title: 'Front-end', description: 'Requirements\nReact\nCSS' })).job;

    const auto = await call(`/api/jobs/${job.id}/match`);
    assert.equal(auto.preset.id, webId);
    assert.equal(auto.best_preset_id, webId);
    const asked = await call(`/api/jobs/${job.id}/match?preset=${mainId}`);
    assert.equal(asked.preset.id, mainId);
    assert.equal(asked.best_preset_id, null);

    const none = (await call('/api/jobs', 'POST', { title: 'Other', description: 'Requirements\nCOBOL' })).job;
    const fallback = await call(`/api/jobs/${none.id}/match`);
    assert.equal(fallback.preset.id, mainId);
    assert.equal(fallback.best_preset_id, null);
  } finally {
    server.close();
  }
});
