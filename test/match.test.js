import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advertSkills, matchJob, orderSkills, canonicalSkill } from '../lib/match.js';
import { openDb } from '../db.js';
import { createServer } from '../server.js';

const names = (list) => list.map((s) => s.name).sort();

test('advertSkills finds skills and aliases, not look-alike words', () => {
  const found = advertSkills('We use Postgres, K8s and Node.js. Please express interest. Java and JavaScript. MySQL too.');
  assert.deepEqual(names(found), ['Java', 'JavaScript', 'Kubernetes', 'MySQL', 'Node.js', 'PostgreSQL']);
});

test('advertSkills does not match inside longer names (SQL Server is not also SQL, Git is not GitHub)', () => {
  assert.deepEqual(names(advertSkills('Experience with SQL Server and GitHub.')), ['GitHub', 'SQL Server']);
  assert.deepEqual(names(advertSkills('C++, C# and .NET')), ['.NET', 'C#', 'C++']);
});

test('advertSkills splits asked-for and nice-to-have by heading and by line', () => {
  const advert = [
    'Requirements',
    '- Docker',
    '- Linux',
    'Nice to have',
    '- Terraform',
    '- Experience with Kubernetes',
    'Other',
    'Knowing Ansible is a plus.',
  ].join('\n');
  const level = Object.fromEntries(advertSkills(advert).map((s) => [s.name, s.level]));
  assert.deepEqual(level, { Docker: 'must', Linux: 'must', Terraform: 'nice', Kubernetes: 'nice', Ansible: 'nice' });
});

test('a skill named in both groups counts as asked for', () => {
  const level = Object.fromEntries(advertSkills('Requirements\nDocker\nNice to have\nDocker, Helm').map((s) => [s.name, s.level]));
  assert.equal(level.Docker, 'must');
  assert.equal(level.Helm, 'nice');
});

test('advertSkills strips html tags', () => {
  assert.deepEqual(names(advertSkills('<ul><li>Docker</li><li>Linux</li></ul>')), ['Docker', 'Linux']);
});

test('matchJob counts matches, treats Postgres as PostgreSQL, finds skills in the summary and custom skills', () => {
  const advert = 'Requirements\nPostgreSQL\nDocker\nKubernetes\nBitPrep-style quizzes\nNice to have\nTerraform';
  const preset = { skills: ['Postgres', 'Docker', 'Quizzing'], summary: 'I deploy things with Terraform.' };
  const r = matchJob(advert, preset, []);
  assert.deepEqual(r.counts.all, { total: 4, matched: 3 });
  assert.deepEqual(r.counts.must, { total: 3, matched: 2 });
  assert.deepEqual(r.counts.nice, { total: 1, matched: 1 });
  assert.deepEqual(r.missing, ['Kubernetes']);
  assert.equal(r.skills.find((s) => s.name === 'Terraform').where, 'text');
  assert.equal(r.skills.find((s) => s.name === 'Docker').where, 'skills');
});

test('matchJob reads experience details only for entries it is given', () => {
  const advert = 'Requirements\nDocker\nLinux';
  const r = matchJob(advert, { skills: [], summary: '' }, [{ role: 'Support', details: 'Fixed Linux servers' }]);
  assert.deepEqual(r.missing, ['Docker']);
});

test('matchJob with no recognised skills gives zero totals', () => {
  const r = matchJob('We are a friendly team.', { skills: ['Docker'] }, []);
  assert.deepEqual(r.counts.all, { total: 0, matched: 0 });
});

test('orderSkills puts skills the advert names first and keeps the rest in order', () => {
  const preset = { skills: ['Figma', 'Docker', 'Git', 'Postgres'] };
  const r = matchJob('Requirements\nGit\nPostgreSQL', preset, []);
  assert.deepEqual(orderSkills(preset.skills, r), [
    { name: 'Git', hit: true }, { name: 'Postgres', hit: true }, { name: 'Figma', hit: false }, { name: 'Docker', hit: false },
  ]);
});

test('canonicalSkill', () => {
  assert.equal(canonicalSkill(' k8s '), 'Kubernetes');
  assert.equal(canonicalSkill('Quizzing'), 'Quizzing');
});

const db = openDb(':memory:');
const server = createServer(db, {});
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

test('GET /api/jobs/:id/match uses the main preset and only the shown experience', async () => {
  const { data: prof } = await call('/api/profile');
  const presetId = prof.presets[0].id;
  const shown = (await call('/api/experience', { method: 'POST', body: { company: 'A', role: 'Dev', details: 'Used Linux daily' } })).data;
  await call('/api/experience', { method: 'POST', body: { company: 'B', role: 'Dev', details: 'Used Kubernetes daily' } });
  const shownId = shown.experience?.id ?? shown.id;
  const saved = await call('/api/profile', { method: 'PATCH', body: { presets: [{ id: presetId, skills: ['Docker', 'Figma'], summary: 'Builds things.', experience_ids: [shownId] }] } });
  assert.equal(saved.status, 200);
  const job = (await call('/api/jobs', { method: 'POST', body: { title: 'SRE', company: 'Acme', description: 'Requirements\nDocker\nLinux\nKubernetes' } })).data.job;

  const { status, data } = await call(`/api/jobs/${job.id}/match`);
  assert.equal(status, 200);
  assert.equal(data.job.has_advert, true);
  assert.deepEqual(data.match.counts.all, { total: 3, matched: 2 });
  assert.deepEqual(data.match.missing, ['Kubernetes']);
  assert.deepEqual(data.best_skills.map((s) => s.name), ['Docker', 'Figma']);
  assert.deepEqual(data.to_add.map((s) => s.name), ['Kubernetes']);
  assert.equal(data.experience.length, 1);

  const empty = (await call('/api/jobs', { method: 'POST', body: { title: 'No advert' } })).data.job;
  assert.equal((await call(`/api/jobs/${empty.id}/match`)).data.job.has_advert, false);
  assert.equal((await call('/api/jobs/9999/match')).status, 404);
});

test.after(() => server.close());
