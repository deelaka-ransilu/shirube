import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { todayLocal, addDays } from '../lib/dates.js';

// A fake ITPro: tests never touch the internet. The clock is fake too.
const clock = { now: new Date('2026-11-14T06:00:00Z') };
const calls = [];
const feeds = {};            // url -> xml, or an Error to throw
const fakeFetch = async (url) => {
  calls.push(url);
  const f = feeds[url];
  if (f instanceof Error) throw f;
  if (f === undefined) throw new Error('404');
  return f;
};

const rfc = (daysAgo) => new Date(clock.now.getTime() - daysAgo * 86400000).toUTCString().replace('GMT', '+0000');
const item = ({ id, title, company = 'Acme', daysAgo = 0, advert = '<p>Work with Linux.</p>', location = 'Colombo' }) => `
  <item><title>${title} at ${company}</title><link>https://itpro.lk/job/${id}/x/</link><guid>https://itpro.lk/job/${id}/x/</guid>
  <pubDate>${rfc(daysAgo)}</pubDate><description>Location: ${location}</description>
  <content:encoded><![CDATA[<strong>Company:</strong> ${company}<br> <strong>Location:</strong> ${location}<br> <strong>Job Type:</strong> Full-time<br><br> <strong>Description:</strong><br>${advert}]]></content:encoded></item>`;
const feed = (...items) => `<rss version="2.0"><channel><title>ITPro</title><ttl>30</ttl>${items.join('')}</channel></rss>`;

const SRE = item({ id: 101, title: 'SRE Engineer', company: 'Northwind Ltd', daysAgo: 0, advert: '<p>Remote role. Closing date: 30 November 2026</p><ul><li>Kubernetes</li></ul>' });
const ALL = 'https://itpro.lk/rss/all/';
const DEVOPS = 'https://itpro.lk/rss/devops-cloud/';

const db = openDb(':memory:');
const server = createServer(db, { fetchFeed: fakeFetch, now: () => clock.now });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (path, method = 'GET', body) => {
  const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
};
test.after(() => server.close());

test('Found starts empty with the default categories', async () => {
  const { data } = await call('/api/found');
  assert.deepEqual(data.jobs, []);
  assert.deepEqual(data.categories, ['devops-cloud', 'information-technology', 'web-development']);
  assert.equal(data.available_categories.length, 5);
  assert.equal(data.last_fetch_at, '');
});

test('Refresh reads the all feed and each followed category, and stores a job once', async () => {
  const qa = item({ id: 102, title: 'QA Engineer', company: 'Globex', daysAgo: 2 });
  const old = item({ id: 103, title: 'Old Support Analyst', company: 'Initech', daysAgo: 9 });
  feeds[ALL] = feed(SRE, qa, old);
  feeds[DEVOPS] = feed(SRE);          // the same job in two feeds
  feeds['https://itpro.lk/rss/information-technology/'] = feed();
  feeds['https://itpro.lk/rss/web-development/'] = feed(qa);

  const r = await call('/api/found/refresh', 'POST');
  assert.equal(r.status, 200);
  assert.equal(r.data.fetched, true);
  assert.equal(r.data.added, 3);
  assert.equal(r.data.failed, 0);
  assert.deepEqual(calls, [ALL, DEVOPS, 'https://itpro.lk/rss/information-technology/', 'https://itpro.lk/rss/web-development/']);

  const all = (await call('/api/found?posted=any')).data;
  assert.equal(all.jobs.length, 3);
  assert.equal(all.last_fetch_at, clock.now.toISOString());
});

test('Refresh inside 30 minutes shows what is stored and does not call ITPro', async () => {
  calls.length = 0;
  clock.now = new Date(clock.now.getTime() + 12 * 60000);
  const r = await call('/api/found/refresh', 'POST');
  assert.equal(r.data.fetched, false);
  assert.equal(r.data.minutes_ago, 12);
  assert.equal(calls.length, 0);
});

