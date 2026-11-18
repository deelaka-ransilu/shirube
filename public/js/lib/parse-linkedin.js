// Reads the text of a LinkedIn "Save to PDF" profile (pasted by the person) into plain pieces.
// Pure functions, no page needed. It only guesses: the person sees a preview and picks what to add.
//
// The PDF has a left sidebar (Contact, Top Skills, Languages, Certifications) and a main part (name,
// headline, place, Summary, Experience, Education). Copying the text usually gives the sidebar first,
// but this reads either order: it cuts the text at the section headings.
const MAIN = ['summary', 'experience', 'education'];
const SIDE = ['contact', 'top skills', 'languages', 'certifications', 'licenses & certifications', 'licenses and certifications'];
// Sections that exist but are not read; they only mark where the one before them ends.
const OTHER = ['honors-awards', 'honors & awards', 'publications', 'projects', 'volunteer experience', 'courses', 'patents', 'test scores', 'organizations', 'recommendations', 'interests', 'skills'];
const HEADINGS = new Set([...MAIN, ...SIDE, ...OTHER]);

const MONTH = '[A-Z][a-z]{2,8}';
const DATE_RANGE = new RegExp(`^((?:${MONTH}\\s+)?\\d{4})\\s*[-–]\\s*(Present|(?:${MONTH}\\s+)?\\d{4})(?:\\s*\\(([^)]*)\\))?$`);
const DURATION = /^\d+\s+(?:years?|months?)(?:\s+\d+\s+months?)?$/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const JOB_WORDS = /\b(engineer|developer|manager|analyst|designer|intern|student|consultant|specialist|officer|executive|administrator|architect|lead|director|support|technician|associate|assistant|graduate|founder|freelance|tester|scientist)\b/i;

const clip = (text, max) => String(text ?? '').trim().slice(0, max);
const words = (s) => s.split(/\s+/).filter(Boolean);
const lettersOnly = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

// "July 2025" -> "Jul 2025" (short, and it fits the 20-character date boxes). "Present" -> ''.
function shortDate(text) {
  const t = String(text ?? '').trim();
  if (!t || /^present$/i.test(t)) return '';
  const m = t.match(new RegExp(`^(${MONTH})\\s+(\\d{4})$`));
  return m ? `${m[1].slice(0, 3)} ${m[2]}` : t;
}

const withScheme = (url) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);

