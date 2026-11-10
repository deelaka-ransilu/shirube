// Jobs page: list, stage filters, bulk actions, per-row delete, and the Add job form.
import { escapeHtml, getTodayColombo } from '../lib/format.js';
import { renderStageBadge } from '../components/stage-badge.js';
import { loadJobs, sendJson, deleteJob } from '../lib/api.js';

const state = {
  jobs: [],
  counts: {
    all: 0, to_apply: 0, applied: 0, screening: 0, interview: 0,
    offer: 0, rejected: 0, no_reply: 0, skipped: 0, stale: 0,
  },
  sources: ['Other'],
  roleTypes: ['Other'],
  stageFilter: 'all',
  sortChoice: 'closing_date',
  isAdding: false,
  selectedIds: new Set(),
  confirmDeleteId: null,
  bulkConfirmDelete: false,
};

const STAGE_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'to_apply', label: 'To apply' },
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'no_reply', label: 'No reply' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'archived', label: 'Archived' },
];

function buildJobsCountsLine(counts) {
  if (!counts || counts.all === 0) {
    return 'No jobs tracked yet. Click "+ Add job" above to add your first job application.';
  }
  const parts = [`${counts.all} ${counts.all === 1 ? 'job' : 'jobs'}`];
  const stageLabels = [
    { key: 'to_apply', label: 'to apply' },
    { key: 'applied', label: 'applied' },
    { key: 'screening', label: 'screening' },
    { key: 'interview', label: 'interview' },
    { key: 'offer', label: 'offer' },
    { key: 'rejected', label: 'rejected' },
    { key: 'no_reply', label: 'no reply' },
    { key: 'skipped', label: 'skipped' },
  ];
  stageLabels.forEach((s) => {
    const cnt = counts[s.key] || 0;
    if (cnt > 0) parts.push(`${cnt} ${s.label}`);
  });
  return parts.join('   ');
}

async function loadJobsData() {
  const data = await loadJobs(state.stageFilter, state.sortChoice);
  state.jobs = data.jobs || [];
  state.counts = data.counts || {};
  state.sources = data.sources || ['Other'];
  state.roleTypes = data.roleTypes || ['Other'];
}

// Entry point: called by js/main.js for #jobs and #jobs/new.
export async function renderJobs(container, isAdding) {
  state.isAdding = isAdding;
  container.innerHTML = '<p class="muted">Loading jobs...</p>';

  try {
    await loadJobsData();
  } catch (err) {
    container.innerHTML = `<p class="field-error">Error loading jobs: ${escapeHtml(err.message)}</p>`;
    return;
  }

  drawJobsView(container);
  if (state.isAdding) {
    const pasteEl = document.getElementById('job-paste');
    if (pasteEl) pasteEl.focus();
  }
}