test('List: newest first, posted filter, work mode only when the advert says so, search words', async () => {
  const day = (data) => data.jobs.map((j) => j.title);
  assert.deepEqual(day((await call('/api/found?posted=any')).data), ['SRE Engineer', 'QA Engineer', 'Old Support Analyst']);
  assert.deepEqual(day((await call('/api/found')).data), ['SRE Engineer', 'QA Engineer']);                // default: 3 days
  assert.deepEqual(day((await call('/api/found?posted=today')).data), ['SRE Engineer']);
  assert.deepEqual(day((await call('/api/found?posted=week')).data), ['SRE Engineer', 'QA Engineer']);
  assert.equal((await call('/api/found?posted=forever')).status, 400);

  const remote = (await call('/api/found?posted=any&work_mode=remote')).data;
  assert.deepEqual(day(remote), ['SRE Engineer']);
  assert.equal((await call('/api/found?posted=any&work_mode=onsite')).data.jobs.length, 0);   // never guessed as on-site
  assert.equal((await call('/api/found?posted=any&work_mode=any')).data.jobs.length, 3);
  assert.equal((await call('/api/found?work_mode=office')).status, 400);

  assert.deepEqual(day((await call('/api/found?posted=any&q=globex')).data), ['QA Engineer']);          // company
  assert.deepEqual(day((await call('/api/found?posted=any&q=KUBERNETES')).data), ['SRE Engineer']);     // advert, any case
  assert.deepEqual(day((await call('/api/found?posted=any&q=linux+colombo')).data), ['QA Engineer', 'Old Support Analyst']); // every word must match
  assert.equal((await call('/api/found?posted=any&q=zzz')).data.jobs.length, 0);
});

test('Found jobs get a clean-text advert, work mode, closing date and an ITPro-only link', async () => {
  const id = (await call('/api/found?posted=today')).data.jobs[0].id;
  const { job } = (await call(`/api/found/${id}`)).data;
  assert.equal(job.company, 'Northwind Ltd');
  assert.equal(job.work_mode, 'remote');
  assert.equal(job.closes_on, '2026-11-30');
  assert.equal(job.url, 'https://itpro.lk/job/101/x/');
  assert.equal(job.description, 'Remote role. Closing date: 30 November 2026\n\n• Kubernetes');
  assert.equal((await call('/api/found/99999')).status, 404);
  assert.equal((await call('/api/found/abc')).status, 404);
});

test('"New" means first seen after the person last left Found; the marker moves only on leave', async () => {
  const first = (await call('/api/found?posted=any')).data;
  assert.equal(first.new_count, 3);                        // never left yet: everything is new
  assert.ok(first.jobs.every((j) => j.is_new));

  assert.equal((await call('/api/found/left', 'POST')).status, 200);
  const after = (await call('/api/found?posted=any')).data;
  assert.equal(after.new_count, 0);

  // time passes, a new job appears in the feed
  clock.now = new Date(clock.now.getTime() + 40 * 60000);
  feeds[ALL] = feed(item({ id: 104, title: 'Fresh Job', daysAgo: 0 }), SRE);
  feeds[DEVOPS] = feed(); feeds['https://itpro.lk/rss/web-development/'] = feed();
  const r = await call('/api/found/refresh', 'POST');
  assert.equal(r.data.fetched, true);
  assert.equal(r.data.added, 1);
  const list = (await call('/api/found?posted=any')).data;
  assert.deepEqual(list.jobs.filter((j) => j.is_new).map((j) => j.title), ['Fresh Job']);   // old ones stay not-new
  assert.equal(list.jobs.length, 4);                       // jobs missing from the feed are kept
});

test('Hide removes a job from the list and from the new count; Show hidden brings it back', async () => {
  const fresh = (await call('/api/found?posted=any')).data.jobs.find((j) => j.title === 'Fresh Job');
  assert.equal(fresh.is_new, true);
  assert.equal((await call(`/api/found/${fresh.id}`, 'PATCH', { hidden: true })).status, 200);

  const visible = (await call('/api/found?posted=any')).data;
  assert.ok(!visible.jobs.some((j) => j.title === 'Fresh Job'));
  assert.equal(visible.new_count, 0);
  assert.equal(visible.hidden_count, 1);

  const hidden = (await call('/api/found?posted=any&hidden=1')).data;
  assert.deepEqual(hidden.jobs.map((j) => j.title), ['Fresh Job']);
  assert.equal(hidden.jobs[0].is_new, false);

  assert.equal((await call(`/api/found/${fresh.id}`, 'PATCH', { hidden: 'yes' })).status, 400);
  await call(`/api/found/${fresh.id}`, 'PATCH', { hidden: false });
  assert.equal((await call('/api/found?posted=any')).data.hidden_count, 0);
});

