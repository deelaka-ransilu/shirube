import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { parseAdvert, parseDate, parseJobTypes } from '../public/js/lib/parse-advert.js';
import { postedChips, appliedChips } from '../public/js/lib/quick-dates.js';

const NOW = new Date(2026, 10, 17); // 17 Nov 2026

// The two Sysco adverts as they were pasted from the Workday page.
const OPS = `Operations Engineer
You applied for this job on November 16, 2026.
View Application
Sysco Global Logo
locations
Sysco LABS - Sri Lanka
time type
Full time
posted on
Posted Today
job requisition id
R274406
JOB DESCRIPTION
Technical Operations Engineer
About Sysco LABS:
Sysco LABS is the Global In-House Center of Sysco Corporation.
Responsibilities:
Monitor production applications using Datadog.
Benefits:
Performance-based annual bonus
Hybrid work arrangement`;

const INTERN = `Intern - Site Reliability Engineering
You applied for this job on November 16, 2026.
View Application
Sysco LABS - Sri Lanka
Full time
Posted 14 Days Ago
R273165
JOB DESCRIPTION
Intern – Site Reliability Engineering
The Big Picture
About Sysco LABS:
Sysco LABS is the Global In-House Center of Sysco Corporation.
We are currently on the lookout for an Intern – Site Reliability Engineering to join our team.`;

test('parseDate also reads month-first dates', () => {
  assert.equal(parseDate('You applied on November 16, 2026.'), '2026-11-16');
  assert.equal(parseDate('Closes Dec 3rd 2026'), '2026-12-03');
  assert.equal(parseDate('30th November 2026'), '2026-11-30');
  assert.equal(parseDate('Foo 16, 2026'), '');
});

test('Sysco Operations Engineer: company, place, applied day and posted day are read', () => {
  const f = parseAdvert(OPS, NOW);
  assert.equal(f.title, 'Operations Engineer');
  assert.equal(f.company, 'Sysco LABS');
  assert.equal(f.location, 'Sri Lanka');
  assert.equal(f.applied_on, '2026-11-16');
  assert.equal(f.posted_on, '2026-11-17');
  assert.equal(f.work_mode, 'hybrid');
  assert.deepEqual(parseJobTypes(OPS), ['Full-time']);
});

test('Sysco intern: full-time AND internship, posted 14 days ago', () => {
  const f = parseAdvert(INTERN, NOW);
  assert.equal(f.title, 'Intern - Site Reliability Engineering');
  assert.equal(f.company, 'Sysco LABS');
  assert.equal(f.location, 'Sri Lanka');
  assert.equal(f.posted_on, '2026-11-03');
  assert.equal(f.work_mode, undefined, 'no work mode is stated');
  assert.deepEqual(parseJobTypes(INTERN), ['Full-time', 'Internship']);
});

test('a heading line is not the title, and "About the role" is not a company', () => {
  const f = parseAdvert('JOB DESCRIPTION\nIntern – Site Reliability Engineering\nAbout the role\nAbout us\nWe are hiring.', NOW);
  assert.equal(f.title, 'Intern – Site Reliability Engineering');
  assert.equal(f.company, undefined);
});

test('posted day: words, weeks, dates, value on the next line, and "30+ days"', () => {
  const posted = (text) => parseAdvert(`Dev\n${text}`, NOW).posted_on;
  assert.equal(posted('Posted Yesterday'), '2026-11-16');
  assert.equal(posted('Posted 2 weeks ago'), '2026-11-03');
  assert.equal(posted('Posted 3 hours ago'), '2026-11-17');
  assert.equal(posted('Date posted: 12 Nov 2026'), '2026-11-12');
  assert.equal(posted('posted on\n3 Nov 2026'), '2026-11-03');
  assert.equal(posted('Posted 30+ Days Ago'), undefined);
  assert.equal(posted('We posted this role on our site and it is great'), undefined);
});

test('ITPro header line gives company and place', () => {
  const f = parseAdvert('Junior Developer\nXitricon   Colombo · Full-time\nApply now\nWe need a developer.', NOW);
  assert.equal(f.title, 'Junior Developer');
  assert.equal(f.company, 'Xitricon');
  assert.equal(f.location, 'Colombo');
});

