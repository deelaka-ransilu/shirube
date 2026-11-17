import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { cvPaper } from '../public/js/lib/cv-paper.js';
import { placeLine, contactParts, languageLine } from '../public/js/lib/contact.js';
import { makeDocx } from '../lib/docx.js';
import { inflateRawSync } from 'node:zlib';

const db = openDb(':memory:');
const server = createServer(db, {});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

// Reads the text of word/document.xml out of a .docx (stored or deflated entries).
function docXml(buf) {
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const csize = buf.readUInt32LE(p + 18);
    const nlen = buf.readUInt16LE(p + 26);
    const xlen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nlen).toString();
    const data = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + csize);
    if (name === 'word/document.xml') return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    p += 30 + nlen + xlen + csize;
  }
  throw new Error('no document.xml');
}

test('migration 008 moves the old "GitHub or LinkedIn" value to the field it belongs to', () => {
  const dir = new URL('../migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const cases = [
    ['https://www.linkedin.com/in/dee', { linkedin: 'https://www.linkedin.com/in/dee', github: '', other_link: '' }],
    ['https://github.com/dee', { linkedin: '', github: 'https://github.com/dee', other_link: '' }],
    ['https://dee.example/me', { linkedin: '', github: '', other_link: 'https://dee.example/me' }],
    ['', { linkedin: '', github: '', other_link: '' }],
  ];
  for (const [social, want] of cases) {
    const old = new DatabaseSync(':memory:');
    old.exec('PRAGMA foreign_keys = ON;');
    for (const f of files.filter((n) => n < '008')) old.exec(readFileSync(new URL(f, dir), 'utf8'));
    old.prepare('UPDATE profile SET social = ?, name = ? WHERE id = 1').run(social, 'Dee');
    old.exec(readFileSync(new URL(files.find((n) => n.startsWith('008')), dir), 'utf8'));
    const row = old.prepare('SELECT * FROM profile WHERE id = 1').get();
    assert.equal(row.name, 'Dee');
    assert.equal(row.country, '');
    assert.deepEqual({ linkedin: row.linkedin, github: row.github, other_link: row.other_link }, want, social);
    assert.ok(!('social' in row), 'the old column is gone');
  }
});

