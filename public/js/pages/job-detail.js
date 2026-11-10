// Job detail page: header, timeline, status buttons, Details or Edit form, Notes.
import { escapeHtml, getTodayColombo, formatMonthDay, yearOf } from '../lib/format.js';
import { renderStageBadge } from '../components/stage-badge.js';
import { getJob, loadJobs, sendJson } from '../lib/api.js';
import { JOB_TYPES } from '../lib/job-options.js';

const OUTCOMES = [
  { key: 'applied', label: 'Applied', stage: 'applied' },
  { key: 'reply', label: 'Reply', stage: 'screening' },
  { key: 'interview', label: 'Interview', stage: 'interview' },
  { key: 'offer', label: 'Offer', stage: 'offer' },
  { key: 'rejected', label: 'Rejected', stage: 'rejected' },
  { key: 'no_reply', label: 'No reply', stage: 'no_reply' },
];

const KIND_LABELS = {
  replied: 'Reply received (screening)',
  first_interview: 'First interview',
  second_interview: 'Second interview',
  test_task: 'Test task',
  offer: 'Offer received',
  rejected: 'Rejected',
};

const DEFAULT_REASONS = ['No reply to CV', 'Skills gap', 'Salary', 'Role filled', 'Other'];
const FALLBACK_SOURCES = ['LinkedIn', 'TopJobs', 'Roar', 'Company site', 'Direct email', 'Referral', 'Other'];
const FALLBACK_ROLE_TYPES = ['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'DevOps / Cloud', 'QA / Test Engineer', 'Product / Design', 'Other'];
const WORK_MODES = [
  { val: '', lbl: 'Select work mode (optional)' },
  { val: 'Remote', lbl: 'Remote' },
  { val: 'Hybrid', lbl: 'Hybrid' },
  { val: 'On-site', lbl: 'On-site' },
];
const DATE_MESSAGE = 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).';

// Lists used by the edit form and its duplicate check.
const lists = { sources: [], roleTypes: [], jobs: [] };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isValidDate(val) {
  if (!val) return true;
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(val);
}

async function ensureLists() {
  try {
    const data = await loadJobs('all', 'closing_date');
    lists.sources = data.sources || [];
    lists.roleTypes = data.roleTypes || [];
    lists.jobs = data.jobs || [];
  } catch (_) {
    // The form falls back to built-in lists.
  }
}

// Entry point: called by js/main.js for #job/<id>.
export async function renderJobPage(container, jobId) {
  container.innerHTML = '<p class="muted">Loading job details...</p>';

  let job;
  try {
    job = await getJob(jobId);
  } catch (err) {
    container.innerHTML = `
      <div class="job-detail-card">
        <h1 class="screen-title">Job not found</h1>
        <p class="muted">The requested job could not be found.</p>
        <p><a href="#jobs" class="back-link">← Back to jobs</a></p>
      </div>`;
    return;
  }

  document.title = `${job.title} | Shirube`;
  await ensureLists();
  draw({ container, job, isEditing: false, message: '', error: '' });
}

// Page state is one object. Every change calls draw() so the screen reads the latest job.
function draw(page) {
  page.container.innerHTML = '';
  const shell = el('div', 'job-page-shell');
  shell.append(buildHeader(page), buildActivityCard(page), buildBottomRow(page));
  page.container.append(shell);
}

function showMessage(page, text) {
  page.message = text;
  draw(page);
  setTimeout(() => {
    if (page.message === text) {
      page.message = '';
      draw(page);
    }
  }, 3000);
}

function buildHeader(page) {
  const { job } = page;
  const header = el('header', 'job-page-header');

  const left = el('div', 'job-header-left');
  left.append(el('h1', 'screen-title', job.title));
  const meta = el('div', 'job-page-meta');
  meta.innerHTML = `<span class="job-page-company">${escapeHtml(job.company)}</span> &nbsp;·&nbsp; ${renderStageBadge(job.stage, Boolean(job.is_stale))}`;
  left.append(meta);

  const actions = el('div', 'job-header-actions');

  const editBtn = el('button', 'btn btn-secondary', page.isEditing ? 'Close edit form' : 'Edit job');
  editBtn.type = 'button';
  editBtn.id = 'btn-edit-job';
  editBtn.addEventListener('click', () => {
    page.isEditing = !page.isEditing;
    page.error = '';
    draw(page);
  });

  const isArchived = Boolean(job.archived_at);
  const archiveBtn = el('button', 'btn btn-secondary', isArchived ? 'Unarchive' : 'Archive');
  archiveBtn.type = 'button';
  archiveBtn.id = 'btn-archive-job';
  archiveBtn.addEventListener('click', async () => {
    page.error = '';
    try {
      page.job = await sendJson(`/api/jobs/${job.id}/archive`, 'POST', { archived: !isArchived });
      document.title = `${page.job.title} | Shirube`;
      showMessage(page, 'Saved');
    } catch (err) {
      page.error = err.message;
      draw(page);
    }
  });

  actions.append(editBtn, archiveBtn);
  header.append(left, actions);
  return header;
}

