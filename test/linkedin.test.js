import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../db.js';
import { createServer } from '../server.js';
import { parseLinkedin, foundAnything } from '../public/js/lib/parse-linkedin.js';
import { planImport, applyPlan } from '../public/js/lib/linkedin-plan.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
// The same (made-up) profile in three shapes a PDF copy can have.
const NEAT = fixture('linkedin-neat.txt');        // the left column first, then the main part
const MIXED = fixture('linkedin-mixed.txt');      // columns mixed: sidebar lines inside the main text
const COLUMNS = fixture('linkedin-columns.txt');  // the two columns side by side

test('neat text: every piece is read', () => {
  const p = parseLinkedin(NEAT);
  assert.equal(p.name, 'Sam Perera');
  assert.equal(p.headline, 'TechOps & Infrastructure | Final-year BIT, UOM | Linux, Docker, SQL Server, Git | Ex-Technical Support Executive');
  assert.deepEqual([p.location, p.country], ['Colombo', 'Sri Lanka']);
  assert.equal(p.email, 'sam.perera@example.com');
  assert.deepEqual([p.portfolio, p.linkedin, p.other_link, p.github], ['https://samperera.dev', 'https://www.linkedin.com/in/sam-perera', 'https://example.dev', '']);
  assert.deepEqual(p.skills, ['SQL Server', 'Technical Support', 'Linux']);
  assert.deepEqual(p.languages, [{ name: 'Sinhalese', level: 'Native or Bilingual' }, { name: 'English', level: 'Professional Working' }]);
  assert.deepEqual(p.certifications.map((c) => c.name), [
    'AWS Cloud Practitioner Essentials', 'Introduction to Python (DataCamp)', 'Shell Scripts for Beginners (KodeKloud)', 'DevOps Foundations', 'Introduction to DevOps and SRE (LFS162)',
  ]);
  assert.equal(p.summary, 'I keep business systems running. When something breaks in production, I find the cause and fix it.');
  assert.equal(p.experience.length, 1);
  const e = p.experience[0];
  assert.deepEqual([e.company, e.role, e.start_date, e.end_date], ['Acme POS Solutions (Pvt) Ltd', 'Technical Support Executive', 'Jul 2025', 'Jan 2026']);
  const lines = e.details.split('\n');
  assert.equal(lines[0], 'L1/L2-level production support for POS and back-office systems serving retail and hospitality clients across Sri Lanka, within a 24x7 support team.');
  assert.equal(lines[1], '- Installed and upgraded POS systems for new and existing clients, covering Windows setup, SQL Server configuration, application installation and post-install testing.');
  assert.equal(lines.length, 5, 'a paragraph and four bullets, with the bullet that crosses the page break joined');
  assert.match(lines[4], /^- Managed incoming tickets, .* following up on their responses\.$/);
  assert.deepEqual(p.education, [{ school: 'University of Moratuwa', qualification: 'Bachelor of Information Technology', start_date: 'Oct 2023', end_date: 'Apr 2027', note: '' }]);
});

test('column-mixed text and side-by-side columns give the same result as the neat text', () => {
  const neat = parseLinkedin(NEAT);
  for (const [name, text] of [['mixed', MIXED], ['columns', COLUMNS]]) {
    const p = parseLinkedin(text);
    for (const key of ['name', 'headline', 'location', 'country', 'email', 'portfolio', 'other_link', 'summary', 'skills', 'languages', 'certifications', 'education']) {
      assert.deepEqual(p[key], neat[key], `${name}: ${key}`);
    }
    assert.equal(p.experience.length, 1, `${name}: one job`);
    assert.equal(p.experience[0].company, neat.experience[0].company, name);
    assert.equal(p.experience[0].role, neat.experience[0].role, name);
    assert.ok(!/Foundations|KodeKloud|LFS162/.test(p.experience[0].details), `${name}: no sidebar lines inside the experience`);
  }
  // a link that wraps at its hyphen keeps the hyphen when the text has the wrap in it
  assert.equal(parseLinkedin(COLUMNS).linkedin, 'https://www.linkedin.com/in/sam-perera');
});

