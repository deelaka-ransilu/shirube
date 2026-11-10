// Follow-ups page: overdue and coming-up applications.
import { escapeHtml } from '../lib/format.js';
import { renderStageBadge } from '../components/stage-badge.js';

async function loadFollowups() {
  const res = await fetch('/api/followups');
  if (!res.ok) throw new Error('Could not load follow-ups.');
  return res.json();
}

// Entry point: called by js/main.js for #followups.
export async function renderFollowups(container) {
  container.innerHTML = '<p class="muted">Loading follow-ups...</p>';

  try {
    const data = await loadFollowups();
    draw(container, data);
  } catch (err) {
    container.innerHTML = `<p class="field-error">Error loading follow-ups: ${escapeHtml(err.message)}</p>`;
  }
}

function createFollowupRow(job, isOverdue) {
  const row = document.createElement('article');
  row.className = 'job-row follow-up-row';

  const left = document.createElement('div');
  left.className = 'job-row-left';

  const main = document.createElement('div');
  main.className = 'job-main';

  const company = document.createElement('span');
  company.className = 'job-company';
  company.textContent = job.company;

  const titleLink = document.createElement('a');
  titleLink.href = `#job/${job.job_id}`;
  titleLink.className = 'job-title-link';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'job-title';
  titleSpan.textContent = job.title;
  titleLink.append(titleSpan);

  main.append(company, titleLink);
  left.append(main);

  const right = document.createElement('div');
  right.className = 'job-row-right';

  const dueSpan = document.createElement('span');
  dueSpan.className = `follow-up-due ${isOverdue ? 'is-overdue' : ''}`;
  dueSpan.innerHTML = `<span class="due-label">${isOverdue ? 'Overdue:' : 'Due:'}</span> <span class="due-date">${escapeHtml(job.due_date)}</span>`;

  const stageSpan = document.createElement('span');
  stageSpan.innerHTML = renderStageBadge(job.application_status);

  const actionLink = document.createElement('a');
  actionLink.href = `#job/${job.job_id}`;
  actionLink.className = 'btn btn-secondary link-to-job';
  actionLink.textContent = 'View job →';

  right.append(dueSpan, stageSpan, actionLink);
  row.append(left, right);
  return row;
}

function createSection(id, heading, count, emptyText, jobs, isOverdue) {
  const section = document.createElement('section');
  section.className = 'followups-section';
  section.setAttribute('aria-labelledby', id);

  const h2 = document.createElement('h2');
  h2.id = id;
  h2.className = 'card-heading';
  h2.textContent = `${heading} (${count})`;
  section.append(h2);

  if (jobs.length === 0) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = emptyText;
    section.append(note);
  } else {
    const list = document.createElement('div');
    list.className = 'jobs-list';
    jobs.forEach((job) => list.append(createFollowupRow(job, isOverdue)));
    section.append(list);
  }

  return section;
}

function draw(container, data) {
  const coming = data.coming_up || [];
  const overdue = data.overdue || [];

  container.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'followups-shell';

  const header = document.createElement('header');
  const h1 = document.createElement('h1');
  h1.className = 'screen-title';
  h1.textContent = 'Follow-ups';

  const intro = document.createElement('p');
  intro.className = 'profile-intro';
  intro.textContent = 'Track upcoming and overdue follow-ups for your active job applications.';

  header.append(h1, intro);
  shell.append(header);

  if (coming.length === 0 && overdue.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const emptyText = document.createElement('p');
    emptyText.className = 'empty-text';
    emptyText.textContent = 'No follow-ups due. Add a job or apply to one.';

    const addBtn = document.createElement('a');
    addBtn.href = '#jobs/new';
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ Add job';

    emptyState.append(emptyText, addBtn);
    shell.append(emptyState);
  } else {
    const sections = document.createElement('div');
    sections.className = 'followups-sections';
    sections.append(
      createSection('heading-overdue', 'Overdue', overdue.length, 'No overdue follow-ups.', overdue, true),
      createSection('heading-coming-up', 'Coming up', coming.length, 'No follow-ups due in the next 7 days.', coming, false)
    );
    shell.append(sections);
  }

  container.append(shell);
}