test('Hidden state survives the next refresh', async () => {
  const job = (await call('/api/found?posted=any')).data.jobs.find((j) => j.title === 'QA Engineer');
  await call(`/api/found/${job.id}`, 'PATCH', { hidden: true });
  clock.now = new Date(clock.now.getTime() + 31 * 60000);
  await call('/api/found/refresh', 'POST');
  assert.ok((await call('/api/found?posted=any&hidden=1')).data.jobs.some((j) => j.id === job.id));
  await call(`/api/found/${job.id}`, 'PATCH', { hidden: false });
});

test('Save to Jobs: a normal open job, no " at Company" in the title, advert kept, then "already"', async () => {
  const found = (await call('/api/found?posted=any')).data.jobs.find((j) => j.title === 'SRE Engineer');
  const saved = await call(`/api/found/${found.id}/save`, 'POST');
  assert.equal(saved.data.already, false);

  const { job } = (await call(`/api/jobs/${saved.data.job_id}`)).data;
  assert.equal(job.title, 'SRE Engineer');
  assert.equal(job.company, 'Northwind Ltd');
  assert.equal(job.status, 'open');
  assert.equal(job.source, 'ITPro');
  assert.equal(job.url, 'https://itpro.lk/job/101/x/');
  assert.equal(job.job_type, 'Full-time');
  assert.equal(job.location, 'Colombo');
  assert.equal(job.work_mode, 'remote');
  assert.equal(job.closes_on, '2026-11-30');
  assert.match(job.description, /Kubernetes/);
  assert.match(job.found_on, /^\d{4}-\d{2}-\d{2}$/);

  const again = await call(`/api/found/${found.id}/save`, 'POST');
  assert.deepEqual(again.data, { already: true, job_id: saved.data.job_id });
  assert.equal((await call('/api/jobs')).data.jobs.length, 1);
  assert.equal((await call('/api/found?posted=any')).data.jobs.find((j) => j.id === found.id).job_id, saved.data.job_id);

  // deleting the job frees the found item again
  await call(`/api/jobs/${saved.data.job_id}`, 'DELETE');
  assert.equal((await call('/api/found?posted=any')).data.jobs.find((j) => j.id === found.id).job_id, null);
});

test('Save to Jobs does not add a job that is already there (title + company, case and spaces ignored)', async () => {
  await call('/api/jobs', 'POST', { title: '  qa engineer ', company: 'GLOBEX' });
  const qa = (await call('/api/found?posted=any')).data.jobs.find((j) => j.title === 'QA Engineer');
  const r = await call(`/api/found/${qa.id}/save`, 'POST');
  assert.equal(r.data.already, true);
  assert.equal((await call('/api/jobs')).data.jobs.length, 1);
  assert.equal((await call('/api/found?posted=any')).data.jobs.find((j) => j.id === qa.id).job_id, r.data.job_id);
});

test('Categories setting: only known ones, stored, used by the next refresh', async () => {
  assert.equal((await call('/api/found/settings', 'PATCH', { categories: ['devops-cloud', 'made-up'] })).status, 400);
  assert.equal((await call('/api/found/settings', 'PATCH', { categories: 'devops-cloud' })).status, 400);
  const ok = await call('/api/found/settings', 'PATCH', { categories: ['quality-assurance', 'devops-cloud', 'devops-cloud'] });
  assert.deepEqual(ok.data.categories, ['devops-cloud', 'quality-assurance']);
  assert.deepEqual((await call('/api/found')).data.categories, ['devops-cloud', 'quality-assurance']);

  calls.length = 0;
  clock.now = new Date(clock.now.getTime() + 31 * 60000);
  feeds['https://itpro.lk/rss/quality-assurance/'] = feed();
  await call('/api/found/refresh', 'POST');
  assert.deepEqual(calls, [ALL, DEVOPS, 'https://itpro.lk/rss/quality-assurance/']);

  await call('/api/found/settings', 'PATCH', { categories: [] });
  calls.length = 0;
  clock.now = new Date(clock.now.getTime() + 31 * 60000);
  await call('/api/found/refresh', 'POST');
  assert.deepEqual(calls, [ALL]);
});

