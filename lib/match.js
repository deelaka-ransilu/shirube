// Job match: compares the words of an advert with the skills in a profile preset.
// Plain word matching on this computer. No AI, no network. It is a guide, not a prediction.
import { SKILLS, ALIAS } from './skills-list.js';

const NICE_HEAD = /\b(nice[\s-]+to[\s-]+have|good[\s-]+to[\s-]+have|preferred|desirable|bonus|advantageous|an advantage|a plus)\b/i;
const MUST_HEAD = /\b(requirements?|required|must[\s-]+have|essential|qualifications?|what you(?:'|’)?ll need|what we(?:'|’)?re looking for|skills|experience|you have|you bring)\b/i;
const OTHER_HEAD = /\b(responsibilit(?:y|ies)|duties|about|benefits|we offer|what you(?:'|’)?ll do|the role|overview|how to apply|perks|why join)\b/i;
const NICE_LINE = /\b(nice[\s-]+to[\s-]+have|preferred|desirable|bonus|an? advantage|is an? plus|are an? plus|would be an? plus|a plus)\b/i;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s+');

// One pattern per name. Longer names go first so "SQL Server" is taken before "SQL".
function buildTerms(extra = []) {
  const terms = [];
  for (const [name, ...others] of SKILLS) for (const n of [name, ...others]) terms.push({ name, word: n });
  for (const name of extra) terms.push({ name, word: name });
  terms.sort((a, b) => b.word.length - a.word.length);
  return terms.map((t) => ({ name: t.name, re: new RegExp(`(?<![A-Za-z0-9])${escapeRe(t.word)}(?![A-Za-z0-9])`, 'gi') }));
}

// Skills named in one piece of text, as a Set of display names.
function scan(text, terms) {
  let rest = text;
  const found = new Set();
  for (const t of terms) {
    t.re.lastIndex = 0;
    if (t.re.test(rest)) {
      found.add(t.name);
      t.re.lastIndex = 0;
      rest = rest.replace(t.re, ' '); // used up, so a shorter name cannot match inside it
    }
  }
  return found;
}

// A person's own skill name -> the name used for matching (so "Postgres" = "PostgreSQL").
export function canonicalSkill(name) {
  const clean = String(name ?? '').trim();
  return ALIAS.get(clean.toLowerCase()) ?? clean;
}

function stripTags(text) {
  return String(text ?? '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d|ul|ol)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// A short line that is not a bullet and does not end like a sentence.
function isHeading(line) {
  if (/^([-•–]|\*(?!\*))\s/.test(line)) return false;
  const t = line.replace(/^[#*\s]+|[\s:*]+$/g, '');
  return t.length > 0 && t.length <= 40 && !/[.!?]$/.test(t);
}

// Every skill the advert names, each marked 'must' (asked for) or 'nice' (nice to have).
// Headings such as "Requirements" or "Nice to have" set the group; a line that says "is a plus" is nice to have.
export function advertSkills(text, extra = []) {
  const terms = buildTerms(extra);
  const out = new Map();
  let mode = 'must';
  for (const raw of stripTags(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      if (NICE_HEAD.test(line)) mode = 'nice';
      else if (OTHER_HEAD.test(line)) mode = 'must';
      else if (MUST_HEAD.test(line)) mode = 'must';
    }
    const level = mode === 'nice' || NICE_LINE.test(line) ? 'nice' : 'must';
    for (const name of scan(line, terms)) {
      if (!out.has(name) || (out.get(name) === 'nice' && level === 'must')) out.set(name, level);
    }
  }
  return [...out].map(([name, level]) => ({ name, level }));
}

// preset = { skills: [...], summary, target_role }, experience = the entries shown for that preset.
export function matchJob(advert, preset, experience = []) {
  const own = (preset.skills ?? []).map((s) => canonicalSkill(s)).filter((s) => s.length > 1);
  const ownSet = new Set(own.map((s) => s.toLowerCase()));
  const wanted = advertSkills(advert, own);

  const terms = buildTerms(own);
  const prose = [preset.summary, ...experience.flatMap((e) => [e.role, e.details])].filter(Boolean).join('\n');
  const inText = new Set([...scan(prose, terms)].map((s) => s.toLowerCase()));

  const skills = wanted.map(({ name, level }) => {
    const key = name.toLowerCase();
    const where = ownSet.has(key) ? 'skills' : inText.has(key) ? 'text' : null;
    return { name, level, matched: where !== null, where };
  });
  // Matched first, and "asked for" before "nice to have", for the lists on the page.
  const rank = (s) => (s.level === 'must' ? 0 : 1);
  skills.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  const count = (level) => {
    const list = skills.filter((s) => !level || s.level === level);
    return { total: list.length, matched: list.filter((s) => s.matched).length };
  };
  return {
    skills,
    counts: { all: count(), must: count('must'), nice: count('nice') },
    missing: skills.filter((s) => !s.matched).map((s) => s.name),
  };
}

// The preset's own skills, the ones the advert names first (their order kept inside each group).
export function orderSkills(presetSkills, result) {
  const hit = new Set(result.skills.filter((s) => s.matched && s.where === 'skills').map((s) => s.name.toLowerCase()));
  const marked = (presetSkills ?? []).map((name) => ({ name, hit: hit.has(canonicalSkill(name).toLowerCase()) }));
  return [...marked.filter((s) => s.hit), ...marked.filter((s) => !s.hit)];
}
