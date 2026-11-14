import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db.js';
import { createServer } from '../server.js';

const now = new Date('2026-11-14T06:00:00Z');
const rfc = (daysAgo) => new Date(now.getTime() - daysAgo * 86400000).toUTCString().replace('GMT', '+0000');
const item = (id, title, daysAgo) => `<item><title>${title} at Acme</title><link>https://itpro.lk/job/${id}/x/</link><guid>https://itpro.lk/job/${id}/x/</guid><pubDate>${rfc(daysAgo)}</pubDate><description>Location: Colombo</description><content:encoded><![CDATA[<strong>Company:</strong> Acme<br> <strong>Location:</strong> Colombo<br><br> <strong>Description:</strong><br><p>Linux</p>]]></content:encoded></item>`;
const xml = `<rss version="2.0"><channel><title>ITPro</title><ttl>30</ttl>${item(1, 'A today', 0)}${item(2, 'B five days', 5)}${item(3, 'C twenty days', 20)}</channel></rss>`;

const server = createServer(openDb(':memory:'), { fetchFeed: async () => xml, now: () => now });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const get = async (q) => { const r = await fetch(`${base}/api/found?${q}`); return { status: r.status, data: await r.json() }; };
test.after(() => server.close());

test('a picked date shows jobs from that day until today', async () => {
  await fetch(`${base}/api/found/refresh`, { method: 'POST' });
  const titles = async (q) => (await get(q)).data.jobs.map((j) => j.title);
  assert.deepEqual(await titles('since=2026-11-09'), ['A today', 'B five days']);   // 9 Nov = exactly 5 days back, included
  assert.deepEqual(await titles('since=2026-11-10'), ['A today']);
  assert.equal((await titles('since=2026-10-01')).length, 3);
  assert.deepEqual(await titles('since=2026-11-09&posted=today'), ['A today', 'B five days']);   // the date wins over the chip
});

test('a bad date is refused', async () => {
  assert.equal((await get('since=2026-02-31')).status, 400);
  assert.equal((await get('since=yesterday')).status, 400);
  assert.equal((await get('since=')).status, 200);      // empty = no date, the posted filter applies
});
