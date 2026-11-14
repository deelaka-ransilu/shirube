import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, htmlToText, pubDateToDay, FeedError } from '../lib/feed.js';
import { fetchFeedText, feedUrls, assertAllowed, USER_AGENT } from '../lib/fetch-feed.js';
import { todayLocal } from '../lib/dates.js';

const item = ({ id, title, company, location = 'Colombo', type = 'Full-time', date = 'Fri, 13 Nov 2026 12:00:00 +0000', advert = '<p>Hello</p>', link } = {}) => `
  <item>
    <title>${title} at ${company}</title>
    <link>${link ?? `https://itpro.lk/job/${id}/${title.toLowerCase().replace(/\W+/g, '-')}/`}</link>
    <guid>${link ?? `https://itpro.lk/job/${id}/x/`}</guid>
    <pubDate>${date}</pubDate>
    <description>Location: ${location}</description>
    <content:encoded><![CDATA[<strong>Company:</strong> ${company}<br> <strong>Location:</strong> ${location}<br> <strong>Job Type:</strong> ${type}<br><br> <strong>Description:</strong><br>${advert}]]></content:encoded>
  </item>`;

const feed = (...items) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel><title>ITPro</title><link>https://itpro.lk/</link><description>Jobs</description><atom:link href="https://itpro.lk/rss/all/" rel="self"/><ttl>30</ttl>
  ${items.join('\n')}
  </channel></rss>`;

test('parseFeed reads title, company, location, type, id, link and date', () => {
  const { items, ttl } = parseFeed(feed(item({ id: 15776, title: 'Senior Applied AI Engineer', company: 'Platned' })));
  assert.equal(ttl, 30);
  assert.equal(items.length, 1);
  const j = items[0];
  assert.equal(j.itpro_id, 15776);
  assert.equal(j.title, 'Senior Applied AI Engineer');
  assert.equal(j.company, 'Platned');
  assert.equal(j.location, 'Colombo');
  assert.equal(j.job_type, 'Full-time');
  assert.equal(j.url, 'https://itpro.lk/job/15776/senior-applied-ai-engineer/');
  assert.equal(j.published_on, todayLocal(new Date('2026-11-13T12:00:00Z')));
  assert.equal(j.description, 'Hello');
});

test('parseFeed: title with " at " inside, entities, and a missing company field', () => {
  const tricky = item({ id: 1, title: 'Support Engineer at Scale', company: 'Foo &amp; Bar' });
  const { items } = parseFeed(feed(tricky));
  assert.equal(items[0].title, 'Support Engineer at Scale');
  assert.equal(items[0].company, 'Foo & Bar');

  const bare = `<item><title>QA Engineer at Globex</title><link>https://itpro.lk/job/7/qa/</link><pubDate>Fri, 13 Nov 2026 12:00:00 +0000</pubDate><description>Location: Kandy</description></item>`;
  const j = parseFeed(feed(bare)).items[0];
  assert.deepEqual([j.title, j.company, j.location], ['QA Engineer', 'Globex', 'Kandy']);
});

test('parseFeed stores one copy per job id and skips items with no usable ITPro link', () => {
  const a = item({ id: 5, title: 'Dev', company: 'A' });
  const { items } = parseFeed(feed(
    a, a,
    item({ id: 6, title: 'Evil', company: 'B', link: 'https://evil.example/job/6/x/' }),
    item({ id: 7, title: 'Plain http', company: 'C', link: 'http://itpro.lk/job/7/x/' }),
    item({ id: 8, title: 'Look alike', company: 'D', link: 'https://itpro.lk.evil.example/job/8/x/' }),
    '<item><title>No link at X</title></item>',
  ));
  assert.deepEqual(items.map((i) => i.itpro_id), [5]);
});

test('parseFeed rejects things that are not RSS', () => {
  assert.throws(() => parseFeed('<html><body>Oops</body></html>'), FeedError);
  assert.throws(() => parseFeed(''), FeedError);
  assert.throws(() => parseFeed(null), FeedError);
  assert.deepEqual(parseFeed(feed()).items, []);
  assert.equal(parseFeed('<rss><channel><item><title>broken').items.length, 0);
});