function drawJobsView(container) {
  const shell = document.createElement('div');
  shell.className = 'jobs-shell';

  // 1. Top bar: heading, subtitle, and "+ Add job".
  const topBar = document.createElement('header');
  topBar.className = 'jobs-top-bar';

  const headerText = document.createElement('div');
  headerText.className = 'jobs-header-text';

  const h1 = document.createElement('h1');
  h1.className = 'screen-title';
  h1.textContent = 'Jobs';

  const intro = document.createElement('p');
  intro.className = 'profile-intro';
  intro.textContent = 'Track every job application from finding the role to the final outcome.';

  headerText.append(h1, intro);

  const addJobBtn = document.createElement('button');
  addJobBtn.type = 'button';
  addJobBtn.className = 'btn btn-primary';
  addJobBtn.textContent = '+ Add job';
  addJobBtn.addEventListener('click', () => {
    state.isAdding = !state.isAdding;
    drawJobsView(container);
    if (state.isAdding) {
      const pasteEl = document.getElementById('job-paste');
      if (pasteEl) pasteEl.focus();
    }
  });

  topBar.append(headerText, addJobBtn);
  shell.append(topBar);

  // 2. Counts line.
  const countsBox = document.createElement('div');
  countsBox.className = 'jobs-counts';
  countsBox.textContent = buildJobsCountsLine(state.counts);
  shell.append(countsBox);

  // 3. Add job form.
  if (state.isAdding) {
    shell.append(createAddJobForm(container));
  }

  // 4. Stage chips and sort.
  const controlsBar = document.createElement('div');
  controlsBar.className = 'jobs-controls';

  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'stage-chips';
  chipsContainer.setAttribute('role', 'group');
  chipsContainer.setAttribute('aria-label', 'Filter jobs by stage');

  STAGE_CHIPS.forEach((chip) => {
    const chipBtn = document.createElement('button');
    chipBtn.type = 'button';
    chipBtn.className = 'stage-chip';
    const isChosen = state.stageFilter === chip.key;
    chipBtn.setAttribute('aria-pressed', isChosen ? 'true' : 'false');

    const count = state.counts[chip.key] || 0;
    chipBtn.textContent = `${isChosen ? '✓ ' : ''}${chip.label} (${count})`;

    chipBtn.addEventListener('click', async () => {
      if (state.stageFilter !== chip.key) {
        state.stageFilter = chip.key;
        state.selectedIds.clear();
        state.confirmDeleteId = null;
        state.bulkConfirmDelete = false;
        await loadJobsData();
        drawJobsView(container);
      }
    });

    chipsContainer.append(chipBtn);
  });

  const sortGroup = document.createElement('div');
  sortGroup.className = 'sort-group';

  const sortLabel = document.createElement('label');
  sortLabel.className = 'sort-label';
  sortLabel.htmlFor = 'job-sort-select';
  sortLabel.textContent = 'Sort:';

  const sortSelect = document.createElement('select');
  sortSelect.id = 'job-sort-select';
  sortSelect.className = 'sort-select';

  const optClosing = document.createElement('option');
  optClosing.value = 'closing_date';
  optClosing.textContent = 'Closing date';
  if (state.sortChoice === 'closing_date') optClosing.selected = true;

  const optAdded = document.createElement('option');
  optAdded.value = 'date_added';
  optAdded.textContent = 'Date added';
  if (state.sortChoice === 'date_added') optAdded.selected = true;

  sortSelect.append(optClosing, optAdded);

  sortSelect.addEventListener('change', async () => {
    state.sortChoice = sortSelect.value;
    state.selectedIds.clear();
    state.confirmDeleteId = null;
    state.bulkConfirmDelete = false;
    await loadJobsData();
    drawJobsView(container);
  });

  sortGroup.append(sortLabel, sortSelect);
  controlsBar.append(chipsContainer, sortGroup);
  shell.append(controlsBar);

  // 5. Bulk bar, shown when one or more rows are ticked.
  if (state.selectedIds.size > 0) {
    shell.append(createBulkBar(container));
  }

  // 6. Job list or empty state.
  if (state.jobs.length === 0) {
    shell.append(createEmptyState(container));
  } else {
    shell.append(createListHeader(container));

    const list = document.createElement('div');
    list.className = 'jobs-list';
    state.jobs.forEach((job, index) => {
      list.append(createJobRow(job, index, container));
    });
    shell.append(list);
  }

  container.innerHTML = '';
  container.append(shell);
}