test('When ITPro cannot be reached the stored jobs stay and a short message comes back', async () => {
  const before = (await call('/api/found?posted=any')).data;
  clock.now = new Date(clock.now.getTime() + 31 * 60000);
  const keep = feeds[ALL];
  feeds[ALL] = new Error('offline');
  const r = await call('/api/found/refresh', 'POST');
  assert.equal(r.status, 200);
  assert.equal(r.data.fetched, false);
  assert.equal(r.data.error, 'Could not reach ITPro. Showing what was saved.');
  const after = (await call('/api/found?posted=any')).data;
  assert.equal(after.jobs.length, before.jobs.length);
  assert.equal(after.last_fetch_at, before.last_fetch_at);        // a failed try is not a fetch
  // text that is not a feed counts as a failure too
  feeds[ALL] = '<html>Maintenance</html>';
  assert.equal((await call('/api/found/refresh', 'POST')).data.fetched, false);
  feeds[ALL] = keep;
});

test('One feed failing out of several still stores the rest, but does not start the 30-minute wait', async () => {
  await call('/api/found/settings', 'PATCH', { categories: ['devops-cloud'] });
  clock.now = new Date(clock.now.getTime() + 31 * 60000);
  const lastFetch = (await call('/api/found')).data.last_fetch_at;
  feeds[ALL] = feed(item({ id: 105, title: 'Partial Job' }));
  feeds[DEVOPS] = new Error('boom');
  const r = await call('/api/found/refresh', 'POST');
  assert.equal(r.data.fetched, true);
  assert.equal(r.data.failed, 1);
  assert.ok((await call('/api/found?posted=any')).data.jobs.some((j) => j.title === 'Partial Job'));
  assert.equal((await call('/api/found')).data.last_fetch_at, lastFetch);
  feeds[DEVOPS] = feed();
});

test('Jobs not seen in any feed for 60 days are deleted; Jobs rows are unaffected', async () => {
  const stale = db.prepare("SELECT id, itpro_id FROM found_jobs WHERE title = 'Old Support Analyst'").get();
  db.prepare('UPDATE found_jobs SET last_seen_at = ? WHERE id = ?').run(new Date(clock.now.getTime() - 61 * 86400000).toISOString(), stale.id);
  const keep = db.prepare("SELECT id FROM found_jobs WHERE title = 'Fresh Job'").get();
  db.prepare('UPDATE found_jobs SET last_seen_at = ? WHERE id = ?').run(new Date(clock.now.getTime() - 59 * 86400000).toISOString(), keep.id);
  const jobsBefore = (await call('/api/jobs')).data.jobs.length;

  clock.now = new Date(clock.now.getTime() + 31 * 60000);
  feeds[ALL] = feed(item({ id: 105, title: 'Partial Job' }));
  assert.equal((await call('/api/found/refresh', 'POST')).data.failed, 0);
  assert.equal(db.prepare('SELECT 1 FROM found_jobs WHERE id = ?').get(stale.id), undefined);
  assert.ok(db.prepare('SELECT 1 FROM found_jobs WHERE id = ?').get(keep.id));
  assert.equal((await call('/api/jobs')).data.jobs.length, jobsBefore);
});

test('Backup and Restore carry found jobs and the Found settings', async () => {
  await call('/api/found/settings', 'PATCH', { categories: ['web-development'] });
  const backup = (await call('/api/backup')).data;
  assert.ok(backup.tables.found_jobs.length >= 3);
  assert.deepEqual(JSON.parse(backup.tables.profile[0].found_categories), ['web-development']);
  const count = backup.tables.found_jobs.length;

  db.exec('DELETE FROM found_jobs');
  await call('/api/found/settings', 'PATCH', { categories: [] });
  assert.equal((await call('/api/restore', 'POST', backup)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM found_jobs').get().n, count);
  assert.deepEqual((await call('/api/found')).data.categories, ['web-development']);

  // a bad found row changes nothing (all or nothing)
  const broken = structuredClone(backup);
  broken.tables.found_jobs[0].hidden = 7;
  assert.equal((await call('/api/restore', 'POST', broken)).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM found_jobs').get().n, count);

  // an older backup without found_jobs, and one with a made-up column, still restore
  const old = structuredClone(backup);
  delete old.tables.found_jobs;
  assert.equal((await call('/api/restore', 'POST', old)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM found_jobs').get().n, 0);
  const extra = structuredClone(backup);
  extra.tables.found_jobs[0].future_column = 'x';
  assert.equal((await call('/api/restore', 'POST', extra)).status, 200);
});

test('Found does not accept the wrong method on its routes', async () => {
  assert.equal((await call('/api/found/refresh')).status, 404);       // GET refresh is read as an id
  assert.equal((await call('/api/found', 'POST', {})).status, 405);
});
