// Job match: the saved advert compared with your main preset. Plain word matching, nothing is saved.
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { initials } from '../lib/format.js';
import { ICON } from '../lib/icons.js';
import { bindScroll } from '../lib/scroll.js';

const sub = (...parts) => parts.filter(Boolean).join(' · ');
const period = (start, end) => (start && end ? `${start} to ${end}` : start ? `${start} to now` : end || '');

function section(title, body) {
  return html`<div class="mt-sec"><div class="mt-label">${title}</div>${body}</div>`;
}

// One CV column. best = true marks the skills the advert names and adds the "add only if true" footer.
function cv(d, { best }) {
  const { person, preset, experience, education } = d;
  const skills = best ? d.best_skills : preset.skills.map((name) => ({ name, hit: false }));
  const textOnly = d.match.skills.filter((s) => s.where === 'text');
  const toAdd = d.to_add.filter((s) => s.where === null);
  return html`
    <div class="mt-name">${person.name || 'Your name'}</div>
    <div class="text-muted mt-line">${sub(preset.target_role, person.location, person.email, person.portfolio)}</div>
    ${preset.summary ? section('SUMMARY', html`<div class="pre">${preset.summary}</div>`) : ''}
    ${section('SKILLS', skills.length
      ? html`<div class="mt-skills">${skills.map((s) => html`<span class="mt-skill ${s.hit ? 'hit' : ''}">${s.hit ? '✓ ' : ''}${s.name}</span>`)}</div>`
      : html`<div class="text-muted">No skills in this preset yet.</div>`)}
    ${experience.length ? section('EXPERIENCE', experience.map((e) => html`
      <div class="mt-item"><b>${e.role || e.company}</b> <span class="text-muted">${sub(e.role ? e.company : '', period(e.start_date, e.end_date))}</span>
        ${e.details ? html`<div class="text-muted pre">${e.details}</div>` : ''}</div>`)) : ''}
    ${education.length ? section('EDUCATION', education.map((e) => html`
      <div class="mt-item"><b>${e.qualification || e.school}</b> <span class="text-muted">${sub(e.qualification ? e.school : '', period(e.start_date, e.end_date))}</span></div>`)) : ''}
    ${best ? section('FOR THIS ADVERT', html`
      ${toAdd.length ? html`
        <div class="text-muted mt-note">The advert names these and they are not in your skills. Add them only if they are true for you.</div>
        <div class="mt-skills">${toAdd.map((s) => html`<span class="mt-skill add">+ ${s.name}${s.level === 'nice' ? ' (nice to have)' : ''}</span>`)}</div>`
        : html`<div class="text-muted mt-note">Nothing missing from the skills Shirube recognised.</div>`}
      ${textOnly.length ? html`<div class="text-muted mt-note">In your summary or experience, but not in your skills list: ${textOnly.map((s) => s.name).join(', ')}.</div>` : ''}`) : ''}`;
}

function resultBar(m) {
  const { all, must, nice } = m.counts;
  if (!all.total) {
    return html`<div class="card mt-bar"><b>No skills recognised in this advert</b>
      <span class="text-muted">Shirube knows a fixed list of common tech skills. It may not know the words this advert uses.</span></div>`;
  }
  const shown = m.missing.slice(0, 6);
  const more = m.missing.length - shown.length;
  return html`
    <div class="card mt-bar">
      <b class="mt-big">${all.matched} of ${all.total} skills match</b>
      <span>Asked for ${must.matched} of ${must.total}</span>
      ${nice.total ? html`<span>Nice to have ${nice.matched} of ${nice.total}</span>` : ''}
      ${m.missing.length ? html`<span>Missing: ${shown.join(', ')}${more > 0 ? ` +${more} more` : ''}</span>` : html`<span>Missing: none</span>`}
      <span class="text-muted mt-warn">A match is not an interview chance.</span>
    </div>`;
}

export async function render(el, { params, stale }) {
  const id = Number(params.id);
  let d;
  try {
    d = await api(`/api/jobs/${id}/match`);
  } catch (err) {
    if (stale()) return;
    el.innerHTML = html`
      <a class="link back" href="#/jobs/${id}">← Job details</a>
      <div class="card"><h2>Could not open this job</h2><p class="text-muted">${err.message}</p></div>`;
    return;
  }
  if (stale()) return;
  document.title = `Match · ${d.job.title} · Shirube`;

  const head = html`
    <div class="jd-head">
      <a class="btn btn-secondary icon-btn md back-btn" href="#/jobs/${id}" aria-label="Back to job" title="Back to job">${ICON.back}</a>
      <div class="avatar big" aria-hidden="true">${initials(d.job.company || d.job.title)}</div>
      <div class="jd-title">
        ${d.job.company ? html`<div class="text-muted">${d.job.company}</div>` : ''}
        <h1>${d.job.title}</h1>
      </div>
    </div>`;

  if (!d.job.has_advert) {
    el.innerHTML = html`
      <div class="match-page">${head}
        <div class="card"><h2>No advert text yet</h2>
          <p class="text-muted">Shirube compares the advert text saved with this job. Open the job, choose Edit job and paste the advert into Description first.</p>
          <a class="btn btn-secondary" href="#/jobs/${id}">Back to the job</a></div>
      </div>`;
    return;
  }

  const name = d.preset.name || 'main';
  el.innerHTML = html`
    <div class="match-page">
      ${head}
      ${resultBar(d.match)}
      <div class="mt-grid">
        <div class="card mt-card">
          <h2>My CV</h2>
          <div class="text-muted mt-sub">From your “${name}” preset, as it is</div>
          <div class="scroll-wrap mt-scroll"><div class="scroller">${cv(d, { best: false })}</div><div class="scroll-fade"></div></div>
        </div>
        <div class="card mt-card">
          <h2>Best CV for this job</h2>
          <div class="text-muted mt-sub">Same facts, nothing rewritten. Skills the advert names come first.</div>
          <div class="scroll-wrap mt-scroll"><div class="scroller">${cv(d, { best: true })}</div><div class="scroll-fade"></div></div>
        </div>
      </div>
    </div>`;
  el.querySelectorAll('.scroll-wrap').forEach((w) => bindScroll(w, '.mt-sec'));
}
