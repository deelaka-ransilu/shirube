import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { STORED } from '../lib/cv-store.js';

const dir = mkdtempSync(join(tmpdir(), 'shirube-cv-'));
const db = openDb(':memory:');
const server = createServer(db, { cvDir: dir });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('fake pdf body')]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('fake docx body')]);
const DOC = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.from('fake doc body')]);

async function json(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}
const upload = async (id, name, bytes) => {
  const res = await fetch(`${base}/api/jobs/${id}/cv?name=${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
  return { status: res.status, data: await res.json() };
};
const newJob = async (title = 'SRE') => (await json('/api/jobs', { method: 'POST', body: { title, company: 'Sysco LABS' } })).data.job.id;
const stored = () => readdirSync(dir);

test('upload a PDF: saved under a random name, opens inline with the right bytes', async () => {
  const id = await newJob();
  const { status, data } = await upload(id, 'Deelaka - SRE.pdf', PDF);
  assert.equal(status, 200);
  const j = data.job;
  assert.deepEqual([j.cv_name, j.cv_source], ['Deelaka - SRE.pdf', 'uploaded']);
  assert.match(j.cv_file, STORED);
  assert.match(j.cv_added_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(existsSync(join(dir, j.cv_file)));

  const res = await fetch(`${base}/api/jobs/${id}/cv/file`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /^inline;/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF);
});

test('replace: the new file wins and the old one is deleted', async () => {
  const id = await newJob('Replace me');
  const first = (await upload(id, 'one.pdf', PDF)).data.job.cv_file;
  const second = (await upload(id, 'two.docx', DOCX)).data.job;
  assert.notEqual(second.cv_file, first);
  assert.ok(!existsSync(join(dir, first)), 'old file removed');
  const res = await fetch(`${base}/api/jobs/${id}/cv/file`);
  assert.match(res.headers.get('content-disposition'), /^attachment;/, 'Word files download');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), DOCX);
  assert.equal((await upload(id, 'old.doc', DOC)).status, 200);
});

test('save the Word CV Shirube makes for the job', async () => {
  await json('/api/profile', { method: 'PATCH', body: { name: 'Dee Test' } });
  const id = await newJob('Made one');
  const { status, data } = await json(`/api/jobs/${id}/cv/made`, { method: 'POST' });
  assert.equal(status, 200);
  assert.equal(data.job.cv_source, 'made');
  assert.match(data.job.cv_name, /\.docx$/);
  const bytes = Buffer.from(await (await fetch(`${base}/api/jobs/${id}/cv/file`)).arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'a real zip (docx)');
});

test('wrong files are refused and nothing is stored', async () => {
  const id = await newJob('Refuse');
  const before = stored().length;
  assert.equal((await upload(id, 'virus.exe', PDF)).status, 400, 'extension');
  assert.equal((await upload(id, 'cv', PDF)).status, 400, 'no extension');
  assert.equal((await upload(id, 'fake.pdf', Buffer.from('not a pdf'))).status, 400, 'a renamed file');
  assert.equal((await upload(id, 'fake.docx', PDF)).status, 400, 'pdf bytes named docx');
  assert.equal((await upload(id, 'empty.pdf', Buffer.alloc(0))).status, 400, 'empty');
  const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024)]);
  assert.equal((await upload(id, 'big.pdf', big)).status, 413, 'over 10 MB');
  assert.equal((await upload(9999, 'x.pdf', PDF)).status, 404, 'no such job');
  assert.equal(stored().length, before);
  assert.equal((await json(`/api/jobs/${id}`)).data.job.cv_name, '');
  // JSON sent to the file route is not a file
  assert.equal((await json(`/api/jobs/${id}/cv`, { method: 'PUT', body: { a: 1 } })).status, 400);
});

test('a file name with folders in it keeps only the last part', async () => {
  const id = await newJob('Names');
  const j = (await upload(id, '../../etc/Deelaka CV.pdf', PDF)).data.job;
  assert.equal(j.cv_name, 'Deelaka CV.pdf');
  assert.match(j.cv_file, STORED);
});

test('remove the CV: the file and the columns are cleared; a job with no CV answers 404', async () => {
  const id = await newJob('Remove');
  const file = (await upload(id, 'a.pdf', PDF)).data.job.cv_file;
  const gone = (await json(`/api/jobs/${id}/cv`, { method: 'DELETE' })).data.job;
  assert.deepEqual([gone.cv_name, gone.cv_file, gone.cv_source, gone.cv_added_on], ['', '', '', '']);
  assert.ok(!existsSync(join(dir, file)));
  assert.equal((await fetch(`${base}/api/jobs/${id}/cv/file`)).status, 404);
});

test('deleting the job deletes its CV file', async () => {
  const id = await newJob('Delete job');
  const file = (await upload(id, 'a.pdf', PDF)).data.job.cv_file;
  assert.ok(existsSync(join(dir, file)));
  await json(`/api/jobs/${id}`, { method: 'DELETE' });
  assert.ok(!existsSync(join(dir, file)));
});

test('a stored name from a backup is never trusted as a path', async () => {
  const id = await newJob('Tricky');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '..', 'outside.pdf'), PDF);
  db.prepare('UPDATE jobs SET cv_name = ?, cv_file = ? WHERE id = ?').run('x.pdf', '../outside.pdf', id);
  assert.equal((await fetch(`${base}/api/jobs/${id}/cv/file`)).status, 404);
  assert.equal((await json(`/api/jobs/${id}/cv`, { method: 'DELETE' })).status, 200);
  assert.ok(existsSync(join(dir, '..', 'outside.pdf')), 'the file outside the folder was not touched');
  // a name that is allowed but whose file is missing (a backup restored on another computer)
  db.prepare('UPDATE jobs SET cv_name = ?, cv_file = ? WHERE id = ?').run('x.pdf', '00000000-0000-4000-8000-000000000000.pdf', id);
  const res = await fetch(`${base}/api/jobs/${id}/cv/file`);
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /another one/);
});

test('editing a job cannot set the CV columns, and a backup keeps the CV name', async () => {
  const id = await newJob('Columns');
  await upload(id, 'keep.pdf', PDF);
  const patched = (await json(`/api/jobs/${id}`, { method: 'PATCH', body: { cv_file: '../x.pdf', cv_name: 'hack.pdf', title: 'Columns 2' } })).data.job;
  assert.equal(patched.cv_name, 'keep.pdf');
  assert.match(patched.cv_file, STORED);
  const backup = (await json('/api/backup')).data;
  assert.ok(backup.tables.jobs.some((j) => j.cv_name === 'keep.pdf'));
});
