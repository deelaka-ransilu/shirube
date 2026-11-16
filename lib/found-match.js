// New jobs: three honest signals per job, worked out on this computer from the saved role presets.
//   skills: how many of the skills the advert asks for are in a preset (the best preset is named)
//   role:   the job title shares a meaningful word with a preset's target role
//   entry:  the advert uses entry-level words (intern, junior, 1 year ...) and asks for no long experience
// A signal is only there when there is evidence. A missing badge never means "bad job". A guide, not a prediction.
import { makeMatcher } from './match.js';

// Words that say the level or the kind of work, not the field. Ignored when comparing titles.
const PLAIN = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'with', 'in', 'at', 'to', 'or', 'sr', 'jr',
  'engineer', 'engineers', 'developer', 'developers', 'senior', 'junior', 'lead', 'associate', 'trainee', 'intern',
  'internship', 'executive', 'officer', 'manager', 'specialist', 'consultant', 'assistant', 'analyst', 'team', 'role',
]);
const SAME = [
  [/quality\s+assurance/g, 'qa'], [/site\s+reliability/g, 'sre'], [/dev\s*ops/g, 'devops'],
  [/front[\s-]*end/g, 'frontend'], [/back[\s-]*end/g, 'backend'], [/full[\s-]*stack/g, 'fullstack'],
  [/it\s+support/g, 'support'], [/help\s*desk/g, 'support'],
];

export function titleWords(text) {
  let t = String(text ?? '').toLowerCase();
  for (const [re, to] of SAME) t = t.replace(re, to);
  return new Set(t.split(/[^a-z0-9+#.]+/).map((w) => w.replace(/^[.]+|[.]+$/g, '')).filter((w) => w.length >= 2 && !PLAIN.has(w)));
}

const ENTRY_TITLE = /\b(intern|internship|trainee|junior|jr|fresher|fresh\s+graduate|graduate|entry[\s-]level|associate)\b/i;
const ENTRY_TEXT = /\b(fresher|freshers|fresh\s+graduates?|entry[\s-]level|no\s+(?:prior\s+|previous\s+)?experience|0\s*(?:-|–|to)\s*1\s*years?|less\s+than\s+(?:a|1|one)\s+year|internship)\b/i;
const ONE_YEAR = /\b(?:1|one)\s*\+?\s*years?\b/i;
const LONG = /\b(?:[3-9]|1\d)\s*\+?\s*(?:years?|yrs?)\b/i;
const SENIOR = /\b(senior|sr|lead|principal|head|manager)\b/i;

export function isEntryLevel(title, text) {
  if (SENIOR.test(title)) return false;
  const inTitle = ENTRY_TITLE.test(title);
  if (!inTitle && LONG.test(text)) return false;
  return inTitle || ENTRY_TEXT.test(text) || ONE_YEAR.test(text);
}

function stripTags(text) {
  return String(text ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// Presets that say something about the person: some skills or a target role.
export function loadPresets(db) {
  const rows = db.prepare('SELECT * FROM presets ORDER BY position, id').all();
  const exp = db.prepare(
    `SELECT e.* FROM experience e JOIN preset_experience pe ON pe.experience_id = e.id
     WHERE pe.preset_id = ? ORDER BY e.position, e.id`,
  );
  return rows
    .map((r) => {
      let skills = [];
      try { skills = JSON.parse(r.skills || '[]'); } catch { /* bad text: no skills */ }
      return { id: r.id, name: r.name, target_role: r.target_role ?? '', summary: r.summary ?? '', skills: skills.filter((s) => String(s).trim()) };
    })
    .filter((p) => p.skills.length || p.target_role.trim())
    .map((p) => ({ ...p, matcher: p.skills.length ? makeMatcher(p, exp.all(p.id)) : null, roleWords: titleWords(p.target_role) }));
}

// jobs: [{ id, title, description }] -> Map(id -> { skills, role, entry })
export function matchJobs(jobs, presets) {
  const out = new Map();
  for (const j of jobs) {
    const text = stripTags(j.description);
    let skills = null;
    let skillScore = 0;
    for (const p of presets) {
      if (!p.matcher) continue;
      const r = p.matcher(text);
      const useMust = r.counts.must.total > 0;
      const c = useMust ? r.counts.must : r.counts.all;
      if (r.counts.all.matched === 0 || c.matched === 0) continue;
      const score = r.counts.must.matched * 2 + r.counts.nice.matched;
      if (score > skillScore) {
        skillScore = score;
        skills = { matched: c.matched, total: c.total, preset: p.name, names: r.skills.filter((s) => s.matched).map((s) => s.name) };
      }
    }
    const tw = titleWords(j.title);
    const rolePreset = presets.find((p) => [...p.roleWords].some((w) => tw.has(w)));
    out.set(j.id, {
      skills,
      role: rolePreset ? rolePreset.name : null,
      entry: isEntryLevel(j.title ?? '', text),
      score: skillScore,
    });
  }
  return out;
}

// The preset that fits one advert best (used when Job details opens): most asked-for skills matched, then any skills.
// The main preset wins a tie, and nothing wins when no preset matches a single skill.
export function bestPresetId(presets, advert, activeId = null) {
  const text = stripTags(advert);
  let best = null;
  let bestScore = 0;
  for (const p of presets) {
    if (!p.matcher) continue;
    const r = p.matcher(text);
    const score = r.counts.must.matched * 2 + r.counts.nice.matched;
    if (score > bestScore || (score === bestScore && score > 0 && p.id === activeId)) { best = p.id; bestScore = score; }
  }
  return best;
}
