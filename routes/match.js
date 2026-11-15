// Job match: the saved advert against the main preset. Reads only; nothing is stored.
import { HttpError } from '../lib/errors.js';
import { matchJob, orderSkills } from '../lib/match.js';

export function getMatch({ db, params }) {
  const id = Number(params.id);
  const job = db.prepare('SELECT id, title, company, description FROM jobs WHERE id = ?').get(id);
  if (!job) throw new HttpError(404, 'Job not found');

  const person = db.prepare('SELECT name, email, phone, location, portfolio, social, active_preset_id FROM profile WHERE id = 1').get();
  const row = db.prepare('SELECT * FROM presets WHERE id = ?').get(person.active_preset_id)
    ?? db.prepare('SELECT * FROM presets ORDER BY position, id LIMIT 1').get();
  const preset = row ? { ...row, skills: JSON.parse(row.skills || '[]') } : { id: null, name: '', target_role: '', summary: '', skills: [] };

  const experience = row
    ? db.prepare(
      `SELECT e.* FROM experience e JOIN preset_experience pe ON pe.experience_id = e.id
       WHERE pe.preset_id = ? ORDER BY e.position, e.id`,
    ).all(row.id)
    : [];
  const education = db.prepare('SELECT * FROM education ORDER BY position, id').all();

  const hasAdvert = job.description.trim().length > 0;
  const match = matchJob(job.description, preset, experience);
  return {
    job: { id: job.id, title: job.title, company: job.company, has_advert: hasAdvert },
    person,
    preset,
    experience,
    education,
    match,
    best_skills: orderSkills(preset.skills, match),
    to_add: match.skills.filter((s) => !s.matched),
  };
}
