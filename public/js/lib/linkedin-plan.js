// Turns what parse-linkedin found into a list of things to add, by comparing it with what is already in Shirube.
// Rules: a typed value is never overwritten, an empty field is filled, a row that is already there is not added twice.
// Pure functions: planImport() decides, applyPlan() runs the decisions through the normal profile API.
const SKILLS_MAX = 60;

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const noParens = (s) => norm(String(s ?? '').replace(/\([^)]*\)/g, ''));
const empty = (s) => String(s ?? '').trim() === '';

const DETAILS = [
  ['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'Location'], ['country', 'Country'],
  ['portfolio', 'Portfolio'], ['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['other_link', 'Other link'],
];

const period = (a, b) => (a && b ? `${a} to ${b}` : a ? `${a} to now` : b || '');

// current = { profile, preset: { id, name, summary, skills }, education, certifications, languages, experience }
export function planImport(parsed, current) {
  const groups = [];
  const kept = [];                         // things already in Shirube that differ: listed, never touched
  let n = 0;
  const id = () => `i${n++}`;
  const group = (key, title, items) => { if (items.length) groups.push({ key, title, items }); };
  const presetName = current.preset?.name ?? 'this preset';

  // Your details: only the empty ones.
  const details = [];
  for (const [key, label] of DETAILS) {
    const value = String(parsed[key] ?? '').trim();
    if (!value) continue;
    const have = String(current.profile?.[key] ?? '').trim();
    if (empty(have)) details.push({ id: id(), label, value, apply: { type: 'basic', key, value } });
    else if (norm(have) !== norm(value)) kept.push(`${label}: you already have “${have}”, LinkedIn says “${value}”`);
  }
  group('details', 'Your details (empty fields only)', details);

  // Summary and skills go to the preset you have open.
  if (parsed.summary) {
    if (empty(current.preset?.summary)) group('summary', `Summary for the preset “${presetName}”`, [{ id: id(), label: 'Summary', value: parsed.summary, apply: { type: 'summary', value: parsed.summary } }]);
    else if (norm(current.preset.summary) !== norm(parsed.summary)) kept.push(`Summary: the preset “${presetName}” already has one`);
  }
  const haveSkills = new Set((current.preset?.skills ?? []).map(norm));
  let room = SKILLS_MAX - (current.preset?.skills ?? []).length;
  group('skills', `Skills for the preset “${presetName}”`, parsed.skills
    .filter((s) => !haveSkills.has(norm(s)) && room-- > 0)
    .map((s) => ({ id: id(), label: s, apply: { type: 'skill', value: s } })));

  // Languages
  const langs = [];
  for (const l of parsed.languages) {
    const row = current.languages.find((x) => norm(x.name) === norm(l.name));
    if (!row) langs.push({ id: id(), label: l.name, value: l.level, apply: { type: 'create', path: 'languages', noun: 'language', body: { name: l.name, level: l.level } } });
    else if (empty(row.level) && l.level) langs.push({ id: id(), label: `${l.name}: add the level`, value: l.level, apply: { type: 'update', path: 'languages', noun: 'language update', id: row.id, body: { level: l.level } } });
  }
  group('languages', 'Languages', langs);

  // Certifications (LinkedIn's PDF has no dates or issuers: those stay for you to fill)
  const certs = parsed.certifications
    .filter((c) => !current.certifications.some((x) => norm(x.name) === norm(c.name) || (noParens(x.name) && noParens(x.name) === noParens(c.name))))
    .map((c) => ({ id: id(), label: c.name, apply: { type: 'create', path: 'certifications', noun: 'certification', body: { name: c.name } } }));
  group('certifications', 'Certifications', certs);

  // Experience: the same company and role is "already there"; empty fields of it can be filled.
  const exps = [];
  for (const e of parsed.experience) {
    const row = current.experience.find((x) => norm(x.company) === norm(e.company) && (norm(x.role) === norm(e.role) || empty(x.role) || empty(e.role)));
    const title = `${e.role || e.company}${e.role ? ` · ${e.company}` : ''}`;
    if (!row) {
      exps.push({ id: id(), label: title, value: period(e.start_date, e.end_date), detail: e.details, apply: { type: 'create', path: 'experience', noun: 'experience', body: { company: e.company, role: e.role, start_date: e.start_date, end_date: e.end_date, details: e.details }, showIn: true } });
      continue;
    }
    const fill = {};
    for (const key of ['role', 'start_date', 'end_date', 'details']) if (empty(row[key]) && e[key]) fill[key] = e[key];
    if (Object.keys(fill).length) exps.push({ id: id(), label: `${title}: fill the empty ${Object.keys(fill).map((k) => k.replace('_', ' ')).join(', ')}`, detail: fill.details, apply: { type: 'update', path: 'experience', noun: 'experience update', id: row.id, body: fill } });
  }
  group('experience', 'Experience (it is shown on the open preset)', exps);

  // Education: the same school is "already there"; empty dates are filled, a year-only start gets its month.
  const edus = [];
  for (const e of parsed.education) {
    const row = current.education.find((x) => norm(x.school) && (norm(x.school).includes(norm(e.school)) || norm(e.school).includes(norm(x.school))));
    const title = `${e.qualification || e.school}${e.qualification ? ` · ${e.school}` : ''}`;
    if (!row) {
      edus.push({ id: id(), label: title, value: period(e.start_date, e.end_date), apply: { type: 'create', path: 'education', noun: 'education', body: { school: e.school, qualification: e.qualification, start_date: e.start_date, end_date: e.end_date } } });
      continue;
    }
    const fill = {};
    if (empty(row.qualification) && e.qualification) fill.qualification = e.qualification;
    if (e.start_date && (empty(row.start_date) || (/^\d{4}$/.test(row.start_date.trim()) && e.start_date.includes(row.start_date.trim()) && row.start_date.trim() !== e.start_date))) fill.start_date = e.start_date;
    if (empty(row.end_date) && e.end_date) fill.end_date = e.end_date;
    if (Object.keys(fill).length) {
      const said = Object.entries(fill).map(([k, v]) => `${k.replace('_date', '')} ${row[k] ? `${row[k]} → ` : ''}${v}`).join(', ');
      edus.push({ id: id(), label: `${row.school}: update`, value: said, apply: { type: 'update', path: 'education', noun: 'education update', id: row.id, body: fill } });
    }
  }
  group('education', 'Education', edus);

  const count = groups.reduce((sum, g) => sum + g.items.length, 0);
  return { groups, kept, count };
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

// base = { body, activeId }: body is what the Save profile button would send now, so what you typed is saved too.
// api(path, { method, body }) is the normal client call; it throws on an error.
export async function applyPlan(api, plan, picked, base) {
  const items = plan.groups.flatMap((g) => g.items).filter((i) => picked.has(i.id));
  const counts = {};
  const bump = (key) => { counts[key] = (counts[key] ?? 0) + 1; };
  const newExperience = [];
  for (const it of items) {
    const a = it.apply;
    try {
      if (a.type === 'create') {
        const r = await api(`/api/${a.path}`, { method: 'POST', body: a.showIn ? { ...a.body, show_in: base.activeId } : a.body });
        if (a.path === 'experience') newExperience.push(r.id);
        bump(a.noun);
      } else if (a.type === 'update') {
        await api(`/api/${a.path}/${a.id}`, { method: 'PATCH', body: a.body });
        bump(a.noun);
      }
    } catch (err) {
      err.message = `Could not add “${it.label}”: ${err.message}`;
      err.done = counts;
      throw err;
    }
  }

  const body = structuredClone(base.body);
  const preset = body.presets.find((p) => p.id === base.activeId);
  for (const it of items) {
    const a = it.apply;
    if (a.type === 'basic') { body[a.key] = a.value; bump('detail'); }
    else if (a.type === 'summary') { preset.summary = a.value; bump('summary'); }
    else if (a.type === 'skill') { preset.skills = [...preset.skills, a.value]; bump('skill'); }
  }
  // New experience is shown on the open preset; keep what you had switched on or off there.
  if (newExperience.length) preset.experience_ids = [...(preset.experience_ids ?? []), ...newExperience];
  const result = await api('/api/profile', { method: 'PATCH', body });

  const order = ['detail', 'summary', 'skill', 'language', 'language update', 'certification', 'experience', 'experience update', 'education', 'education update'];
  const text = order.filter((k) => counts[k]).map((k) => (k === 'summary' ? 'the summary' : plural(counts[k], k))).join(', ');
  return { result, counts, text: text || 'nothing new' };
}
