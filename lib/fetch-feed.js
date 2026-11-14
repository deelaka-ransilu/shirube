// The only place Shirube talks to the internet. It can reach itpro.lk over https and
// nothing else: other hosts, http, and redirects to other hosts are refused.
export const ALLOWED_HOST = 'itpro.lk';
export const USER_AGENT = 'Shirube/0.1 (local job tracker)';
export const CATEGORIES = [
  ['devops-cloud', 'DevOps and Cloud'],
  ['information-technology', 'Information Technology'],
  ['web-development', 'Web Development'],
  ['software-engineering', 'Software Engineering'],
  ['quality-assurance', 'Quality Assurance'],
];
export const CATEGORY_SLUGS = CATEGORIES.map(([slug]) => slug);
export const DEFAULT_CATEGORIES = ['devops-cloud', 'information-technology', 'web-development'];

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

// The feeds read on Refresh: all jobs, plus each followed category.
export function feedUrls(categories) {
  return ['https://itpro.lk/rss/all/', ...categories.filter((c) => CATEGORY_SLUGS.includes(c)).map((c) => `https://itpro.lk/rss/${c}/`)];
}

export function assertAllowed(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('Not a valid address'); }
  if (u.protocol !== 'https:' || u.hostname !== ALLOWED_HOST || u.username || u.password || u.port) {
    throw new Error(`Only https://${ALLOWED_HOST} can be contacted`);
  }
  return u;
}

async function readCapped(res, maxBytes) {
  if (Number(res.headers.get('content-length')) > maxBytes) throw new Error('The feed is too big');
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); throw new Error('The feed is too big'); }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

// Returns the feed text. fetchImpl, timeoutMs and maxBytes exist so tests can change them.
export async function fetchFeedText(url, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = assertAllowed(url);
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    const res = await fetchImpl(current.href, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml;q=0.9' },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel?.();
      const next = res.headers.get('location');
      if (!next) throw new Error('Bad redirect');
      current = assertAllowed(new URL(next, current).href); // stays on itpro.lk or fails
      continue;
    }
    if (!res.ok) { await res.body?.cancel?.(); throw new Error(`ITPro answered ${res.status}`); }
    return readCapped(res, maxBytes);
  }
  throw new Error('Too many redirects');
}