test('profile: country and the four links save, trim and are checked', async () => {
  const ok = await call('/api/profile', {
    method: 'PATCH',
    body: { country: ' Sri Lanka ', portfolio: 'https://deelakaransilu.me', linkedin: 'https://www.linkedin.com/in/deelakaransilu', github: 'https://github.com/deelaka-ransilu', other_link: 'https://bitprep.tech' },
  });
  assert.equal(ok.status, 200);
  const p = ok.data.profile;
  assert.deepEqual([p.country, p.linkedin, p.github, p.other_link], ['Sri Lanka', 'https://www.linkedin.com/in/deelakaransilu', 'https://github.com/deelaka-ransilu', 'https://bitprep.tech']);
  for (const body of [{ linkedin: 'linkedin.com/in/x' }, { github: 'javascript:1' }, { other_link: 'nope' }, { country: 'x'.repeat(101) }, { country: 5 }]) {
    assert.equal((await call('/api/profile', { method: 'PATCH', body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await call('/api/profile', { method: 'PATCH', body: { linkedin: '' } })).data.profile.linkedin, '');
});

test('languages: add, edit, remove, checks', async () => {
  assert.deepEqual((await call('/api/profile')).data.languages, []);
  const made = await call('/api/languages', { method: 'POST', body: { name: 'Sinhalese', level: 'Native or Bilingual' } });
  assert.equal(made.status, 200);
  const id = made.data.id;
  await call('/api/languages', { method: 'POST', body: { name: 'English' } });
  assert.deepEqual((await call('/api/profile')).data.languages.map((l) => l.name), ['Sinhalese', 'English']);
  assert.equal((await call('/api/languages', { method: 'POST', body: { name: ' ' } })).status, 400);
  assert.equal((await call('/api/languages', { method: 'POST', body: { name: 'Tamil', level: 'x'.repeat(61) } })).status, 400);
  const edit = await call(`/api/languages/${id}`, { method: 'PATCH', body: { level: 'Native' } });
  assert.equal(edit.data.languages[0].level, 'Native');
  assert.equal((await call(`/api/languages/${id}`, { method: 'PATCH', body: { name: '' } })).status, 400);
  assert.equal((await call('/api/languages/999', { method: 'PATCH', body: { level: 'x' } })).status, 404);
  assert.equal((await call(`/api/languages/${id}`, { method: 'DELETE' })).data.languages.length, 1);
});

test('languages and the new profile fields go through backup and restore', async () => {
  await call('/api/profile', { method: 'PATCH', body: { country: 'Sri Lanka', linkedin: 'https://www.linkedin.com/in/dee' } });
  await call('/api/languages', { method: 'POST', body: { name: 'Sinhalese', level: 'Native or Bilingual' } });
  const backup = (await call('/api/backup')).data;
  assert.ok(backup.tables.languages.length >= 1);
  const names = (await call('/api/profile')).data.languages.map((l) => l.name);

  await call('/api/languages', { method: 'POST', body: { name: 'Extra' } });
  await call('/api/profile', { method: 'PATCH', body: { country: 'Elsewhere' } });
  assert.equal((await call('/api/restore', { method: 'POST', body: backup })).status, 200);
  const after = (await call('/api/profile')).data;
  assert.deepEqual(after.languages.map((l) => l.name), names);
  assert.equal(after.profile.country, 'Sri Lanka');
  assert.equal(after.profile.linkedin, 'https://www.linkedin.com/in/dee');

  // an older backup without languages keeps the ones you have now
  const old = structuredClone(backup);
  delete old.tables.languages;
  assert.equal((await call('/api/restore', { method: 'POST', body: old })).status, 200);
  assert.equal((await call('/api/profile')).data.languages.length, names.length);
});

test('a backup from before step 45 (one "social" link) restores into the right new field', async () => {
  const backup = (await call('/api/backup')).data;
  for (const [social, key] of [['https://github.com/dee', 'github'], ['https://www.linkedin.com/in/dee', 'linkedin'], ['https://dee.example', 'other_link']]) {
    const old = structuredClone(backup);
    for (const k of ['linkedin', 'github', 'other_link', 'country']) delete old.tables.profile[0][k];
    old.tables.profile[0].social = social;
    assert.equal((await call('/api/restore', { method: 'POST', body: old })).status, 200);
    assert.equal((await call('/api/profile')).data.profile[key], social);
  }
});

test('contact helpers: place line, link line, language line', () => {
  assert.equal(placeLine({ location: 'Colombo', country: 'Sri Lanka' }), 'Colombo, Sri Lanka');
  assert.equal(placeLine({ location: 'Colombo, Sri Lanka', country: 'Sri Lanka' }), 'Colombo, Sri Lanka', 'no double country');
  assert.equal(placeLine({ location: '', country: 'Sri Lanka' }), 'Sri Lanka');
  assert.equal(placeLine({ location: 'Colombo', country: '' }), 'Colombo');
  assert.deepEqual(
    contactParts({ email: 'a@b.c', phone: '', location: 'Colombo', country: 'Sri Lanka', portfolio: 'https://x.dev/', linkedin: 'https://www.linkedin.com/in/dee', github: '', other_link: 'https://bitprep.tech' }),
    ['a@b.c', 'Colombo, Sri Lanka', 'x.dev', 'www.linkedin.com/in/dee', 'bitprep.tech'],
  );
  assert.equal(languageLine([{ name: 'Sinhalese', level: 'Native or Bilingual' }, { name: 'English', level: '' }]), 'Sinhalese (Native or Bilingual), English');
});

test('the CV paper and the Word CV show country, links and languages', async () => {
  await call('/api/profile', { method: 'PATCH', body: { name: 'Dee', location: 'Colombo', country: 'Sri Lanka', portfolio: 'https://deelakaransilu.me', linkedin: 'https://www.linkedin.com/in/deelakaransilu', github: 'https://github.com/deelaka-ransilu', other_link: 'https://bitprep.tech' } });
  await call('/api/languages', { method: 'POST', body: { name: 'English', level: 'Professional Working' } });
  const job = (await call('/api/jobs', { method: 'POST', body: { title: 'SRE', company: 'Globex', description: 'Docker and Linux' } })).data.job.id;
  const m = (await call(`/api/jobs/${job}/match`)).data;
  assert.equal(m.person.country, 'Sri Lanka');
  assert.ok(m.languages.some((l) => l.name === 'English'));

  const paper = String(cvPaper(m));
  assert.match(paper, /Colombo, Sri Lanka/);
  for (const link of ['deelakaransilu.me', 'www.linkedin.com/in/deelakaransilu', 'github.com/deelaka-ransilu', 'bitprep.tech']) assert.ok(paper.includes(link), link);
  assert.match(paper, /Languages[\s\S]*English \(Professional Working\)/);

  const doc = docXml((await fetch(`${base}/api/jobs/${job}/cv.docx`).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b))));
  assert.match(doc, /Colombo, Sri Lanka/);
  assert.match(doc, /bitprep\.tech/);
  assert.match(doc, /Languages[\s\S]*English \(Professional Working\)/);
});

test('makeDocx leaves the Languages heading out when there are none', () => {
  const d = { job: { company: 'X' }, person: { name: 'Dee' }, preset: {}, best_skills: [], experience: [], education: [], certifications: [], languages: [] };
  assert.doesNotMatch(docXml(makeDocx(d)), /Languages/);
});