test('main part first, sidebar last, also works', () => {
  const lines = NEAT.split('\n');
  const nameAt = lines.indexOf('Sam Perera');
  const main = lines.slice(nameAt);
  const side = lines.slice(0, nameAt);
  const p = parseLinkedin([...main, ...side].join('\n'));
  assert.equal(p.name, 'Sam Perera');
  assert.equal(p.country, 'Sri Lanka');
  assert.equal(p.skills.length, 3);
  assert.equal(p.certifications.length, 5);
  assert.equal(p.experience.length, 1);
  assert.equal(p.education.length, 1);
});

test('several roles at one company, and a role that is still going', () => {
  const p = parseLinkedin(`Sam Perera
Engineer at heart
Colombo, Sri Lanka
Experience
Globex Corp
3 years 2 months
Senior Engineer
March 2024 - Present (1 year 8 months)
Colombo, Sri Lanka
- Led the platform team.
Engineer
January 2022 - February 2024 (2 years 2 months)
- Built the billing APIs.
Initech
Analyst
June 2020 - December 2021 (1 year 7 months)
Kandy, Sri Lanka
Wrote weekly reports for the finance team.`);
  assert.deepEqual(p.experience.map((e) => [e.company, e.role, e.start_date, e.end_date]), [
    ['Globex Corp', 'Senior Engineer', 'Mar 2024', ''],
    ['Globex Corp', 'Engineer', 'Jan 2022', 'Feb 2024'],
    ['Initech', 'Analyst', 'Jun 2020', 'Dec 2021'],
  ]);
  assert.equal(p.experience[0].details, '- Led the platform team.');
  assert.equal(p.experience[2].details, 'Wrote weekly reports for the finance team.');
});

test('education with and without dates; contact with a phone, GitHub and a wrapped link', () => {
  const p = parseLinkedin(`Contact
+94 77 123 4567 (Mobile)
www.linkedin.com/in/some-very-long-profile-name-
12345abc (LinkedIn)
github.com/sam-perera (Other)
Sam Perera
Developer
Galle, Sri Lanka
Education
University of Colombo
BSc in Computer Science
Royal College
Advanced Level · (2015 - 2017)`);
  assert.equal(p.phone, '+94 77 123 4567');
  assert.equal(p.linkedin, 'https://www.linkedin.com/in/some-very-long-profile-name-12345abc');
  assert.equal(p.github, 'https://github.com/sam-perera');
  assert.equal(p.other_link, '');
  assert.deepEqual(p.education.map((e) => [e.school, e.qualification, e.start_date, e.end_date]), [
    ['University of Colombo', 'BSc in Computer Science', '', ''],
    ['Royal College', 'Advanced Level', '2015', '2017'],
  ]);
});

test('text that is not a LinkedIn profile gives nothing', () => {
  assert.equal(foundAnything(parseLinkedin('')), false);
  assert.equal(foundAnything(parseLinkedin('hello\nthis is just a note')), false);
  assert.equal(foundAnything(parseLinkedin('just a note')), false, 'one line is not a profile');
  assert.equal(foundAnything(parseLinkedin('Sam Perera\nDeveloper\nColombo, Sri Lanka')), false, 'no section headings');
  assert.equal(foundAnything(parseLinkedin(NEAT)), true);
});

// ---- the plan: what gets added, what is left alone ----
const current = (over = {}) => ({
  profile: { name: '', email: '', phone: '', location: '', country: '', portfolio: '', linkedin: '', github: '', other_link: '' },
  preset: { id: 1, name: 'General', summary: '', skills: [] },
  education: [], certifications: [], languages: [], experience: [],
  ...over,
});
const items = (plan, key) => plan.groups.find((g) => g.key === key)?.items ?? [];