function buildActivityCard(page) {
  const card = el('section', 'job-page-card job-card-activity');
  card.setAttribute('aria-labelledby', 'heading-timeline');
  card.append(buildTimeline(page.job), buildStatusSection(page));
  return card;
}

// ---------- Timeline ----------

function buildEvents(job) {
  const events = [];

  if (job.found_date) {
    events.push({ date: job.found_date, text: `Job found (${job.source || 'Other'})` });
  }
  if (job.application?.applied_date) {
    events.push({ date: job.application.applied_date, text: 'Application submitted' });
  }
  if (Array.isArray(job.replies)) {
    job.replies.forEach((r) => {
      let text = KIND_LABELS[r.kind] || r.kind;
      if (r.kind === 'rejected' && job.application?.rejection_reason) {
        text = `Rejected: ${job.application.rejection_reason}`;
      }
      if (r.note) text += ` (${r.note})`;
      events.push({ date: r.happened_on, text });
    });
  }
  if (job.application?.status === 'no_reply' && (!job.replies || job.replies.length === 0)) {
    events.push({ date: job.application.applied_date || job.found_date, text: 'Marked as no reply' });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function buildTimeline(job) {
  const section = el('div', 'timeline-section');

  const header = el('div', 'timeline-header');
  const label = el('h2', 'timeline-label', 'Timeline');
  label.id = 'heading-timeline';
  header.append(label);

  const scroll = el('div', 'timeline-scroll-box');
  scroll.setAttribute('tabindex', '0');
  scroll.setAttribute('aria-label', 'Timeline events');

  const events = buildEvents(job);
  if (events.length === 0) {
    scroll.append(el('p', 'muted', 'No events recorded yet.'));
  } else {
    scroll.append(buildTrack(events));
  }

  section.append(header, scroll);
  return section;
}

function buildTrack(events) {
  const n = events.length;
  const track = el('div', 'timeline-track');
  if (n > 6) track.style.minWidth = `calc(var(--space-7) * 3 * ${n - 1})`;
  if (n > 1) track.append(el('div', 'timeline-line'));

  events.forEach((ev, i) => {
    const node = el('div', 'timeline-node');
    if (n === 1 || i === 0) {
      node.style.left = '0';
      node.classList.add('is-first');
    } else if (i === n - 1) {
      node.style.left = '100%';
      node.classList.add('is-last');
    } else {
      node.style.left = `${(i / (n - 1)) * 100}%`;
      node.classList.add('is-middle');
    }

    const dateEl = el('div', 'timeline-node-date');
    dateEl.append(el('span', 'timeline-date-text', formatMonthDay(ev.date)));
    if (i === n - 1) {
      dateEl.append(document.createTextNode(' '), el('span', 'timeline-year', yearOf(ev.date)));
    }

    node.append(dateEl, el('div', 'timeline-dot'), el('div', 'timeline-node-label', ev.text));
    track.append(node);
  });

  return track;
}

// ---------- Status buttons ----------

function buildStatusSection(page) {
  const { job } = page;
  const section = el('div', 'status-section');

  const row = el('div', 'status-buttons-row');
  OUTCOMES.forEach((o) => {
    const isActive = job.stage === o.stage;
    const btn = el('button', 'outcome-btn', isActive ? `✓ ${o.label}` : o.label);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (isActive) return;
      const payload = { outcome: o.key };
      if (o.key === 'rejected') {
        const select = document.getElementById('job-rejection-reason');
        payload.rejection_reason = select ? select.value : (job.application?.rejection_reason || 'Other');
      }
      postOutcome(page, payload);
    });
    row.append(btn);
  });

  section.append(row, buildRejectionBox(page));

  const feedback = el('div', 'outcome-feedback-box');
  if (page.message) feedback.append(el('span', 'save-status', page.message));
  if (page.error) feedback.append(el('div', 'field-error', page.error));
  section.append(feedback);

  return section;
}

