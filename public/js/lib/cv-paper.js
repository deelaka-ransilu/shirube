// The CV as a paper page, built from a /api/jobs/:id/match answer.
// Same facts as My profile, nothing rewritten. With mark = true the skills the advert names are highlighted.
import { html } from './html.js';

const period = (start, end) => (start && end ? `${start} to ${end}` : start ? `${start} to now` : end || '');
const bare = (url) => String(url ?? '').replace(/^https?:\/\//i, '').replace(/\/$/, '');

function part(title, body) {
  return html`<section class="cv-sec"><h3>${title}</h3>${body}</section>`;
}

export function cvPaper(d, { mark = true } = {}) {
  const { person, preset, experience, education } = d;
  const skills = d.best_skills;
  const contact = [person.email, person.phone, person.location, bare(person.portfolio), bare(person.social)].filter(Boolean);
  return html`
    <article class="cv-paper" aria-label="CV preview">
      <header class="cv-top">
        <div class="cv-name">${person.name || 'Your name'}</div>
        ${preset.target_role ? html`<div class="cv-role">${preset.target_role}</div>` : ''}
        ${contact.length ? html`<div class="cv-contact">${contact.join('  ·  ')}</div>` : ''}
      </header>
      ${preset.summary ? part('Summary', html`<p class="cv-pre">${preset.summary}</p>`) : ''}
      ${skills.length ? part('Skills', html`<div class="cv-skills">${skills.map((s) => html`<span class="cv-skill ${mark && s.hit ? 'hit' : ''}">${s.name}</span>`)}</div>`) : ''}
      ${experience.length ? part('Experience', experience.map((e) => html`
        <div class="cv-item">
          <div class="cv-item-head"><b>${e.role || e.company}</b><span class="cv-when">${period(e.start_date, e.end_date)}</span></div>
          ${e.role && e.company ? html`<div class="cv-sub">${e.company}</div>` : ''}
          ${e.details ? html`<p class="cv-pre">${e.details}</p>` : ''}
        </div>`)) : ''}
      ${education.length ? part('Education', education.map((e) => html`
        <div class="cv-item">
          <div class="cv-item-head"><b>${e.qualification || e.school}</b><span class="cv-when">${period(e.start_date, e.end_date)}</span></div>
          ${e.qualification && e.school ? html`<div class="cv-sub">${e.school}</div>` : ''}
          ${e.note ? html`<p class="cv-pre">${e.note}</p>` : ''}
        </div>`)) : ''}
    </article>`;
}

// One line about the match, for the strip above the paper.
export function matchLine(d) {
  const m = d.match;
  if (!d.job.has_advert) return { text: 'No advert text yet. Use Edit job to paste it, then the match shows here.', hasMatch: false };
  const { all } = m.counts;
  if (!all.total) return { text: 'No skills recognised in this advert.', hasMatch: false };
  const shown = m.missing.slice(0, 4);
  const more = m.missing.length - shown.length;
  const missing = m.missing.length ? ` · Missing: ${shown.join(', ')}${more > 0 ? ` +${more} more` : ''}` : ' · Missing: none';
  return { text: `${all.matched} of ${all.total} skills match${missing}`, hasMatch: true };
}
