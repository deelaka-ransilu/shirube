// Reads the ITPro job feed and turns each posting into a Shirube job.
const FEED_URL = 'https://itpro.lk/api/?action=getJobs&type=0&category=0&count=50&response=js';

// The feed is a script: "var jobs = [...]" followed by other code.
// This takes out the array by matching brackets, skipping any inside strings.
export function extractJobsArray(text) {
  const marker = text.indexOf('var jobs');
  if (marker === -1) throw new Error('ITPro feed: "var jobs" not found.');
  const start = text.indexOf('[', marker);
  if (start === -1) throw new Error('ITPro feed: job list not found.');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('ITPro feed: job list is not closed.');
}

// Turns the description HTML into plain text.
function htmlToText(html) {
  if (!html) return null;
  const text = String(html)
    .replace(/\r\n?/g, '\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol)>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d{1,6});/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

const JOB_TYPES = new Map([
  ['internship', 'Internship'],
  ['fulltime', 'Full-time'],
  ['contract', 'Contract'],
  ['parttime', 'Part-time'],
  ['freelance', 'Freelance'],
]);

function mapJobType(raw) {
  const key = String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
  return JOB_TYPES.get(key) ?? null;
}

function detectWorkMode(location, text) {
  if (/^remote$/i.test((location || '').trim())) return 'Remote';
  if (/\bhybrid\b/i.test(text || '')) return 'Hybrid';
  if (/\bon[- ]?site\b/i.test(text || '')) return 'On-site';
  return null;
}

export function mapPosting(p) {
  const id = String(p.id);
  const description = htmlToText(p.description);
  const location = String(p.location || '').trim() || null;
  const hasDate = /^\d{4}-\d{2}-\d{2}/.test(p.mysql_date || '');
  return {
    source: 'ITPro',
    external_id: id,
    title: String(p.title || '').trim(),
    company: String(p.company || '').trim(),
    location,
    url: `https://itpro.lk/job/${id}${p.url_title ? '/' + p.url_title : ''}`,
    job_type: mapJobType(p.type_name),
    role_type: String(p.category_name || '').trim() || null,
    work_mode: detectWorkMode(location, description),
    posted_date: hasDate ? p.mysql_date.slice(0, 10) : null,
    posted_at: hasDate ? p.mysql_date.slice(0, 19) : null,
    description,
  };
}

// The postings exactly as ITPro sends them.
export async function fetchRawPostings() {
  const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`ITPro feed answered ${res.status}.`);
  return extractJobsArray(await res.text());
}

export async function fetchPostings() {
  return (await fetchRawPostings()).map(mapPosting);
}