test('labelled location works, and a label with the value on the next line too', () => {
  assert.equal(parseAdvert('Dev\nLocation: Kandy', NOW).location, 'Kandy');
  assert.equal(parseAdvert('Dev\nLocation\nGalle', NOW).location, 'Galle');
});

test('job types: every type in the top, else the first one anywhere (the old rule stays for Found jobs)', () => {
  assert.deepEqual(parseJobTypes('Part-time Contract Accountant\nColombo'), ['Part-time', 'Contract']);
  const far = `${'line\n'.repeat(25)}This is a contract role.`;
  assert.deepEqual(parseJobTypes(far), ['Contract']);
  assert.deepEqual(parseJobTypes('Nothing here'), []);
  assert.equal(parseAdvert('Dev\nfull time or part time', NOW).job_type, 'Full-time', 'the single type is unchanged');
});

test('quick chips for Posted and Applied', () => {
  assert.deepEqual(postedChips(NOW), [['Today', '2026-11-17'], ['Yesterday', '2026-11-16'], ['2 days ago', '2026-11-15'], ['Last week', '2026-11-10']]);
  assert.deepEqual(appliedChips(NOW), [['Today', '2026-11-17'], ['Yesterday', '2026-11-16'], ['2 days ago', '2026-11-15']]);
});

// ---- the API ----
const db = openDb(':memory:');
const server = createServer(db, {});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test('a job saved with an applied day becomes Applied with a dated stage', async () => {
  const { status, data } = await call('/api/jobs', { method: 'POST', body: {
    title: 'Operations Engineer', company: 'Sysco LABS', location: 'Sri Lanka', job_type: 'Full-time, Internship',
    posted_on: '2026-11-17', applied_on: '2026-11-16', status: 'open',
  } });
  assert.equal(status, 200);
  const j = data.job;
  assert.deepEqual([j.status, j.applied_on, j.posted_on, j.location, j.job_type], ['applied', '2026-11-16', '2026-11-17', 'Sri Lanka', 'Full-time, Internship']);
  const page = (await call(`/api/jobs/${j.id}`)).data;
  assert.deepEqual(page.stages.map((s) => [s.kind, s.happened_on]), [['applied', '2026-11-16']]);
  // Changing the stage later keeps the job in step (it would fall back to open without the stage).
  const moved = (await call(`/api/jobs/${j.id}/stages`, { method: 'POST', body: { kind: 'interview', happened_on: '2026-11-20' } })).data.job;
  assert.deepEqual([moved.status, moved.applied_on], ['interview', '2026-11-16']);
});

test('a job without an applied day stays open; bad days are refused', async () => {
  const open = (await call('/api/jobs', { method: 'POST', body: { title: 'Open one' } })).data.job;
  assert.equal(open.status, 'open');
  assert.equal(open.posted_on, '');
  assert.equal((await call('/api/jobs', { method: 'POST', body: { title: 'x', posted_on: '2026-02-31' } })).status, 400);
  assert.equal((await call('/api/jobs', { method: 'POST', body: { title: 'x', applied_on: 'soon' } })).status, 400);
  assert.equal((await call(`/api/jobs/${open.id}`, { method: 'PATCH', body: { posted_on: '2026-11-03' } })).data.job.posted_on, '2026-11-03');
});

test('All view: can apply first (closing soonest), then applied newest first, rejected last', async () => {
  const d = openDb(':memory:');
  const s = createServer(d, {});
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${s.address().port}`;
  const post = (body) => fetch(`${url}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await post({ title: 'Applied old', applied_on: '2026-11-01' });
    await post({ title: 'Applied new', applied_on: '2026-11-16' });
    await post({ title: 'Open later', closes_on: '2098-12-01' });
    await post({ title: 'Open soon', closes_on: '2098-01-01' });
    const rej = (await (await post({ title: 'Rejected one', applied_on: '2026-11-20' })).json()).job;
    await fetch(`${url}/api/jobs/${rej.id}/stages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'rejected', happened_on: '2026-11-21' }) });
    const all = await (await fetch(`${url}/api/jobs`)).json();
    assert.deepEqual(all.jobs.map((j) => j.title), ['Open soon', 'Open later', 'Applied new', 'Applied old', 'Rejected one']);
    const applied = await (await fetch(`${url}/api/jobs?status=applied`)).json();
    assert.deepEqual(applied.jobs.map((j) => j.title), ['Applied new', 'Applied old']);
  } finally {
    s.close();
  }
});