test('plan on an empty profile adds everything', () => {
  const plan = planImport(parseLinkedin(NEAT), current());
  assert.equal(items(plan, 'details').length, 7, 'name, email, location, country and three links (this profile has no phone or GitHub)');
  assert.equal(items(plan, 'summary').length, 1);
  assert.equal(items(plan, 'skills').length, 3);
  assert.equal(items(plan, 'languages').length, 2);
  assert.equal(items(plan, 'certifications').length, 5);
  assert.equal(items(plan, 'experience').length, 1);
  assert.equal(items(plan, 'education').length, 1);
  assert.deepEqual(plan.kept, []);
});

test('plan never overwrites what is typed, never adds a row twice, and fills what is empty', () => {
  const plan = planImport(parseLinkedin(NEAT), current({
    profile: { name: 'Typed Name', email: '', phone: '', location: 'Colombo', country: 'Sri Lanka', portfolio: 'https://mine.dev', linkedin: '', github: '', other_link: '' },
    preset: { id: 1, name: 'General', summary: 'My own summary', skills: ['linux', 'Docker'] },
    education: [{ id: 7, school: 'University of Moratuwa', qualification: '', start_date: '2023', end_date: '', note: '' }],
    certifications: [{ id: 3, name: 'DevOps Foundations' }, { id: 4, name: 'Introduction to Python' }],
    languages: [{ id: 5, name: 'english', level: '' }],
    experience: [{ id: 9, company: 'Acme POS Solutions (Pvt) Ltd', role: 'Technical Support Executive', start_date: 'Jul 2025', end_date: '', details: '' }],
  }));
  const labels = (key) => items(plan, key).map((i) => i.label);
  assert.deepEqual(labels('details'), ['Email', 'LinkedIn', 'Other link']);           // not name, location, country, portfolio
  assert.equal(items(plan, 'summary').length, 0);
  assert.deepEqual(labels('skills'), ['SQL Server', 'Technical Support']);            // linux is already there
  // "DevOps Foundations" is there, and "Introduction to Python" counts as "Introduction to Python (DataCamp)"
  assert.deepEqual(labels('certifications'), ['AWS Cloud Practitioner Essentials', 'Shell Scripts for Beginners (KodeKloud)', 'Introduction to DevOps and SRE (LFS162)']);
  assert.deepEqual(items(plan, 'languages').map((i) => [i.label, i.apply.type]), [['Sinhalese', 'create'], ['English: add the level', 'update']]);
  const exp = items(plan, 'experience');
  assert.equal(exp.length, 1);
  assert.equal(exp[0].apply.type, 'update');
  assert.deepEqual(Object.keys(exp[0].apply.body).sort(), ['details', 'end_date']);
  const edu = items(plan, 'education');
  assert.equal(edu[0].apply.type, 'update');
  assert.deepEqual(edu[0].apply.body, { qualification: 'Bachelor of Information Technology', start_date: 'Oct 2023', end_date: 'Apr 2027' });
  assert.ok(plan.kept.some((k) => k.startsWith('Name: you already have “Typed Name”')));
  assert.ok(plan.kept.some((k) => k.startsWith('Summary:')));
});

test('a profile that already has everything gives an empty plan', () => {
  const p = parseLinkedin(NEAT);
  const plan = planImport(p, current({
    profile: { name: p.name, email: p.email, phone: '', location: p.location, country: p.country, portfolio: p.portfolio, linkedin: p.linkedin, github: '', other_link: p.other_link },
    preset: { id: 1, name: 'General', summary: p.summary, skills: p.skills },
    education: [{ id: 1, school: p.education[0].school, qualification: p.education[0].qualification, start_date: 'Oct 2023', end_date: 'Apr 2027', note: '' }],
    certifications: p.certifications.map((c, i) => ({ id: i + 1, name: c.name })),
    languages: p.languages.map((l, i) => ({ id: i + 1, ...l })),
    experience: [{ id: 1, ...p.experience[0] }],
  }));
  assert.equal(plan.count, 0);
});