async function postOutcome(page, payload) {
  page.error = '';
  try {
    page.job = await sendJson(`/api/jobs/${page.job.id}/outcome`, 'POST', payload);
    document.title = `${page.job.title} | Shirube`;
    showMessage(page, 'Saved');
  } catch (err) {
    page.error = err.message;
    draw(page);
  }
}

function buildRejectionBox(page) {
  const { job } = page;
  const box = el('div', 'rejection-reason-box');
  box.id = 'rejection-reason-box';
  box.style.display = job.stage === 'rejected' ? 'flex' : 'none';

  const label = el('label', 'form-label', 'Rejection reason');
  label.htmlFor = 'job-rejection-reason';

  const select = el('select', 'form-select');
  select.id = 'job-rejection-reason';

  const active = job.application?.rejection_reason || 'Other';
  const reasons = (job.rejection_reasons || DEFAULT_REASONS).slice();
  if (!reasons.includes(active)) {
    const at = reasons.indexOf('Other');
    if (at === -1) reasons.push(active);
    else reasons.splice(at, 0, active);
  }
  reasons.forEach((reason) => {
    const opt = el('option', '', reason);
    opt.value = reason;
    if (reason === active) opt.selected = true;
    select.append(opt);
  });

  select.addEventListener('change', () => {
    postOutcome(page, { outcome: 'rejected', rejection_reason: select.value });
  });

  box.append(label, select);
  return box;
}

// ---------- Bottom row: Details or Edit form, then Notes ----------

function buildBottomRow(page) {
  const row = el('div', 'job-bottom-row');
  row.append(page.isEditing ? buildEditPanel(page) : buildDetails(page.job), buildNotes(page.job));
  return row;
}

function detailItem(label, value, isLink = false, emptyText = 'Not added yet') {
  const item = el('div', 'detail-item');
  item.append(el('span', 'detail-label', label));

  const val = el('span', 'detail-value');
  if (!value) {
    val.classList.add('is-empty');
    val.textContent = emptyText;
  } else if (isLink) {
    const a = el('a', 'link', value);
    a.href = value;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    val.append(a);
  } else {
    val.textContent = value;
  }

  item.append(val);
  return item;
}

function followUpEmptyText(job) {
  if (job.due_date) return 'Not added yet';
  if (!job.application) return 'Not applied yet';
  if (['offer', 'interview', 'rejected', 'no_reply'].includes(job.application.status)) return 'Not needed';
  return 'Not added yet';
}

function buildDetails(job) {
  const card = el('section', 'job-page-card job-card-details');
  card.setAttribute('aria-labelledby', 'heading-details');

  const heading = el('h2', 'card-heading', 'Details');
  heading.id = 'heading-details';

  const grid = el('div', 'details-grid');
  grid.append(
    detailItem('Source', job.source),
    detailItem('Role type', job.role_type),
    detailItem('Job type', job.job_type),
    detailItem('Work mode', job.work_mode),
    detailItem('Location', job.location),
    detailItem('Level', job.level),
    detailItem('Date found', job.found_date),
    detailItem('Applied date', job.application?.applied_date),
    detailItem('Posted date', job.posted_date),
    detailItem('Closing date', job.closing_date),
    detailItem('Follow-up due date', job.due_date, false, followUpEmptyText(job)),
    detailItem('Job link', job.url, true)
  );

  card.append(heading, grid);
  return card;
}

function buildNotes(job) {
  const card = el('section', 'job-page-card job-card-notes');
  card.setAttribute('aria-labelledby', 'heading-notes');

  const heading = el('h2', 'card-heading', 'Notes');
  heading.id = 'heading-notes';

  const notes = el('textarea', 'form-textarea');
  notes.id = 'job-view-notes';
  notes.rows = 3;
  notes.readOnly = true;
  notes.placeholder = 'Not added yet';
  notes.value = job.notes || '';
  notes.setAttribute('aria-label', 'Notes');

  const toggle = document.createElement('details');
  toggle.className = 'job-card-description';

  const summary = el('summary', 'card-heading description-toggle', 'Show description');

  const descWrap = el('div', 'form-group description-content');
  const desc = el('textarea', 'form-textarea');
  desc.id = 'job-view-desc';
  desc.rows = 6;
  desc.readOnly = true;
  desc.placeholder = 'Not added yet';
  desc.value = job.description || '';
  desc.setAttribute('aria-label', 'Description');
  descWrap.append(desc);

  toggle.append(summary, descWrap);
  card.append(heading, notes, toggle);
  return card;
}

