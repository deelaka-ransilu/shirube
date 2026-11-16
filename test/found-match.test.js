import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { isEntryLevel, titleWords } from '../lib/found-match.js';

const db = openDb(':memory:');
const server = createServer(db, {});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const get = async (path) => (await fetch(base + path)).json();

const today = new Date().toISOString().slice(0, 10);
const add = db.prepare(
  `INSERT INTO found_jobs (itpro_id, title, company, location, job_type, url, description, published_on, work_mode, closes_on, first_seen_at, last_seen_at)
   VALUES (?, ?, 'Acme', ?, 'Full-time', 'https://itpro.lk/job/1/x/', ?, ?, '', '', '2026-11-14T00:00:00Z', '2026-11-14T00:00:00Z')`,
);
add.run(1, 'ERP Project Manager', 'Colombo', 'Requirements\n5 years experience. SAP.', today);
add.run(2, 'Junior Web Developer', 'Colombo 03', 'Requirements\nReact and JavaScript and CSS. Nice to have: Docker', today);
add.run(3, 'DevOps Engineer', 'Kandy', 'Requirements\nDocker, Kubernetes, Linux', today);

test('without any preset there are no skill or role badges, and has_presets is false', async () => {
  const d = await get('/api/found?posted=any');
  assert.equal(d.has_presets, false);
  assert.ok(d.jobs.every((j) => j.match.skills === null && j.match.role === null));
});

test('an empty preset is ignored; skills and target role make matches', async () => {
  const preset = db.prepare('SELECT id FROM presets ORDER BY id LIMIT 1').get();
  db.prepare('UPDATE presets SET skills = ?, target_role = ? WHERE id = ?').run(JSON.stringify(['React', 'JavaScript', 'CSS']), 'Web Developer', preset.id);
  db.prepare("INSERT INTO presets (name, position, skills, target_role) VALUES ('SRE', 2, ?, 'SRE / DevOps Engineer')").run(JSON.stringify(['Docker', 'Linux', 'Kubernetes']));
  db.prepare("INSERT INTO presets (name, position) VALUES ('Empty', 3)").run();
  const d = await get('/api/found?posted=any');
  assert.equal(d.has_presets, true);
  const by = Object.fromEntries(d.jobs.map((j) => [j.title, j.match]));
  assert.equal(by['ERP Project Manager'].skills, null);
  assert.equal(by['ERP Project Manager'].entry, false);
  assert.equal(by['Junior Web Developer'].skills.preset, 'General');
  assert.equal(by['Junior Web Developer'].skills.matched, 3);
  assert.equal(by['Junior Web Developer'].role, 'General');
  assert.equal(by['Junior Web Developer'].entry, true);
  assert.equal(by['DevOps Engineer'].skills.preset, 'SRE');
  assert.equal(by['DevOps Engineer'].role, 'SRE');
});

test('nothing is hidden by matching; sort=match puts the best matches first, default stays newest first', async () => {
  const plain = await get('/api/found?posted=any');
  const sorted = await get('/api/found?posted=any&sort=match');
  assert.equal(plain.jobs.length, 3);
  assert.equal(sorted.jobs.length, 3);
  assert.equal(sorted.jobs.at(-1).title, 'ERP Project Manager');
});

test('location_has finds places by typed words; location stays an exact place', async () => {
  const has = await get('/api/found?posted=any&location_has=colo');
  assert.deepEqual(has.jobs.map((j) => j.title).sort(), ['ERP Project Manager', 'Junior Web Developer']);
  const exact = await get('/api/found?posted=any&location=Colombo');
  assert.deepEqual(exact.jobs.map((j) => j.title), ['ERP Project Manager']);
});

test('entry level words: title and advert, vetoed by senior or long experience', () => {
  assert.equal(isEntryLevel('Software Intern', ''), true);
  assert.equal(isEntryLevel('Senior Developer', 'fresher'), false);
  assert.equal(isEntryLevel('Support Engineer', 'at least 1 year of experience'), true);
  assert.equal(isEntryLevel('Support Engineer', '3+ years of experience'), false);
  assert.equal(isEntryLevel('Network Admin', 'Manage servers.'), false);
});

test('title words ignore level words and treat QA and Quality Assurance alike', () => {
  assert.deepEqual([...titleWords('Senior Quality Assurance Engineer')], ['qa']);
  assert.ok(titleWords('Site Reliability Engineer').has('sre'));
});
