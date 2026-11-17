import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as zlibCrc, inflateRawSync } from 'node:zlib';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { makeDocx, makeZip, xmlText, cvFileName, crc32 } from '../lib/docx.js';
import { printTitle } from '../public/js/lib/print-cv.js';

// Reads a zip back through its central directory, checking every size and CRC.
function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'zip end record');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26);
    const data = buf.subarray(off + 30 + lnlen, off + 30 + lnlen + csize);
    const raw = method === 8 ? inflateRawSync(data) : data;
    assert.equal(raw.length, size, `${name} size`);
    assert.equal(zlibCrc(raw), crc, `${name} crc`);
    files[name] = raw.toString('utf8');
    p += 46 + nlen;
  }
  return files;
}

const sample = () => ({
  job: { company: 'Globex & Sons' },
  person: { name: 'Dee <Sample>', email: 'a@b.c', phone: '', location: '', portfolio: 'https://x.dev/', linkedin: '' },
  preset: { target_role: 'SRE', summary: 'Line one\nLine two' },
  best_skills: [{ name: 'Docker', hit: true }, { name: 'Git', hit: false }],
  experience: [{ company: 'Acme', role: 'Support', start_date: '2025', end_date: '', details: 'Did things\n- Fixed it' }],
  education: [{ school: 'UOM', qualification: 'BIT', start_date: '2023', end_date: '', note: '' }],
  certifications: [{ name: 'GH-900', issuer: 'Microsoft', issued_on: '2026' }],
});

test('crc32 and the zip writer round-trip (stored and compressed files)', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const zip = makeZip([{ name: 'a.txt', data: 'hi' }, { name: 'b.txt', data: 'x'.repeat(5000) }]);
  const files = readZip(zip);
  assert.equal(files['a.txt'], 'hi');
  assert.equal(files['b.txt'].length, 5000);
});

test('docx has the parts Word needs, the text is escaped, nothing is highlighted', () => {
  const files = readZip(makeDocx(sample()));
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels']) {
    assert.ok(n in files, `missing ${n}`);
  }
  const doc = files['word/document.xml'];
  assert.match(doc, /Dee &lt;Sample&gt;/);
  assert.match(doc, /Docker, Git/);
  assert.match(doc, /Summary[\s\S]*Skills[\s\S]*Experience[\s\S]*Education[\s\S]*Certifications/);
  assert.match(doc, /<w:numPr>/, 'a line starting with - becomes a bullet');
  assert.doesNotMatch(doc, /w:highlight|w:shd/);
  assert.equal(xmlText('a&b<c>\u0001'), 'a&amp;b&lt;c&gt;');
});

test('file names are safe and the print title matches them', () => {
  const d = sample();
  assert.equal(cvFileName(d, 'docx'), 'Dee Sample - CV - Globex & Sons.docx');
  d.person.name = 'A/B:C';
  d.job.company = '';
  assert.equal(cvFileName(d, 'docx'), 'A B C - CV.docx');
  assert.equal(printTitle(sample()), 'Dee <Sample> - CV - Globex & Sons');
});

const db = openDb(':memory:');
const server = createServer(db, {});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('GET /api/jobs/:id/cv.docx sends a Word file for the chosen preset', async () => {
  await fetch(`${base}/api/profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test Person' }) });
  const job = (await (await fetch(`${base}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'SRE', company: 'Globex', description: 'Docker and Linux' }) })).json()).job.id;
  const res = await fetch(`${base}/api/jobs/${job}/cv.docx`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /wordprocessingml\.document/);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="Test Person - CV - Globex\.docx"/);
  const files = readZip(Buffer.from(await res.arrayBuffer()));
  assert.match(files['word/document.xml'], /Test Person/);
  assert.equal((await fetch(`${base}/api/jobs/999/cv.docx`)).status, 404);
});