test('htmlToText keeps headings and bullets, drops tags and scripts, never leaves HTML', () => {
  const text = htmlToText('<h3>Role</h3><p>Build &amp; run <b>things</b>.</p><ul><li>Linux</li><li>SQL &lt;b&gt;</li></ul><script>alert(1)</script><p>Closing date: 3 December 2026<br>Apply now</p>');
  assert.equal(text, 'Role\n\nBuild & run things.\n\n• Linux\n• SQL <b>\n\nClosing date: 3 December 2026\nApply now');
  assert.equal(htmlToText(null), '');
  assert.ok(!htmlToText('<img src=x onerror=alert(1)>hi').includes('<'));
});

test('pubDateToDay gives the computer-local day, or empty for nonsense', () => {
  assert.equal(pubDateToDay('Fri, 13 Nov 2026 12:00:00 +0000'), todayLocal(new Date('2026-11-13T12:00:00Z')));
  assert.equal(pubDateToDay('not a date'), '');
});

// ---- the fetcher (always with a fake fetch: tests never touch the internet) ----

const reply = (body, init = {}) => new Response(body, { status: 200, ...init });

test('feedUrls: the all feed plus the followed categories, known slugs only', () => {
  assert.deepEqual(feedUrls(['devops-cloud', 'nope', 'web-development']), [
    'https://itpro.lk/rss/all/', 'https://itpro.lk/rss/devops-cloud/', 'https://itpro.lk/rss/web-development/',
  ]);
  assert.deepEqual(feedUrls([]), ['https://itpro.lk/rss/all/']);
});

test('fetcher only contacts https://itpro.lk and says who it is', async () => {
  for (const bad of ['http://itpro.lk/rss/all/', 'https://example.com/rss/', 'https://itpro.lk.evil.example/', 'https://user@itpro.lk/', 'https://itpro.lk:8443/', 'nonsense']) {
    assert.throws(() => assertAllowed(bad), undefined, bad);
    let called = false;
    await assert.rejects(fetchFeedText(bad, { fetchImpl: async () => { called = true; return reply('x'); } }));
    assert.equal(called, false, `${bad} must not be requested`);
  }
  let seen;
  const text = await fetchFeedText('https://itpro.lk/rss/all/', { fetchImpl: async (url, opts) => { seen = { url, opts }; return reply('<rss/>'); } });
  assert.equal(text, '<rss/>');
  assert.equal(seen.url, 'https://itpro.lk/rss/all/');
  assert.equal(seen.opts.headers['User-Agent'], USER_AGENT);
  assert.match(USER_AGENT, /^Shirube\//);
});

test('fetcher follows redirects on itpro.lk only', async () => {
  const hops = [];
  const ok = await fetchFeedText('https://itpro.lk/a', {
    fetchImpl: async (url) => {
      hops.push(url);
      return url.endsWith('/a') ? new Response(null, { status: 301, headers: { location: '/b' } }) : reply('done');
    },
  });
  assert.equal(ok, 'done');
  assert.deepEqual(hops, ['https://itpro.lk/a', 'https://itpro.lk/b']);

  for (const location of ['https://example.com/x', 'http://itpro.lk/x']) {
    await assert.rejects(fetchFeedText('https://itpro.lk/a', { fetchImpl: async () => new Response(null, { status: 302, headers: { location } }) }));
  }
  await assert.rejects(fetchFeedText('https://itpro.lk/a', { fetchImpl: async () => new Response(null, { status: 302, headers: { location: '/a' } }) }), /redirects/);
});

test('fetcher refuses error statuses, big bodies and slow answers', async () => {
  await assert.rejects(fetchFeedText('https://itpro.lk/x', { fetchImpl: async () => reply('no', { status: 404 }) }), /404/);
  await assert.rejects(fetchFeedText('https://itpro.lk/x', { maxBytes: 10, fetchImpl: async () => reply('x'.repeat(50)) }), /too big/);
  const keepAlive = setTimeout(() => {}, 2000); // AbortSignal.timeout does not keep Node running by itself
  await assert.rejects(fetchFeedText('https://itpro.lk/x', {
    timeoutMs: 20,
    fetchImpl: (url, { signal }) => new Promise((ok, fail) => signal.addEventListener('abort', () => fail(signal.reason))),
  }));
  clearTimeout(keepAlive);
});
