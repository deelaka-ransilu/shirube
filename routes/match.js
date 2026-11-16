// Job match: the saved advert against the main preset (or the preset named in ?preset=). Reads only; nothing is stored.
import { HttpError } from '../lib/errors.js';
import { matchJob, orderSkills } from '../lib/match.js';
import { loadPresets, bestPresetId } from '../lib/found-match.js';

export function getMatch({ db, params, query = {} }) {
  const id = Number(params.id);
  const job = db.prepare('SELECT id, title, company, description FROM jobs WHERE id = ?').get(id);
  if (!job) throw new HttpError(404, 'Job not found');

  const person = db.prepare('SELECT name, email, phone, location, portfolio, social, active_preset_id FROM profile WHERE id = 1').get();
  const wanted = Number(query.preset);
  const asked = Number.isInteger(wanted) && wanted > 0 ? db.prepare('SELECT * FROM presets WHERE id = ?').get(wanted) : null;
  // With no preset asked for, open on the one that fits this advert best (the main preset wins a tie).
  const bestId = asked ? null : bestPresetId(loadPresets(db), job.description, person.active_preset_id);
  const row = asked
    ?? (bestId ? db.prepare('SELECT * FROM presets WHERE id = ?').get(bestId) : null)
    ?? db.prepare('SELECT * FROM presets WHERE id = ?').get(person.active_preset_id)
    ?? db.prepare('SELECT * FROM presets ORDER BY position, id LIMIT 1').get();
  const preset = row ? { ...row, skills: JSON.parse(row.skills || '[]') } : { id: null, name: '', target_role: '', summary: '', skills: [] };

  const experience = row
    ? db.prepare(
      `SELECT e.* FROM experience e JOIN preset_experience pe ON pe.experience_id = e.id
       WHERE pe.preset_id = ? ORDER BY e.position, e.id`,
    ).all(row.id)
    : [];
  const education = db.prepare('SELECT * FROM education ORDER BY position, id').all();
  const certifications = db.prepare('SELECT * FROM certifications ORDER BY position, id').all();

  const presets = db.prepare('SELECT id, name FROM presets ORDER BY position, id').all();
  const hasAdvert = job.description.trim().length > 0;
  const match = matchJob(job.description, preset, experience);
  return {
    job: { id: job.id, title: job.title, company: job.company, has_advert: hasAdvert },
    person,
    preset,
    presets,
    best_preset_id: bestId,
    experience,
    education,
    certifications,
    match,
    best_skills: orderSkills(preset.skills, match),
    to_add: match.skills.filter((s) => !s.matched),
  };
}