function createBulkBar(container) {
  const bulkBar = document.createElement('div');
  bulkBar.className = 'bulk-bar';
  bulkBar.setAttribute('role', 'region');
  bulkBar.setAttribute('aria-label', 'Bulk actions');

  const numSelected = state.selectedIds.size;
  const countSpan = document.createElement('span');
  countSpan.className = 'bulk-count';
  countSpan.textContent = `${numSelected} selected`;

  const bulkActions = document.createElement('div');
  bulkActions.className = 'bulk-actions';

  const bulkError = document.createElement('p');
  bulkError.className = 'field-error';
  bulkError.style.display = 'none';

  if (state.bulkConfirmDelete) {
    const confirmPrompt = document.createElement('span');
    confirmPrompt.className = 'delete-prompt';
    confirmPrompt.textContent = `Delete ${numSelected} jobs? This cannot be undone.`;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-danger';
    confirmBtn.textContent = 'Delete';

    const keepBtn = document.createElement('button');
    keepBtn.type = 'button';
    keepBtn.className = 'btn btn-secondary';
    keepBtn.textContent = 'Keep it';

    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      keepBtn.disabled = true;
      try {
        await sendJson('/api/jobs/bulk-delete', 'POST', { ids: Array.from(state.selectedIds) });
        state.selectedIds.clear();
        state.bulkConfirmDelete = false;
        await loadJobsData();
        drawJobsView(container);
      } catch (err) {
        confirmBtn.disabled = false;
        keepBtn.disabled = false;
        bulkError.textContent = err.message;
        bulkError.style.display = 'block';
      }
    });

    keepBtn.addEventListener('click', () => {
      state.bulkConfirmDelete = false;
      drawJobsView(container);
    });

    bulkActions.append(confirmPrompt, confirmBtn, keepBtn);
  } else {
    const isArchived = state.stageFilter === 'archived';

    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn btn-secondary';
    archiveBtn.textContent = isArchived ? 'Unarchive selected' : 'Archive selected';
    archiveBtn.addEventListener('click', async () => {
      archiveBtn.disabled = true;
      try {
        await sendJson('/api/jobs/bulk-archive', 'POST', {
          ids: Array.from(state.selectedIds),
          archived: !isArchived,
        });
        state.selectedIds.clear();
        await loadJobsData();
        drawJobsView(container);
      } catch (err) {
        archiveBtn.disabled = false;
        bulkError.textContent = err.message;
        bulkError.style.display = 'block';
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.textContent = 'Delete selected';
    deleteBtn.addEventListener('click', () => {
      state.bulkConfirmDelete = true;
      drawJobsView(container);
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-secondary';
    clearBtn.textContent = 'Clear selection';
    clearBtn.addEventListener('click', () => {
      state.selectedIds.clear();
      state.bulkConfirmDelete = false;
      drawJobsView(container);
    });

    bulkActions.append(archiveBtn, deleteBtn, clearBtn);
  }

  bulkBar.append(countSpan, bulkActions, bulkError);
  return bulkBar;
}

function createEmptyState(container) {
  const emptyBox = document.createElement('div');
  emptyBox.className = 'empty-state';

  if (state.stageFilter !== 'all') {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-text';
    emptyMsg.textContent = state.stageFilter === 'archived' ? 'No archived jobs.' : 'No jobs in this stage.';

    const showAllBtn = document.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.className = 'btn btn-secondary';
    showAllBtn.textContent = 'Show all jobs';
    showAllBtn.addEventListener('click', async () => {
      state.stageFilter = 'all';
      state.selectedIds.clear();
      state.confirmDeleteId = null;
      state.bulkConfirmDelete = false;
      await loadJobsData();
      drawJobsView(container);
    });

    emptyBox.append(emptyMsg, showAllBtn);
  } else {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-text';
    emptyMsg.textContent = 'No jobs tracked yet. Add your first job using the button above.';

    const emptyAddBtn = document.createElement('button');
    emptyAddBtn.type = 'button';
    emptyAddBtn.className = 'btn btn-primary';
    emptyAddBtn.textContent = '+ Add job';
    emptyAddBtn.addEventListener('click', () => {
      state.isAdding = true;
      drawJobsView(container);
      const pasteEl = document.getElementById('job-paste');
      if (pasteEl) pasteEl.focus();
    });

    emptyBox.append(emptyMsg, emptyAddBtn);
  }

  return emptyBox;
}

function createListHeader(container) {
  const listHeader = document.createElement('div');
  listHeader.className = 'jobs-list-header';

  const selectAllLabel = document.createElement('label');
  selectAllLabel.className = 'select-all-label';

  const selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.type = 'checkbox';
  selectAllCheckbox.className = 'job-select-checkbox';
  selectAllCheckbox.setAttribute('aria-label', 'Select all visible jobs');

  const visibleIds = state.jobs.map((j) => j.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => state.selectedIds.has(id));

  selectAllCheckbox.checked = allVisibleSelected;
  selectAllCheckbox.indeterminate = !allVisibleSelected && someVisibleSelected;

  selectAllCheckbox.addEventListener('change', () => {
    if (selectAllCheckbox.checked) {
      visibleIds.forEach((id) => state.selectedIds.add(id));
    } else {
      visibleIds.forEach((id) => state.selectedIds.delete(id));
    }
    state.bulkConfirmDelete = false;
    drawJobsView(container);
  });

  const selectAllText = document.createElement('span');
  selectAllText.textContent = 'Select all';

  selectAllLabel.append(selectAllCheckbox, selectAllText);
  listHeader.append(selectAllLabel);
  return listHeader;
}

function createJobRow(job, index, container) {
  const row = document.createElement('div');
  row.className = 'job-row';
  row.id = `job-row-${job.id}`;

  if (state.confirmDeleteId === job.id) {
    row.append(createRowDeleteConfirm(job, container));
    return row;
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'job-select-checkbox';
  checkbox.setAttribute('aria-label', `Select ${job.title}`);
  checkbox.checked = state.selectedIds.has(job.id);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      state.selectedIds.add(job.id);
    } else {
      state.selectedIds.delete(job.id);
    }
    state.bulkConfirmDelete = false;
    drawJobsView(container);
  });

  const left = document.createElement('div');
  left.className = 'job-row-left';

  const idxSpan = document.createElement('span');
  idxSpan.className = 'job-index';
  idxSpan.textContent = `#${index + 1}`;

  const main = document.createElement('div');
  main.className = 'job-main';

  const titleLink = document.createElement('a');
  titleLink.href = `#job/${job.id}`;
  titleLink.className = 'job-title-link';

  const comp = document.createElement('span');
  comp.className = 'job-company';
  comp.textContent = job.company;

  const title = document.createElement('h3');
  title.className = 'job-title';
  title.textContent = job.title;

  titleLink.append(comp, title);
  main.append(titleLink);

  const tags = document.createElement('div');
  tags.className = 'job-tags';

  [job.work_mode, job.level, job.role_type].forEach((text) => {
    if (!text) return;
    const tag = document.createElement('span');
    tag.className = 'meta-chip';
    tag.textContent = text;
    tags.append(tag);
  });

  if (tags.childNodes.length > 0) main.append(tags);

  left.append(idxSpan, main);

  const right = document.createElement('div');
  right.className = 'job-row-right';

  const closingSpan = document.createElement('span');
  closingSpan.className = 'job-closing';
  closingSpan.textContent = job.closing_date ? `Closes ${job.closing_date}` : 'No closing date';

  const stageHolder = document.createElement('div');
  stageHolder.innerHTML = renderStageBadge(job.stage, Boolean(job.is_stale));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger-outline btn-delete';
  deleteBtn.setAttribute('aria-label', `Delete ${job.title}`);
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => {
    state.confirmDeleteId = job.id;
    drawJobsView(container);
  });

  right.append(closingSpan, stageHolder, deleteBtn);
  row.append(checkbox, left, right);
  return row;
}

function createRowDeleteConfirm(job, container) {
  const confirmBox = document.createElement('div');
  confirmBox.className = 'job-delete-confirm';
  confirmBox.setAttribute('role', 'region');
  confirmBox.setAttribute('aria-label', `Confirm delete ${job.title}`);

  const promptP = document.createElement('p');
  promptP.className = 'delete-prompt';
  promptP.textContent = `Delete ${job.company} ${job.title}? This cannot be undone.`;

  const actions = document.createElement('div');
  actions.className = 'delete-actions';

  const confirmDelBtn = document.createElement('button');
  confirmDelBtn.type = 'button';
  confirmDelBtn.className = 'btn btn-danger';
  confirmDelBtn.textContent = 'Delete';

  const keepBtn = document.createElement('button');
  keepBtn.type = 'button';
  keepBtn.className = 'btn btn-secondary';
  keepBtn.textContent = 'Keep it';

  const rowError = document.createElement('p');
  rowError.className = 'field-error';
  rowError.style.display = 'none';

  confirmDelBtn.addEventListener('click', async () => {
    confirmDelBtn.disabled = true;
    keepBtn.disabled = true;
    try {
      await deleteJob(job.id);
      state.confirmDeleteId = null;
      state.selectedIds.delete(job.id);
      await loadJobsData();
      drawJobsView(container);
    } catch (err) {
      confirmDelBtn.disabled = false;
      keepBtn.disabled = false;
      rowError.textContent = err.message;
      rowError.style.display = 'block';
    }
  });

  keepBtn.addEventListener('click', () => {
    state.confirmDeleteId = null;
    drawJobsView(container);
  });

  actions.append(confirmDelBtn, keepBtn);
  confirmBox.append(promptP, actions, rowError);
  return confirmBox;
}

function addFieldTo(parent, labelStr, inputEl, errorId) {
  const group = document.createElement('div');
  group.className = 'form-group';

  const label = document.createElement('label');
  label.className = 'form-label';
  label.htmlFor = inputEl.id;
  label.textContent = labelStr;

  const errorDiv = document.createElement('div');
  errorDiv.className = 'field-error';
  errorDiv.id = errorId;
  errorDiv.style.display = 'none';

  group.append(label, inputEl, errorDiv);
  parent.append(group);
}

function createAddJobForm(container) {
  const panel = document.createElement('div');
  panel.className = 'form-panel';

  const formTitle = document.createElement('h2');
  formTitle.className = 'form-title';
  formTitle.textContent = 'Add job';

  const form = document.createElement('form');
  form.noValidate = true;

  // Paste box first.
  const pasteGroup = document.createElement('div');
  pasteGroup.className = 'form-group';

  const pasteLabel = document.createElement('label');
  pasteLabel.className = 'form-label';
  pasteLabel.htmlFor = 'job-paste';
  pasteLabel.textContent = 'Paste job post text or link';

  const pasteArea = document.createElement('textarea');
  pasteArea.id = 'job-paste';
  pasteArea.className = 'form-textarea';
  pasteArea.placeholder = 'Paste the job description or advert text here...';

  const pasteNote = document.createElement('p');
  pasteNote.className = 'muted';
  pasteNote.textContent = 'Pasting puts the text into the job description. Auto-filling fields from pasted text is coming in a later step.';

  pasteGroup.append(pasteLabel, pasteArea, pasteNote);
  form.append(pasteGroup);

  // Row 1: title and company.
  const row1 = document.createElement('div');
  row1.className = 'form-row';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.id = 'job-title';
  titleInput.className = 'form-input';
  titleInput.placeholder = 'e.g. Frontend Engineer';
  titleInput.required = true;
  addFieldTo(row1, 'Job title *', titleInput, 'job-title-error');

  const compInput = document.createElement('input');
  compInput.type = 'text';
  compInput.id = 'job-company';
  compInput.className = 'form-input';
  compInput.placeholder = 'e.g. Acme Corp';
  compInput.required = true;
  addFieldTo(row1, 'Company *', compInput, 'job-company-error');

  form.append(row1);

  // Row 2: source and role type.
  const row2 = document.createElement('div');
  row2.className = 'form-row';

  const sourceSelect = document.createElement('select');
  sourceSelect.id = 'job-source';
  sourceSelect.className = 'form-select';

  const cleanSources = state.sources.filter((s) => s.toLowerCase() !== 'other');
  cleanSources.push('Other');

  cleanSources.forEach((src) => {
    const opt = document.createElement('option');
    opt.value = src;
    opt.textContent = src;
    if (src === 'Other') opt.selected = true;
    sourceSelect.append(opt);
  });
  addFieldTo(row2, 'Source', sourceSelect, 'job-source-error');

  const roleSelect = document.createElement('select');
  roleSelect.id = 'job-role-type';
  roleSelect.className = 'form-select';

  const roleDefaultOpt = document.createElement('option');
  roleDefaultOpt.value = '';
  roleDefaultOpt.textContent = 'Select role type (optional)';
  roleSelect.append(roleDefaultOpt);

  state.roleTypes.forEach((rt) => {
    const opt = document.createElement('option');
    opt.value = rt;
    opt.textContent = rt;
    roleSelect.append(opt);
  });
  addFieldTo(row2, 'Role type (optional)', roleSelect, 'job-role-error');

  form.append(row2);

  // Row 3: work mode, level, link.
  const row3 = document.createElement('div');
  row3.className = 'form-row';

  const wmSelect = document.createElement('select');
  wmSelect.id = 'job-work-mode';
  wmSelect.className = 'form-select';
  [
    { val: '', lbl: 'Select work mode (optional)' },
    { val: 'Remote', lbl: 'Remote' },
    { val: 'Hybrid', lbl: 'Hybrid' },
    { val: 'On-site', lbl: 'On-site' },
  ].forEach((wm) => {
    const opt = document.createElement('option');
    opt.value = wm.val;
    opt.textContent = wm.lbl;
    wmSelect.append(opt);
  });
  addFieldTo(row3, 'Work mode (optional)', wmSelect, 'job-wm-error');

  const lvlInput = document.createElement('input');
  lvlInput.type = 'text';
  lvlInput.id = 'job-level';
  lvlInput.className = 'form-input';
  lvlInput.placeholder = 'e.g. Junior, Mid, Senior, Lead';
  addFieldTo(row3, 'Level (optional)', lvlInput, 'job-lvl-error');

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.id = 'job-url';
  urlInput.className = 'form-input';
  urlInput.placeholder = 'https://...';
  addFieldTo(row3, 'Job link (optional)', urlInput, 'job-url-error');

  form.append(row3);

  // Row 4: dates.
  const row4 = document.createElement('div');
  row4.className = 'form-row';

  const foundInput = document.createElement('input');
  foundInput.type = 'text';
  foundInput.id = 'job-found-date';
  foundInput.className = 'form-input';
  foundInput.placeholder = 'YYYY-MM-DD';
  foundInput.value = getTodayColombo();
  addFieldTo(row4, 'Date found', foundInput, 'job-found-date-error');

  const postedInput = document.createElement('input');
  postedInput.type = 'text';
  postedInput.id = 'job-posted-date';
  postedInput.className = 'form-input';
  postedInput.placeholder = 'YYYY-MM-DD';
  addFieldTo(row4, 'Posted date (optional)', postedInput, 'job-posted-date-error');

  const closingInput = document.createElement('input');
  closingInput.type = 'text';
  closingInput.id = 'job-closing-date';
  closingInput.className = 'form-input';
  closingInput.placeholder = 'YYYY-MM-DD';
  addFieldTo(row4, 'Closing date (optional)', closingInput, 'job-closing-date-error');

  form.append(row4);

  // Description and notes.
  const descArea = document.createElement('textarea');
  descArea.id = 'job-desc';
  descArea.className = 'form-textarea';
  descArea.placeholder = 'Full job description or notes from the advert...';
  const descGroup = document.createElement('div');
  addFieldTo(form, 'Description (optional)', descArea, 'job-desc-error');

  pasteArea.addEventListener('input', () => {
    descArea.value = pasteArea.value;
  });

  const notesArea = document.createElement('textarea');
  notesArea.id = 'job-notes';
  notesArea.className = 'form-textarea';
  notesArea.placeholder = 'Personal notes, referrals, follow-up ideas...';
  addFieldTo(form, 'Notes (optional)', notesArea, 'job-notes-error');

  const duplicateWarning = document.createElement('div');
  duplicateWarning.className = 'warning-banner';
  duplicateWarning.id = 'job-duplicate-warning';
  duplicateWarning.style.display = 'none';
  duplicateWarning.textContent = 'A job with this company and title already exists in your list.';
  form.append(duplicateWarning);

  function checkDuplicate() {
    const t = titleInput.value.trim().toLowerCase();
    const c = compInput.value.trim().toLowerCase();
    const match = t && c && state.jobs.find(
      (j) => j.title.toLowerCase() === t && j.company.toLowerCase() === c
    );
    duplicateWarning.style.display = match ? 'block' : 'none';
  }

  titleInput.addEventListener('input', checkDuplicate);
  compInput.addEventListener('input', checkDuplicate);

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save job';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    state.isAdding = false;
    drawJobsView(container);
  });

  const saveStatus = document.createElement('span');
  saveStatus.className = 'save-status';
  saveStatus.id = 'job-save-status';
  saveStatus.setAttribute('aria-live', 'polite');

  actions.append(saveBtn, cancelBtn, saveStatus);
  form.append(actions);

  function showFormError(message) {
    const firstErr = form.querySelector('.field-error');
    if (firstErr) {
      firstErr.textContent = message;
      firstErr.style.display = 'block';
    }
  }

  function showFieldError(fieldId, errorId, message) {
    const errEl = document.getElementById(errorId);
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = 'block';
    }
    const inputEl = document.getElementById(fieldId);
    if (inputEl) inputEl.focus();
  }

  function isValidDate(val) {
    if (!val) return true;
    return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(val);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    form.querySelectorAll('.field-error').forEach((el) => {
      el.textContent = '';
      el.style.display = 'none';
    });

    const title = titleInput.value.trim();
    if (!title) {
      showFieldError('job-title', 'job-title-error', 'Job title is required.');
      return;
    }

    const company = compInput.value.trim();
    if (!company) {
      showFieldError('job-company', 'job-company-error', 'Company name is required.');
      return;
    }

    const foundDate = foundInput.value.trim();
    if (!isValidDate(foundDate)) {
      showFieldError('job-found-date', 'job-found-date-error', 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).');
      return;
    }

    const postedDate = postedInput.value.trim();
    if (!isValidDate(postedDate)) {
      showFieldError('job-posted-date', 'job-posted-date-error', 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).');
      return;
    }

    const closingDate = closingInput.value.trim();
    if (!isValidDate(closingDate)) {
      showFieldError('job-closing-date', 'job-closing-date-error', 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).');
      return;
    }

    const urlVal = urlInput.value.trim();
    if (urlVal && !urlVal.startsWith('http://') && !urlVal.startsWith('https://')) {
      showFieldError('job-url', 'job-url-error', 'Job link must start with http:// or https://.');
      return;
    }

    const payload = {
      title,
      company,
      source: sourceSelect.value,
      role_type: roleSelect.value || null,
      work_mode: wmSelect.value || null,
      level: lvlInput.value.trim() || null,
      url: urlVal || null,
      found_date: foundDate || getTodayColombo(),
      posted_date: postedDate || null,
      closing_date: closingDate || null,
      description: descArea.value.trim() || null,
      notes: notesArea.value.trim() || null,
    };

    saveBtn.disabled = true;
    try {
      const data = await sendJson('/api/jobs', 'POST', payload);
      saveStatus.textContent = 'Saved';
      setTimeout(() => {
        state.isAdding = false;
        location.hash = `#job/${data.id}`;
      }, 1000);
    } catch (err) {
      saveBtn.disabled = false;
      saveStatus.textContent = '';
      showFormError(err.message || 'An error occurred while saving.');
    }
  });

  panel.append(formTitle, form);
  return panel;
}
