// "Fill the fields": simple rules that read a pasted advert.
// It only guesses. The person checks every field afterwards.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : '';
}

// Finds one date in a line of text. Slash dates are day first (30/11/2026).
// Words work both ways: 30 November 2026 and November 30, 2026.
export function parseDate(text) {
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return validDate(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return validDate(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  return '';
}

const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysBefore = (now, n) => isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));

// "Today", "Yesterday", "14 Days Ago", "2 weeks ago" or a real date. "30+ Days Ago" is not a date, so it gives ''.
function postedFrom(text, now) {
  const t = text.trim();
  if (/^(today|just now)\b/i.test(t)) return daysBefore(now, 0);
  if (/^yesterday\b/i.test(t)) return daysBefore(now, 1);
  const m = t.match(/^(\d+)(\+)?\s*(minute|hour|day|week)s?\s+ago\b/i);
  if (m) {
    if (m[2]) return '';
    const unit = m[3].toLowerCase();
    return daysBefore(now, unit === 'day' ? +m[1] : unit === 'week' ? +m[1] * 7 : 0);
  }
  return parseDate(t);
}

// The job types, in the same order as the chips on Add job.
const TYPES = [
  ['Full-time', /\bfull[- ]?time\b/i],
  ['Part-time', /\bpart[- ]?time\b/i],
  ['Contract', /\bcontract\b/i],
  ['Internship', /\bintern(?:ship)?\b/i],
];

// The old rule: one type, the first that appears anywhere. Found jobs still use it.
function oneJobType(text) {
  if (/\bfull[- ]?time\b/i.test(text)) return 'Full-time';
  if (/\bpart[- ]?time\b/i.test(text)) return 'Part-time';
  if (/\bintern(?:ship)?\b/i.test(text)) return 'Internship';
  if (/\bcontract\b/i.test(text)) return 'Contract';
  return '';
}

// Every type named in the top of the advert (the title and the header lines), because one job can be
// both: a full-time internship. When the top names none, fall back to the first one found anywhere.
export function parseJobTypes(input) {
  const text = String(input ?? '');
  const top = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 20).join('\n');
  const found = TYPES.filter(([, re]) => re.test(top)).map(([name]) => name);
  if (found.length) return found;
  const one = oneJobType(text);
  return one ? [one] : [];
}

const GENERIC_HEADING = /^(job description|job details?|job summary|job overview|about the job|overview|description|vacancy|the big picture|the opportunity)$/i;
const NOT_A_COMPANY = new Set(['the', 'us', 'you', 'this', 'your', 'our', 'job', 'role', 'team', 'company', 'position', 'opportunity', 'them', 'me', 'a', 'an', 'these', 'those', 'what', 'how', 'why']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseAdvert(input, now = new Date()) {
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
  // Some sites put the label on one line and the value on the next ("locations", then "Colombo").
  const nextLine = (names) => {
    const re = new RegExp(`^(?:${names})\\s*:?$`, 'i');
    const i = lines.findIndex((l) => re.test(l));
    return i >= 0 && lines[i + 1] ? lines[i + 1] : '';
  };

  let title = labelled('job title|position|role|vacancy');
  let company = labelled('company|employer|organi[sz]ation|hiring company');
  let place = labelled('locations?|job location|work location') || nextLine('locations?|job location|work location');

  // The first line is the title unless it is only a heading such as "JOB DESCRIPTION".
  const heads = lines.filter((l) => !GENERIC_HEADING.test(l));
  if (!title) {
    const first = heads[0];
    if (first && first.length <= 100 && !/^https?:/i.test(first) && !/[.!?]$/.test(first)) {
      const at = first.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
      if (at) { title = at[1].trim(); if (!company) company = at[2].trim(); } else title = first;
    }
  }

  // ITPro style header: "Xitricon   Colombo · Full-time" (company, two spaces or a tab, place, then the type).
  for (const line of lines.slice(0, 12)) {
    const m = line.match(/^(.{2,80}?)(?:\s{2,}|\t+)(.{2,60}?)\s*[·•|]\s*(?:full[- ]?time|part[- ]?time|contract|internship|temporary|freelance)\b/i);
    if (m) { if (!company) company = m[1].trim(); if (!place) place = m[2].trim(); break; }
  }

  // "About Sysco LABS:" names the company when nothing else does.
  if (!company) {
    for (const line of lines) {
      const m = line.match(/^[Aa]bout\s+([A-Z][^:|]{1,58}?)\s*:?$/);
      if (!m) continue;
      const name = m[1].trim();
      if (NOT_A_COMPANY.has(name.split(/\s+/)[0].toLowerCase()) || name.split(/\s+/).length > 4) continue;
      company = name;
      break;
    }
  }

  // Without a label, a short line near the top like "Sysco LABS - Sri Lanka" is the office: the place is after the dash.
  if (!place && company) {
    const office = new RegExp(`^${escapeRe(company)}\\s*[-–]\\s*(.{2,60})$`, 'i');
    for (const line of lines.slice(0, 15)) { const m = line.match(office); if (m) { place = m[1].trim(); break; } }
  }

  // "Sysco LABS - Sri Lanka" as a place is the office name: keep "Sri Lanka".
  if (place && company) place = place.replace(new RegExp(`^${escapeRe(company)}\\s*[-–,]\\s*`, 'i'), '') || place;

  if (title) out.title = title;
  if (company) out.company = company;
  if (place) out.location = place;

  if (/\bhybrid\b/i.test(text)) out.work_mode = 'hybrid';
  else if (/\bon[- ]?site\b/i.test(text)) out.work_mode = 'onsite';
  else if (/\bremote\b/i.test(text)) out.work_mode = 'remote';

  const type = oneJobType(text);
  if (type) out.job_type = type;

  for (const line of lines) {
    if (/closing date|closes?\b|deadline|apply (?:before|by)|last date/i.test(line)) {
      const date = parseDate(line);
      if (date) { out.closes_on = date; break; }
    }
  }

  // "Posted Today", "Posted 14 Days Ago", "Date posted: 12 Nov 2026", or "posted on" with the value on the next line.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].length <= 60 && lines[i].match(/^(?:date\s+)?posted\b\s*(?:on\b)?\s*[:\-–]?\s*(.*)$/i);
    if (!m) continue;
    const date = postedFrom(m[1] || lines[i + 1] || '', now);
    if (date) { out.posted_on = date; break; }
  }

  // "You applied for this job on November 16, 2026."
  for (const line of lines) {
    const m = line.match(/\byou\s+applied\b.*?\bon\s+(.+)$/i);
    const date = m ? parseDate(m[1]) : '';
    if (date) { out.applied_on = date; break; }
  }
  return out;
}