// ---- applying the plan through the real API ----
const db = openDb(':memory:');
const server = createServer(db, {});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const api = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(base + path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
};
const state = async () => {
  const d = await api('/api/profile');
  const preset = d.presets.find((p) => p.id === d.profile.active_preset_id);
  return { d, preset, cur: { profile: d.profile, preset, education: d.education, certifications: d.certifications, languages: d.languages, experience: d.experience } };
};
const bodyOf = ({ d }) => ({
  ...Object.fromEntries(['name', 'email', 'phone', 'location', 'country', 'portfolio', 'linkedin', 'github', 'other_link', 'follow_up_days', 'time_zone'].map((k) => [k, d.profile[k]])),
  active_preset_id: d.profile.active_preset_id,
  presets: d.presets.map(({ id, name, target_role, summary, skills, experience_ids }) => ({ id, name, target_role, summary, skills, experience_ids })),
});

test('apply: adds what is ticked, keeps what you typed, shows new experience on the open preset', async () => {
  // something typed on the page but not yet saved
  const s0 = await state();
  const body = bodyOf(s0);
  body.name = 'Typed Name';
  const plan = planImport(parseLinkedin(MIXED), { ...s0.cur, profile: { ...s0.d.profile, name: 'Typed Name' } });
  const picked = new Set(plan.groups.flatMap((g) => g.items.map((i) => i.id)));
  const certItem = items(plan, 'certifications')[0];
  picked.delete(certItem.id);                                  // one thing unticked

  const out = await applyPlan(api, plan, picked, { body, activeId: s0.d.profile.active_preset_id });
  assert.match(out.text, /6 details/, 'seven found, minus the name you typed');
  assert.match(out.text, /4 certifications/);
  const s1 = await state();
  assert.equal(s1.d.profile.name, 'Typed Name', 'the typed name was saved, not replaced');
  assert.equal(s1.d.profile.email, 'sam.perera@example.com');
  assert.equal(s1.d.profile.country, 'Sri Lanka');
  assert.equal(s1.d.profile.linkedin, 'https://www.linkedin.com/in/samperera');
  assert.equal(s1.preset.summary.startsWith('I keep business systems running.'), true);
  assert.deepEqual(s1.preset.skills, ['SQL Server', 'Technical Support', 'Linux']);
  assert.equal(s1.d.certifications.length, 4);
  assert.ok(!s1.d.certifications.some((c) => c.name === certItem.label));
  assert.deepEqual(s1.d.languages.map((l) => l.name), ['Sinhalese', 'English']);
  assert.equal(s1.d.experience.length, 1);
  assert.deepEqual(s1.preset.experience_ids, [s1.d.experience[0].id], 'shown on the open preset');
  assert.equal(s1.d.education.length, 1);

  // reading the same text again: only the unticked certification is left
  const again = planImport(parseLinkedin(MIXED), s1.cur);
  assert.equal(again.count, 1);
  assert.equal(again.groups[0].key, 'certifications');
});

test('apply: a refused item says which one and keeps what was added before it', async () => {
  const s = await state();
  const plan = { groups: [{ key: 'x', title: 'x', items: [
    { id: 'a', label: 'Good one', apply: { type: 'create', path: 'languages', noun: 'language', body: { name: 'Tamil', level: 'Elementary' } } },
    { id: 'b', label: 'Bad one', apply: { type: 'create', path: 'certifications', noun: 'certification', body: { name: 'x'.repeat(300) } } },
  ] }], kept: [], count: 2 };
  await assert.rejects(applyPlan(api, plan, new Set(['a', 'b']), { body: bodyOf(s), activeId: s.d.profile.active_preset_id }), (err) => {
    assert.match(err.message, /^Could not add “Bad one”:/);
    assert.deepEqual(err.done, { language: 1 });
    return true;
  });
  assert.ok((await state()).d.languages.some((l) => l.name === 'Tamil'));
});
