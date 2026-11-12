// Checks and cleans profile data sent from the browser. Only known fields get through.
import { HttpError } from './errors.js';

const SKILLS_MAX = 60;
const SKILL_LEN = 50;

function body(b, what) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, `Send the ${what} as JSON`);
  return b;
}

// fields: { key: [label, maxLength] }. Copies the given, trimmed text fields into out.
function texts(b, fields, out) {
  for (const [key, [label, max]] of Object.entries(fields)) {
    if (b[key] === undefined) continue;
    if (typeof b[key] !== 'string') throw new HttpError(400, `${label} must be text`);
    const v = b[key].trim();
    if (v.length > max) throw new HttpError(400, `${label} is too long (most ${max} characters)`);
    out[key] = v;
  }
}

function webLink(v, label) {
  if (!v) return;
  let ok = false;
  try { ok = ['http:', 'https:'].includes(new URL(v).protocol); } catch { /* not a URL */ }
  if (!ok) throw new HttpError(400, `${label} must start with http:// or https://`);
}

export function isTimeZone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

const BASIC_TEXT = {
  name: ['Full name', 200],
  email: ['Email', 200],
  phone: ['Phone', 50],
  location: ['Location', 200],
  portfolio: ['Portfolio', 2000],
  social: ['GitHub or LinkedIn', 2000],
};

export function cleanBasics(b) {
  b = body(b, 'profile');
  const out = {};
  texts(b, BASIC_TEXT, out);
  if (out.email && !/^\S+@\S+\.\S+$/.test(out.email)) throw new HttpError(400, 'Email does not look right');
  if ('portfolio' in out) webLink(out.portfolio, 'Portfolio');
  if ('social' in out) webLink(out.social, 'GitHub or LinkedIn');

  if (b.follow_up_days !== undefined) {
    const n = Number(b.follow_up_days);
    if (b.follow_up_days === '' || !Number.isInteger(n) || n < 1 || n > 365) {
      throw new HttpError(400, 'Follow up days must be a whole number from 1 to 365');
    }
    out.follow_up_days = n;
  }
  if (b.time_zone !== undefined) {
    if (typeof b.time_zone !== 'string' || !isTimeZone(b.time_zone.trim())) {
      throw new HttpError(400, 'Time zone is not valid. Example: Asia/Colombo');
    }
    out.time_zone = b.time_zone.trim();
  }
  return out;
}

export function cleanSkills(list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Skills must be a list');
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string') throw new HttpError(400, 'Each skill must be text');
    const s = item.trim().replace(/\s+/g, ' ');
    if (!s) continue;
    if (s.length > SKILL_LEN) throw new HttpError(400, `A skill is too long (most ${SKILL_LEN} characters)`);
    if (seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  if (out.length > SKILLS_MAX) throw new HttpError(400, `Too many skills (most ${SKILLS_MAX})`);
  return out;
}

export function cleanPreset(b, { partial = false } = {}) {
  b = body(b, 'preset');
  const out = {};
  texts(b, { name: ['Preset name', 60], target_role: ['Target role', 200], summary: ['Summary', 2000] }, out);
  if (!partial && !out.name) throw new HttpError(400, 'Preset name is required');
  if (partial && 'name' in out && !out.name) throw new HttpError(400, 'Preset name is required');
  if (b.skills !== undefined) out.skills = cleanSkills(b.skills);
  if (b.experience_ids !== undefined) {
    if (!Array.isArray(b.experience_ids) || !b.experience_ids.every((n) => Number.isInteger(n))) {
      throw new HttpError(400, 'Experience list must be a list of ids');
    }
    out.experience_ids = [...new Set(b.experience_ids)];
  }
  return out;
}

export function cleanEducation(b, { partial = false } = {}) {
  b = body(b, 'education');
  const out = {};
  texts(b, {
    school: ['School', 200],
    qualification: ['Qualification', 200],
    start_date: ['Start', 20],
    end_date: ['End', 20],
    note: ['Note', 1000],
  }, out);
  if (!partial && !out.school) throw new HttpError(400, 'School is required');
  if (partial && 'school' in out && !out.school) throw new HttpError(400, 'School is required');
  return out;
}

export function cleanExperience(b, { partial = false } = {}) {
  b = body(b, 'experience');
  const out = {};
  texts(b, {
    company: ['Company', 200],
    role: ['Role', 200],
    start_date: ['Start', 20],
    end_date: ['End', 20],
    details: ['Details', 5000],
  }, out);
  if (!partial && !out.company) throw new HttpError(400, 'Company is required');
  if (partial && 'company' in out && !out.company) throw new HttpError(400, 'Company is required');
  return out;
}