// Adds a line to a list of text items the way a PDF wraps them: a "- " line starts a new bullet,
// a line that does not follow a finished sentence continues the one before.
function joinItems(lines) {
  const items = [];
  for (const line of lines) {
    const bullet = /^[-*•]\s+/.test(line);
    const last = items[items.length - 1];
    if (!bullet && last !== undefined && (!/[.!?:]$/.test(last) || /^[a-z(]/.test(line))) {
      items[items.length - 1] = last.endsWith('-') ? `${last}${line}` : `${last} ${line}`;
    } else {
      items.push(bullet ? line.replace(/^[*•]\s+/, '- ') : line);
    }
  }
  return items;
}

// ---- getting the text into one straight list ----
// Copying from a PDF can give the two columns side by side (a wide gap in the middle of each line).
// Each page is cut back into its left column, then its right column, which is the order LinkedIn writes it in.
function columns(page) {
  const tidy = page.map((l) => l.replace(/\u00a0/g, ' ').replace(/\f/g, ''));
  const indent = (l) => l.length - l.trimStart().length;
  // The right column starts at the same place on every line: find that place from the lines that have only a right part.
  const count = new Map();
  for (const l of tidy) if (l.trim() && indent(l) >= 12) count.set(indent(l), (count.get(indent(l)) ?? 0) + 1);
  let x = 0;
  let best = 0;
  for (const [n, c] of count) if (c > best) { x = n; best = c; }
  if (best < 3) return tidy;                       // one column: leave it alone
  const left = [];
  const right = [];
  for (const line of tidy) {
    if (!line.trim()) { left.push(''); right.push(''); continue; }
    if (indent(line) >= 12) right.push(line.trim());
    else if (line.length > x && line[x - 1] === ' ' && line[x] !== ' ') { left.push(line.slice(0, x).trim()); right.push(line.slice(x).trim()); }
    else left.push(line.trim());
  }
  return [...left, '', ...right];
}

// Lines in order. Blank lines are kept (as '') because they help find sidebar lines that landed in the main text.
function straighten(text) {
  const pages = [];
  let page = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (/^\s*page\s+\d+\s+of\s+\d+\s*$/i.test(raw)) { pages.push(page); page = []; continue; }
    page.push(raw);
  }
  pages.push(page);
  const lines = [];
  for (const l of pages.flatMap(columns).map((x) => x.trim())) if (l || lines[lines.length - 1] !== '') lines.push(l);
  while (lines[0] === '') lines.shift();
  while (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// ---- sections ----
function cutSections(lines) {
  const order = [];                       // [{ name, lines }] in the order they appear
  let current = null;
  const head = [];                        // lines before the first heading
  for (const line of lines) {
    const key = line.toLowerCase();
    if (line && HEADINGS.has(key)) { current = { name: key, lines: [] }; order.push(current); continue; }
    (current ? current.lines : head).push(line);
  }
  return { order, head };
}

// ---- Contact ----
function parseContact(all) {
  const lines = all.filter(Boolean);
  const out = {};
  let buffer = '';
  const take = (text) => {
    const label = text.match(/\(([^()]+)\)\s*$/);
    const value = text.replace(/\s*\([^()]+\)\s*$/, '').replace(/\s+/g, '').trim();
    const kind = (label?.[1] ?? '').toLowerCase();
    if (!value) return;
    if (EMAIL.test(text) && !label) { out.email ??= text.match(EMAIL)[0]; return; }
    if (['mobile', 'home', 'work', 'phone'].includes(kind)) { out.phone ??= text.replace(/\s*\([^()]+\)\s*$/, '').trim(); return; }
    const url = withScheme(value);
    if (/github\.com/i.test(url)) out.github ??= url;
    else if (kind === 'linkedin' || /linkedin\.com/i.test(url)) out.linkedin ??= url;
    else if (['portfolio', 'personal website', 'blog'].includes(kind)) out.portfolio ??= url;
    else out.other_link ??= url;
  };
  for (const line of lines) {
    if (EMAIL.test(line) && !buffer) { take(line); continue; }
    buffer += buffer ? line : line;       // a long link can wrap: keep joining until the (Label) closes it
    if (/\([^()]+\)\s*$/.test(buffer)) { take(buffer); buffer = ''; }
  }
  if (/^[\w.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(buffer.replace(/\s+/g, ''))) take(buffer);   // a link whose (Label) is missing
  return out;
}

// ---- Languages: "English (Professional Working)", the (level) may wrap onto the next line ----
function parseLanguages(all) {
  const lines = all.filter(Boolean);
  const out = [];
  let buffer = '';
  for (const line of lines) {
    buffer = buffer ? `${buffer} ${line}` : line;
    if ((buffer.match(/\(/g) || []).length > (buffer.match(/\)/g) || []).length) continue;
    const m = buffer.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    const name = clip(m ? m[1] : buffer, 100);
    if (name) out.push({ name, level: clip(m ? m[2] : '', 60) });
    buffer = '';
  }
  if (buffer) out.push({ name: clip(buffer.replace(/\(.*$/, ''), 100), level: '' });
  return out.filter((l) => l.name);
}

// ---- Certifications: a name can wrap, and its "(Issuer)" often sits on the next line ----
function parseCertifications(all) {
  const lines = all.filter(Boolean);
  const items = [];
  for (const line of lines) {
    const last = items[items.length - 1];
    const continues = last !== undefined && (/^[a-z(]/.test(line) || /\b(and|of|for|to|the|with|in|on|&|-)$/i.test(last));
    if (continues) items[items.length - 1] = `${last} ${line}`;
    else items.push(line);
  }
  return items.map((name) => ({ name: clip(name, 200) })).filter((c) => c.name);
}

// ---- Experience ----
const looksLikePlace = (line) => line.includes(',') && line.length <= 80 && !/^[-*•]/.test(line) && !/[.!?]$/.test(line) && words(line).length <= 9;
const looksLikeHeading = (line) => line.length <= 80 && !/^[-*•]/.test(line) && !/[.,;:!?]$/.test(line) && !looksLikePlace(line);

// In some copies the sidebar (certifications) is mixed into the main text: short lines alone between blank lines,
// in the middle of a sentence or just before a bullet. They are taken out and handed back, so they do not end up
// inside your experience.
function takeSpills(all) {
  const chunks = [];
  let cur = [];
  for (const l of all) { if (l === '') { if (cur.length) chunks.push(cur); cur = []; } else cur.push(l); }
  if (cur.length) chunks.push(cur);
  const keep = [];
  const spilled = [];
  chunks.forEach((c, i) => {
    const text = c.join(' ');
    const prev = chunks[i - 1];
    const next = chunks[i + 1];
    const alone = prev && next && c.length <= 2 && text.length <= 70
      && !/^[-*•]/.test(c[0]) && !/[.!?:]$/.test(text) && !DATE_RANGE.test(c[0]) && !DATE_RANGE.test(c[c.length - 1]);
    const midText = alone && (!/[.!?]$/.test(prev[prev.length - 1]) || /^[-*•a-z]/.test(next[0]));
    if (midText) spilled.push(...c); else keep.push(...c);
  });
  return { lines: keep, spilled };
}

function parseExperience(lines) {
  const dateAt = [];
  lines.forEach((l, i) => { if (DATE_RANGE.test(l) && i >= 1) dateAt.push(i); });
  if (!dateAt.length) return [];

  const blocks = [];
  let company = '';
  dateAt.forEach((d, n) => {
    const prevDate = n > 0 ? dateAt[n - 1] : -1;
    const role = lines[d - 1];
    let start = d - 1;
    if (d - 3 > prevDate && DURATION.test(lines[d - 2] ?? '')) { company = lines[d - 3]; start = d - 3; }
    else if (d - 2 > prevDate + 1 && looksLikeHeading(lines[d - 2] ?? '')) { company = lines[d - 2]; start = d - 2; }
    else if (n === 0 && d - 2 >= 0) { company = lines[d - 2]; start = d - 2; }
    blocks.push({ d, start, role, company });
  });

  return blocks.map((b, n) => {
    const end = n + 1 < blocks.length ? blocks[n + 1].start : lines.length;
    let body = lines.slice(b.d + 1, end);
    if (body.length && looksLikePlace(body[0])) body = body.slice(1);   // the place line, not stored
    const m = lines[b.d].match(DATE_RANGE);
    let details = joinItems(body).join('\n');
    if (details.length > 5000) details = details.slice(0, 5000).replace(/\n[^\n]*$/, '');
    return {
      company: clip(b.company || b.role, 200),
      role: b.company ? clip(b.role, 200) : '',
      start_date: shortDate(m[1]),
      end_date: shortDate(m[2]),
      details,
    };
  }).filter((e) => e.company);
}

// ---- Education: school on one line, then "Degree, Field · (Oct 2023 - Apr 2027)" which may wrap ----
function parseEducation(all) {
  const lines = all.filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const school = lines[i];
    // The line after the school is the degree. If its bracket is still open, the dates wrap onto the next line(s).
    let rest = lines[i + 1] ?? '';
    let used = rest ? 1 : 0;
    while ((rest.match(/\(/g) || []).length > (rest.match(/\)/g) || []).length && used < 3 && i + 1 + used < lines.length) {
      rest = `${rest} ${lines[i + 1 + used]}`;
      used++;
    }
    i += used;

    const dates = rest.match(/\(([^()]*)\)\s*$/);
    const range = dates ? dates[1].trim().match(DATE_RANGE) ?? dates[1].trim().match(new RegExp(`^((?:${MONTH}\\s+)?\\d{4})\\s*[-–]\\s*(Present|(?:${MONTH}\\s+)?\\d{4})$`)) : null;
    let degree = rest.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s*[·•]\s*$/, '').trim();
    const [first, ...others] = degree.split(/\s*[·•]\s*/);
    degree = first.trim();
    const parts = degree.split(/,\s*/);
    // "Bachelor of Information Technology, Information Technology": the field repeats the degree, keep it once.
    if (parts.length === 2 && parts[0].toLowerCase().includes(parts[1].toLowerCase())) degree = parts[0];
    out.push({
      school: clip(school, 200),
      qualification: clip(degree, 200),
      start_date: range ? shortDate(range[1]) : '',
      end_date: range ? shortDate(range[2]) : '',
      note: others.join(' ').trim(),
    });
  }
  return out.filter((e) => e.school);
}

// ---- the header: name, headline, place ----
function nameLike(line) {
  const w = words(line);
  return w.length >= 2 && w.length <= 4 && line.length <= 40 && !/[\d,|&@()]/.test(line) && w.every((x) => /^[A-Z][A-Za-z'’.-]*$/.test(x));
}

function parseHeader(block, hints) {
  if (!block.length) return {};
  const place = block[block.length - 1];
  if (block.length === 1) return { name: clip(block[0], 200) };
  // The block holds the name, then the headline (one to three lines), then the place.
  const loc = block.length - 1;
  const candidates = [];
  for (let i = loc - 1; i >= Math.max(0, loc - 5); i--) if (nameLike(block[i])) candidates.push(i);
  const hinted = candidates.filter((i) => words(block[i]).some((w) => { const t = lettersOnly(w); return t.length >= 3 && hints.some((h) => h.includes(t)); }));
  const plain = candidates.filter((i) => !JOB_WORDS.test(block[i]));
  const pick = (hinted.length ? hinted : plain).slice(-1)[0];            // the farthest from the place: the name comes first
  if (pick === undefined) return { place: clip(place, 120) };
  return { name: clip(block[pick], 200), headline: clip(block.slice(pick + 1, loc).join(' '), 300), place: clip(place, 120), nameIndex: pick };
}

// Colombo, Western Province, Sri Lanka -> city "Colombo", country "Sri Lanka"
function splitPlace(place) {
  const parts = String(place ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { location: parts[0], country: parts[parts.length - 1] };
  return { location: parts[0] ?? '', country: '' };
}

export function parseLinkedin(input) {
  const lines = straighten(input);
  const out = { name: '', headline: '', location: '', country: '', email: '', phone: '', portfolio: '', linkedin: '', github: '', other_link: '', summary: '', skills: [], languages: [], certifications: [], experience: [], education: [] };
  if (!lines.length) return out;

  const { order, head } = cutSections(lines);
  if (!order.length) return out;           // no Summary, Experience or Contact heading at all: not a LinkedIn profile
  const sections = (name) => order.filter((s) => s.name === name).flatMap((s) => s.lines);
  const firstPass = parseContact(sections('contact'));

  // The header block: the start of the text (main part first), or the end of the sidebar section that
  // comes right before the first main heading (sidebar first).
  const hints = [lettersOnly((firstPass.linkedin ?? '').replace(/.*\/in\//i, '').replace(/\/.*$/, '')), lettersOnly((firstPass.email ?? '').split('@')[0])].filter((h) => h.length >= 3);
  const firstMain = order.findIndex((s) => MAIN.includes(s.name));
  let headerInfo = {};
  if (head.some(Boolean)) {
    headerInfo = parseHeader(head.filter(Boolean), hints);
  } else if (firstMain > 0) {
    const sec = order[firstMain - 1];
    const block = sec.lines.filter(Boolean);
    headerInfo = parseHeader(block, hints);
    if (headerInfo.nameIndex !== undefined) sec.lines = block.slice(0, headerInfo.nameIndex);   // what is left is the real list
    else if (headerInfo.place) sec.lines = block.slice(0, -1);
  }
  Object.assign(out, parseContact(sections('contact')));          // again: the name and place lines are no longer in it
  out.name = headerInfo.name ?? '';
  out.headline = headerInfo.headline ?? '';
  Object.assign(out, splitPlace(headerInfo.place));

  // Summary. A short last line with no full stop is a sidebar line that wandered in (a third top skill, say).
  const summaryLines = sections('summary').filter(Boolean);
  const stray = [];
  while (summaryLines.length > 1 && summaryLines[summaryLines.length - 1].length <= 30 && !/[.!?:]$/.test(summaryLines[summaryLines.length - 1]) && /[.!?]$/.test(summaryLines[summaryLines.length - 2])) stray.unshift(summaryLines.pop());
  out.summary = clip(joinItems(summaryLines).join('\n\n'), 2000);

  out.skills = sections('top skills').filter(Boolean).map((s) => clip(s, 50)).slice(0, 10);
  if (out.skills.length === 2 && stray.length === 1) out.skills.push(clip(stray[0], 50));

  out.languages = parseLanguages(sections('languages'));
  const spillable = order.some((s) => s.name === 'certifications');
  const exp = takeSpills(sections('experience'));
  out.certifications = parseCertifications([...sections('certifications'), ...sections('licenses & certifications'), ...sections('licenses and certifications'), ...(spillable ? exp.spilled : [])]);
  out.experience = parseExperience(spillable ? exp.lines : sections('experience').filter(Boolean));
  out.education = parseEducation(sections('education'));
  return out;
}

// True when the text held anything we could use (so the page can say "that is not a LinkedIn profile").
export const foundAnything = (p) => Boolean(p.name || p.email || p.summary || p.skills.length || p.languages.length || p.certifications.length || p.experience.length || p.education.length || p.linkedin);