// ---------- Edit form ----------

function makeInput(type, id, value, placeholder) {
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.className = 'form-input';
  input.value = value || '';
  input.placeholder = placeholder || '';
  return input;
}

function makeTextarea(id, value, placeholder) {
  const area = el('textarea', 'form-textarea');
  area.id = id;
  area.rows = 3;
  area.value = value || '';
  area.placeholder = placeholder || '';
  return area;
}

function makeSelect(id, options, selectedValue) {
  const select = el('select', 'form-select');
  select.id = id;
  options.forEach(({ val, lbl }) => {
    const opt = el('option', '', lbl);
    opt.value = val;
    if (val === (selectedValue || '')) opt.selected = true;
    select.append(opt);
  });
  return select;
}

function field(labelText, input, errorId) {
  const group = el('div', 'form-group');
  const label = el('label', 'form-label', labelText);
  label.htmlFor = input.id;
  const err = el('div', 'field-error');
  err.id = errorId;
  err.style.display = 'none';
  group.append(label, input, err);
  return group;
}

function formRow(...children) {
  const row = el('div', 'form-row');
  row.append(...children);
  return row;
}

function buildEditPanel(page) {
  const { job } = page;
  const panel = el('section', 'job-page-card');
  panel.id = 'edit-job-panel';
  panel.setAttribute('aria-labelledby', 'edit-job-title');

  const headerRow = el('div', 'card-header-row');
  const heading = el('h2', 'card-heading', 'Edit job');
  heading.id = 'edit-job-title';
  const closeBtn = el('button', 'btn btn-secondary', 'Close edit form');
  closeBtn.type = 'button';
  closeBtn.id = 'btn-close-edit';
  closeBtn.addEventListener('click', () => {
    page.isEditing = false;
    draw(page);
  });
  headerRow.append(heading, closeBtn);

  const form = el('form', 'job-form');
  form.noValidate = true;

  const titleInput = makeInput('text', 'edit-job-title-input', job.title, 'e.g. Frontend Engineer');
  const compInput = makeInput('text', 'edit-job-company-input', job.company, 'e.g. Acme Corp');

  const sourceList = (lists.sources.length ? lists.sources : FALLBACK_SOURCES).filter((s) => s.toLowerCase() !== 'other');
  if (job.source && job.source.toLowerCase() !== 'other' && !sourceList.includes(job.source)) sourceList.push(job.source);
  sourceList.push('Other');
  const sourceSelect = makeSelect(
    'edit-job-source',
    sourceList.map((s) => ({ val: s, lbl: s })),
    job.source || 'Other'
  );

  const roleList = (lists.roleTypes.length ? lists.roleTypes : FALLBACK_ROLE_TYPES).slice();
  if (job.role_type && !roleList.includes(job.role_type)) {
    const at = roleList.indexOf('Other');
    if (at === -1) roleList.push(job.role_type);
    else roleList.splice(at, 0, job.role_type);
  }
  const roleSelect = makeSelect(
    'edit-job-role-type',
    [{ val: '', lbl: 'Select role type (optional)' }, ...roleList.map((r) => ({ val: r, lbl: r }))],
    job.role_type || ''
  );

  const wmSelect = makeSelect('edit-job-work-mode', WORK_MODES, job.work_mode || '');
  const jtSelect = makeSelect(
    'edit-job-type',
    [{ val: '', lbl: 'Select job type (optional)' }, ...JOB_TYPES.map((t) => ({ val: t, lbl: t }))],
    job.job_type || ''
  );
  const lvlInput = makeInput('text', 'edit-job-level', job.level, 'e.g. Junior, Mid, Senior, Lead');
  const urlInput = makeInput('url', 'edit-job-url', job.url, 'https://...');
  const foundInput = makeInput('text', 'edit-job-found-date', job.found_date || getTodayColombo(), 'YYYY-MM-DD');
  const postedInput = makeInput('text', 'edit-job-posted-date', job.posted_date, 'YYYY-MM-DD');
  const closingInput = makeInput('text', 'edit-job-closing-date', job.closing_date, 'YYYY-MM-DD');
  const descArea = makeTextarea('edit-job-desc', job.description, 'Full job description or notes from the advert...');
  const notesArea = makeTextarea('edit-job-notes', job.notes, 'Personal notes, referrals, follow-up ideas...');

  const dupBanner = el('div', 'warning-banner', 'A job with this company and title already exists in your list.');
  dupBanner.id = 'edit-job-duplicate-warning';
  dupBanner.style.display = 'none';

  const checkDuplicate = () => {
    const t = titleInput.value.trim().toLowerCase();
    const c = compInput.value.trim().toLowerCase();
    const match = t && c && lists.jobs.find(
      (j) => j.id !== job.id && j.title.toLowerCase() === t && j.company.toLowerCase() === c
    );
    dupBanner.style.display = match ? 'block' : 'none';
  };
  titleInput.addEventListener('input', checkDuplicate);
  compInput.addEventListener('input', checkDuplicate);

  const saveBtn = el('button', 'btn btn-primary', 'Save job');
  saveBtn.type = 'submit';
  const cancelBtn = el('button', 'btn btn-secondary', 'Cancel');
  cancelBtn.type = 'button';
  cancelBtn.addEventListener('click', () => {
    page.isEditing = false;
    draw(page);
  });
  const saveStatus = el('span', 'save-status');
  saveStatus.setAttribute('aria-live', 'polite');

  const actions = el('div', 'form-actions');
  actions.append(saveBtn, cancelBtn, saveStatus);

  const formError = el('div', 'field-error');
  formError.style.display = 'none';

  form.append(
    formRow(field('Job title *', titleInput, 'edit-job-title-error'), field('Company *', compInput, 'edit-job-company-error')),
    formRow(
      field('Source', sourceSelect, 'edit-job-source-error'),
      field('Role type (optional)', roleSelect, 'edit-job-role-error'),
      field('Job type (optional)', jtSelect, 'edit-job-jt-error')
    ),
    formRow(
      field('Work mode (optional)', wmSelect, 'edit-job-wm-error'),
      field('Level (optional)', lvlInput, 'edit-job-lvl-error'),
      field('Job link (optional)', urlInput, 'edit-job-url-error')
    ),
    formRow(
      field('Date found', foundInput, 'edit-job-found-date-error'),
      field('Posted date (optional)', postedInput, 'edit-job-posted-date-error'),
      field('Closing date (optional)', closingInput, 'edit-job-closing-date-error')
    ),
    field('Description (optional)', descArea, 'edit-job-desc-error'),
    field('Notes (optional)', notesArea, 'edit-job-notes-error'),
    dupBanner,
    actions,
    formError
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('.field-error').forEach((n) => {
      n.textContent = '';
      n.style.display = 'none';
    });

    const fail = (inputEl, errorId, message) => {
      const err = document.getElementById(errorId);
      if (err) {
        err.textContent = message;
        err.style.display = 'block';
      }
      inputEl.focus();
    };

    const title = titleInput.value.trim();
    if (!title) return fail(titleInput, 'edit-job-title-error', 'Job title is required.');

    const company = compInput.value.trim();
    if (!company) return fail(compInput, 'edit-job-company-error', 'Company name is required.');

    const found = foundInput.value.trim();
    if (!isValidDate(found)) return fail(foundInput, 'edit-job-found-date-error', DATE_MESSAGE);

    const posted = postedInput.value.trim();
    if (!isValidDate(posted)) return fail(postedInput, 'edit-job-posted-date-error', DATE_MESSAGE);

    const closing = closingInput.value.trim();
    if (!isValidDate(closing)) return fail(closingInput, 'edit-job-closing-date-error', DATE_MESSAGE);

    const url = urlInput.value.trim();
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      return fail(urlInput, 'edit-job-url-error', 'Job link must start with http:// or https://.');
    }

    const payload = {
      title,
      company,
      source: sourceSelect.value,
      role_type: roleSelect.value || null,
      work_mode: wmSelect.value || null,
      job_type: jtSelect.value || null,
      level: lvlInput.value.trim() || null,
      url: url || null,
      found_date: found || getTodayColombo(),
      posted_date: posted || null,
      closing_date: closing || null,
      description: descArea.value.trim() || null,
      notes: notesArea.value.trim() || null,
    };

    saveBtn.disabled = true;
    formError.style.display = 'none';
    try {
      const data = await sendJson(`/api/jobs/${job.id}`, 'PUT', payload);
      saveStatus.textContent = 'Saved';
      setTimeout(() => {
        page.job = data;
        page.isEditing = false;
        document.title = `${data.title} | Shirube`;
        draw(page);
      }, 700);
    } catch (err) {
      saveBtn.disabled = false;
      saveStatus.textContent = '';
      formError.textContent = err.message || 'Failed to update job.';
      formError.style.display = 'block';
    }
  });

  panel.append(headerRow, form);
  return panel;
}
