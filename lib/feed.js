// Reads ITPro's RSS 2.0 job feeds. No libraries: the feed is simple and we only
// need a few tags. Everything that comes out is plain text, never HTML.
import { todayLocal } from './dates.js';

export class FeedError extends Error {}

const MAX_ITEMS = 300;          // per feed
const MAX_TEXT = 50000;         // the same limit a job description has

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}

// The text inside <tag>...</tag>. CDATA is kept as it is, other text has its entities decoded.
function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1].split(/(<!\[CDATA\[[\s\S]*?\]\]>)/).map((part) => {
    const c = part.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    return c ? c[1] : decodeEntities(part);
  }).join('').trim();
}

// Advert HTML -> plain text. Headings and bullets stay as lines. Tags are removed
// first and entities decoded after, so "&lt;b&gt;" stays the visible text "<b>".
export function htmlToText(input) {
  let s = String(input ?? '');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?(h[1-6])\b[^>]*>/gi, '\n\n');
  s = s.replace(/<li\b[^>]*>/gi, '\n• ');
  s = s.replace(/<\/?(p|div|ul|ol|table|tr|blockquote|section|article)\b[^>]*>/gi, '\n\n');
  s = s.replace(/<[^>]*>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ');
  s = s.split('\n').map((l) => l.trim()).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s.slice(0, MAX_TEXT);
}

// "Fri, 13 Nov 2026 19:44:45 +0530" -> "2026-11-13" (the computer's own date). '' if unreadable.
export function pubDateToDay(text) {
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? '' : todayLocal(d);
}

// The header lines of content:encoded: <strong>Company:</strong> X<br> ...
function headerField(html, label) {
  const m = html.match(new RegExp(`<strong>\\s*${label}:\\s*</strong>\\s*([^<]*)`, 'i'));
  return m ? decodeEntities(m[1]).trim() : '';
}

function itemFrom(block) {
  const link = tagText(block, 'link') || tagText(block, 'guid');
  let url;
  try { url = new URL(link); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'itpro.lk' || url.username || url.password || url.port) return null;
  const idMatch = url.pathname.match(/^\/job\/(\d+)(?:\/|$)/);
  if (!idMatch) return null;

  const rawTitle = tagText(block, 'title');
  if (!rawTitle) return null;
  const encoded = tagText(block, 'content:encoded');

  let company = headerField(encoded, 'Company');
  let title = rawTitle;
  if (company && rawTitle.toLowerCase().endsWith(` at ${company}`.toLowerCase())) {
    title = rawTitle.slice(0, rawTitle.length - company.length - 4).trim();
  } else if (!company) {
    const at = rawTitle.lastIndexOf(' at ');
    if (at > 0) { title = rawTitle.slice(0, at).trim(); company = rawTitle.slice(at + 4).trim(); }
  }

  const descMarker = encoded.search(/<strong>\s*Description:\s*<\/strong>/i);
  const advertHtml = descMarker >= 0 ? encoded.slice(descMarker).replace(/^<strong>\s*Description:\s*<\/strong>\s*(<br\s*\/?>)?/i, '') : encoded;
  const location = headerField(encoded, 'Location') || tagText(block, 'description').replace(/^Location:\s*/i, '');

  return {
    itpro_id: Number(idMatch[1]),
    title: (title || rawTitle).slice(0, 200),
    company: company.slice(0, 200),
    location: location.slice(0, 200),
    job_type: headerField(encoded, 'Job Type').slice(0, 100),
    url: `https://itpro.lk${url.pathname}`,
    description: htmlToText(advertHtml),
    published_on: pubDateToDay(tagText(block, 'pubDate')),
  };
}

// Returns { items, ttl }. Items without a usable ITPro link or title are skipped.
export function parseFeed(xml) {
  const text = String(xml ?? '');
  if (!/<rss[\s>]/i.test(text) || !/<channel[\s>]/i.test(text)) throw new FeedError('This is not an RSS feed');
  const items = [];
  const seen = new Set();
  for (const m of text.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    if (items.length >= MAX_ITEMS) break;
    const item = itemFrom(m[0]);
    if (!item || seen.has(item.itpro_id)) continue;
    seen.add(item.itpro_id);
    items.push(item);
  }
  const head = text.slice(0, text.search(/<item[\s>]/i) >= 0 ? text.search(/<item[\s>]/i) : undefined);
  const ttl = Number(tagText(head, 'ttl'));
  return { items, ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : 30 };
}
