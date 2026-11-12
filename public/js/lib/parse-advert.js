// "Fill the fields": simple rules that read a pasted advert.
// It only guesses. The person checks every field afterwards.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : '';
}

// Finds one date in a line of text. Slash dates are day first (30/11/2026).
export function parseDate(text) {
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return validDate(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  return '';
}

export function parseAdvert(input) {
  const text = String(input ?? '').trim();
  const out = {};
  if (!text) return out;

  const link = text.match(/https?:\/\/[^\s<>"')]+/i);
  if (link) out.url = link[0].replace(/[.,;]+$/, '');
  if (/^https?:\/\/\S+$/i.test(text)) { out.onlyLink = true; return out; }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const labelled = (names) => {
    const re = new RegExp(`^(?:${names})\\s*[:\\-–]\\s*(.+)$`, 'i');
    for (const line of lines) { const m = line.match(re); if (m) return m[1].trim(); }
    return '';
  };

  let title = labelled('job title|position|role|vacancy');
  let company = labelled('company|employer|organi[sz]ation|hiring company');
  if (!title) {
    const first = lines[0];
    if (first && first.length <= 100 && !/^https?:/i.test(first) && !/[.!?]$/.test(first)) {
      const at = first.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
      if (at) { title = at[1].trim(); if (!company) company = at[2].trim(); } else title = first;
    }
  }
  if (title) out.title = title;
  if (company) out.company = company;

  if (/\bhybrid\b/i.test(text)) out.work_mode = 'hybrid';
  else if (/\bon[- ]?site\b/i.test(text)) out.work_mode = 'onsite';
  else if (/\bremote\b/i.test(text)) out.work_mode = 'remote';

  if (/\bfull[- ]?time\b/i.test(text)) out.job_type = 'Full-time';
  else if (/\bpart[- ]?time\b/i.test(text)) out.job_type = 'Part-time';
  else if (/\bintern(?:ship)?\b/i.test(text)) out.job_type = 'Internship';
  else if (/\bcontract\b/i.test(text)) out.job_type = 'Contract';

  for (const line of lines) {
    if (/closing date|closes?\b|deadline|apply (?:before|by)|last date/i.test(line)) {
      const date = parseDate(line);
      if (date) { out.closes_on = date; break; }
    }
  }
  return out;
}
