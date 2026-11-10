// My profile page: progress, tabs, cards, and add/edit forms for skills, experience, and education.
import { escapeHtml } from '../lib/format.js';

const LEVEL_LABELS = ['Aware', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
const LEVEL_MEANINGS = [
  'Aware: you know what this is and can follow along in discussions.',
  'Beginner: you can complete basic tasks using tutorials or guidance.',
  'Intermediate: you work independently and solve common problems.',
  'Advanced: you understand best practices, solve complex problems, and guide others.',
  'Expert: you have deep mastery, architect solutions, and handle edge cases.',
];
const DATE_FORMAT = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

const state = {
  skills: [],
  experiences: [],
  education: [],
  activeTab: 'skills',
  isAdding: false,
  editingItem: null,
  confirmDeleteId: null,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function loadProfileData() {
  const res = await fetch('/api/profile');
  if (!res.ok) throw new Error('Could not load profile data');
  const data = await res.json();
  state.skills = data.skills || [];
  state.experiences = data.experiences || [];
  state.education = data.education || [];
}

// Entry point: called by js/main.js for #profile.
export async function renderProfile(container) {
  container.innerHTML = '<p class="muted">Loading profile...</p>';
  try {
    await loadProfileData();
  } catch (err) {
    container.innerHTML = `<p class="field-error">Error loading profile: ${escapeHtml(err.message)}</p>`;
    return;
  }
  draw(container);
}

function refresh(container) {
  loadProfileData()
    .then(() => draw(container))
    .catch((err) => {
      container.innerHTML = `<p class="field-error">Error loading profile: ${escapeHtml(err.message)}</p>`;
    });
}

function resetPanel() {
  state.isAdding = false;
  state.editingItem = null;
  state.confirmDeleteId = null;
}

function nextStepText() {
  const { skills, experiences, education } = state;
  if (skills.length === 0) return 'Still to do: add at least one skill to use Shirube.';
  if (experiences.length === 0) return 'Next: add an experience or volunteering entry to build your history.';
  if (education.length === 0) return 'Next: add your education or qualifications.';
  if (skills.find((s) => !s.proof_url && !s.used_at_experience)) return 'Next: add a proof link to verify a skill.';
  return 'Profile complete: all your skills, experience, and education are up to date.';
}

function draw(container) {
  const { skills, experiences, education, activeTab } = state;

  const shell = el('div', 'profile-shell');

  const header = el('header');
  header.append(
    el('h1', 'screen-title', 'My profile'),
    el('p', 'profile-intro', 'Keep your skills, experience, and education up to date so Shirube can match them against jobs.')
  );

  const progress = el('section', 'profile-progress');
  progress.setAttribute('aria-label', 'Profile completion progress');
  progress.append(
    el('div', 'progress-counts', `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}   ${experiences.length} ${experiences.length === 1 ? 'experience' : 'experiences'}   ${education.length} education`),
    el('div', 'progress-next', nextStepText())
  );

  shell.append(header, progress, buildTabs(container), buildPanel(container, activeTab));
  container.innerHTML = '';
  container.append(shell);
}

function buildTabs(container) {
  const { skills, experiences, education, activeTab } = state;
  const tabList = el('div', 'tab-list');
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Profile sections');

  const tabs = [
    { key: 'skills', label: `Skills (${skills.length})` },
    { key: 'experiences', label: `Experience and volunteering (${experiences.length})` },
    { key: 'education', label: `Education (${education.length})` },
  ];

  tabs.forEach((tab, index) => {
    const btn = el('button', 'tab-btn', tab.label);
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.id = `tab-${tab.key}`;
    btn.setAttribute('aria-controls', `panel-${tab.key}`);
    const selected = activeTab === tab.key;
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    btn.setAttribute('tabindex', selected ? '0' : '-1');

    btn.addEventListener('click', () => {
      if (state.activeTab !== tab.key) {
        state.activeTab = tab.key;
        resetPanel();
        draw(container);
      }
    });

    btn.addEventListener('keydown', (e) => {
      const all = Array.from(tabList.querySelectorAll('[role="tab"]'));
      let next = index;
      if (e.key === 'ArrowRight') next = (index + 1) % all.length;
      else if (e.key === 'ArrowLeft') next = (index - 1 + all.length) % all.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = all.length - 1;
      else return;
      e.preventDefault();
      all[next].focus();
      all[next].click();
    });

    tabList.append(btn);
  });

  return tabList;
}

function buildPanel(container, activeTab) {
  const panel = el('section', 'tab-panel');
  panel.id = `panel-${activeTab}`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `tab-${activeTab}`);

  const header = el('div', 'tab-header');
  const text = el('div', 'tab-header-text');
  const title = el('h2', 'tab-title');
  const desc = el('p', 'tab-desc');
  const addBtn = el('button', 'btn btn-primary tab-header-btn');
  addBtn.type = 'button';

  if (activeTab === 'skills') {
    title.textContent = 'Skills';
    desc.textContent = 'List what you know and how well you know it, so Shirube can match them against jobs.';
    addBtn.textContent = '+ Add skill';
  } else if (activeTab === 'experiences') {
    title.textContent = 'Experience and volunteering';
    desc.textContent = 'Record your past and current roles to track where your skills were built.';
    addBtn.textContent = '+ Add experience';
  } else {
    title.textContent = 'Education';
    desc.textContent = 'Add your degrees, diplomas, courses, or certificates.';
    addBtn.textContent = '+ Add education';
  }

  addBtn.addEventListener('click', () => {
    state.isAdding = true;
    state.editingItem = null;
    state.confirmDeleteId = null;
    draw(container);
  });

  text.append(title, desc);
  header.append(text, addBtn);
  panel.append(header);

  if (state.isAdding || state.editingItem) {
    panel.append(buildForm(activeTab, state.editingItem, container));
  }

  const items = state[activeTab];
  if (items.length === 0) {
    panel.append(buildEmpty(activeTab, addBtn.textContent, container));
  } else {
    const list = el('div', 'cards-list');
    items.forEach((item) => list.append(buildCard(activeTab, item, container)));
    panel.append(list);
  }

  return panel;
}

function buildEmpty(activeTab, actionLabel, container) {
  const box = el('div', 'empty-state');
  let text;
  if (activeTab === 'skills') {
    text = 'No skills added yet. Add at least one skill to start building your profile.';
  } else if (activeTab === 'experiences') {
    text = 'No experience added yet. Add your past jobs or volunteering to link your skills to real projects.';
  } else {
    text = 'No education added yet. Add your courses or degrees to complete your profile.';
  }

  const btn = el('button', 'btn btn-primary', actionLabel);
  btn.type = 'button';
  btn.addEventListener('click', () => {
    state.isAdding = true;
    state.editingItem = null;
    state.confirmDeleteId = null;
    draw(container);
  });

  box.append(el('p', 'empty-text', text), btn);
  return box;
}

// ---------- Cards ----------

function buildCard(tabKey, item, container) {
  const card = el('article', 'card');
  card.id = `card-${tabKey}-${item.id}`;

  const main = el('div', 'card-main');

  if (tabKey === 'skills') {
    main.append(el('h3', 'card-title', item.name), buildSkillMeta(item));
  } else if (tabKey === 'experiences') {
    main.append(el('h3', 'card-title', item.title), buildExperienceMeta(item));
    if (item.description) main.append(el('p', 'card-desc', item.description));
  } else {
    main.append(el('h3', 'card-title', item.course), buildEducationMeta(item));
  }

  card.append(main);

  if (state.confirmDeleteId === item.id) {
    card.append(buildDeleteConfirm(tabKey, item, container));
  } else {
    card.append(buildCardActions(item, container));
  }

  return card;
}

function buildSkillMeta(item) {
  const wrap = el('div', 'card-main');

  const meta = el('div', 'card-meta');
  meta.append(el('span', 'meta-chip', `Level ${item.level} · ${LEVEL_LABELS[item.level - 1]}`));
  wrap.append(meta);

  if (item.proof_url || item.used_at_experience) {
    const row = el('div', 'verified-row');
    const badge = el('span', 'verified-badge');
    const dot = el('span', 'verified-marker', '●');
    dot.setAttribute('aria-hidden', 'true');
    badge.append(dot, document.createTextNode(' Verified'));
    row.append(badge, el('span', 'verified-note', 'Verified means you can show proof or a real project.'));
    wrap.append(row);
  }

  if (item.proof_url) {
    const p = el('p', 'card-detail');
    const a = el('a', 'link', `Proof link: ${item.proof_url} ↗`);
    a.href = item.proof_url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    p.append(a);
    wrap.append(p);
  }

  if (item.used_at_experience) {
    const org = item.experience_organisation ? ` at ${item.experience_organisation}` : '';
    wrap.append(el('p', 'card-detail muted', `Used at: ${item.experience_title || 'Experience'}${org}`));
  }

  return wrap;
}

function buildExperienceMeta(item) {
  const meta = el('div', 'card-meta');
  meta.append(el('span', 'meta-chip', item.kind === 'volunteering' ? 'Volunteering' : 'Experience'));
  if (item.organisation) meta.append(el('span', '', item.organisation));
  const end = item.is_current ? 'Present' : (item.end_date || '');
  meta.append(el('span', 'card-dates', `${item.start_date}${end ? ` – ${end}` : ''}`));
  return meta;
}

function buildEducationMeta(item) {
  const meta = el('div', 'card-meta');
  if (item.institution) meta.append(el('span', '', item.institution));
  if (item.start_date || item.end_date) {
    const s = item.start_date || '';
    const e = item.end_date || '';
    meta.append(el('span', 'card-dates', `${s}${s && e ? ' – ' : ''}${e}`));
  }
  return meta;
}

function buildCardActions(item, container) {
  const actions = el('div', 'card-actions');

  const editBtn = el('button', 'btn btn-secondary btn-edit', 'Edit');
  editBtn.type = 'button';
  editBtn.addEventListener('click', () => {
    state.editingItem = item;
    state.isAdding = false;
    state.confirmDeleteId = null;
    draw(container);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const deleteBtn = el('button', 'btn btn-danger-outline btn-delete', 'Delete');
  deleteBtn.type = 'button';
  deleteBtn.addEventListener('click', () => {
    state.confirmDeleteId = item.id;
    draw(container);
  });

  actions.append(editBtn, deleteBtn);
  return actions;
}

function buildDeleteConfirm(tabKey, item, container) {
  const box = el('div', 'delete-confirm');
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Confirm delete');

  const displayName = item.name || item.title || item.course;
  const prompt = el('p', 'delete-prompt', `Delete ${displayName}? This cannot be undone.`);

  const actions = el('div', 'delete-actions');

  const delBtn = el('button', 'btn btn-danger confirm-delete-btn', 'Delete');
  delBtn.type = 'button';
  delBtn.addEventListener('click', async () => {
    delBtn.disabled = true;
    try {
      const res = await fetch(`/api/${tabKey}/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete item. Please try again.');
      state.confirmDeleteId = null;
      refresh(container);
    } catch (err) {
      prompt.textContent = err.message;
      delBtn.disabled = false;
    }
  });

  const keepBtn = el('button', 'btn btn-secondary', 'Keep it');
  keepBtn.type = 'button';
  keepBtn.addEventListener('click', () => {
    state.confirmDeleteId = null;
    draw(container);
  });

  actions.append(delBtn, keepBtn);
  box.append(prompt, actions);
  return box;
}

// ---------- Forms ----------

function makeField(labelText, control, errorId) {
  const group = el('div', 'form-group');
  const label = el('label', 'form-label', labelText);
  label.htmlFor = control.id;
  const err = el('div', 'field-error');
  err.id = errorId;
  err.style.display = 'none';
  group.append(label, control, err);
  return group;
}

function textInput(id, value, placeholder, type = 'text') {
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.className = 'form-input';
  input.value = value || '';
  input.placeholder = placeholder || '';
  return input;
}

function fail(inputId, errorId, message) {
  return { error: { inputId, errorId, message } };
}

function dateProblem(value, inputId, errorId, label) {
  if (value && !DATE_FORMAT.test(value)) {
    return fail(inputId, errorId, `${label} must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).`);
  }
  return null;
}

function buildForm(tabKey, item, container) {
  const panel = el('div', 'form-panel');

  const noun = tabKey === 'skills' ? 'skill' : tabKey === 'experiences' ? 'experience or volunteering' : 'education';
  panel.append(el('h3', 'form-title', `${item ? 'Edit' : 'Add'} ${noun}`));

  const form = document.createElement('form');
  form.noValidate = true;

  const read = tabKey === 'skills' ? skillFields(form, item)
    : tabKey === 'experiences' ? experienceFields(form, item)
    : educationFields(form, item);

  const actions = el('div', 'form-actions');
  const saveBtn = el('button', 'btn btn-primary', item ? 'Save changes' : `Save ${noun}`);
  saveBtn.type = 'submit';
  const cancelBtn = el('button', 'btn btn-secondary', 'Cancel');
  cancelBtn.type = 'button';
  cancelBtn.addEventListener('click', () => {
    resetPanel();
    draw(container);
  });
  const saveStatus = el('span', 'save-status');
  saveStatus.setAttribute('aria-live', 'polite');
  actions.append(saveBtn, cancelBtn, saveStatus);
  form.append(actions);

  const showError = (inputId, errorId, message) => {
    form.querySelectorAll('.field-error').forEach((n) => {
      n.textContent = '';
      n.style.display = 'none';
    });
    const errEl = document.getElementById(errorId);
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = 'block';
    }
    const input = document.getElementById(inputId);
    if (input) input.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const result = read();
    if (result.error) {
      showError(result.error.inputId, result.error.errorId, result.error.message);
      return;
    }

    saveBtn.disabled = true;
    try {
      const endpoint = `/api/${tabKey}${item ? `/${item.id}` : ''}`;
      const res = await fetch(endpoint, {
        method: item ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save item.');

      saveStatus.textContent = 'Saved';
      setTimeout(async () => {
        resetPanel();
        await loadProfileData();
        draw(container);
      }, 1200);
    } catch (err) {
      saveBtn.disabled = false;
      saveStatus.textContent = '';
      const firstErr = form.querySelector('.field-error');
      if (firstErr) {
        firstErr.textContent = err.message || 'An error occurred while saving.';
        firstErr.style.display = 'block';
      }
    }
  });

  panel.append(form);
  return panel;
}

function skillFields(form, item) {
  const nameInput = textInput('skill-name', item ? item.name : '', 'e.g. JavaScript, Docker, Figma');
  form.append(makeField('Skill name', nameInput, 'skill-name-error'));

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'skill-level';
  slider.className = 'slider-input';
  slider.min = '1';
  slider.max = '5';
  slider.step = '1';
  slider.value = String(item ? item.level : 3);

  const sliderLabel = el('label', 'form-label', 'Skill level');
  sliderLabel.htmlFor = 'skill-level';
  const steps = el('div', 'slider-steps');
  const meaning = el('p', 'level-meaning', LEVEL_MEANINGS[Number(slider.value) - 1]);

  const paintSteps = () => {
    const v = Number(slider.value);
    steps.replaceChildren(...LEVEL_LABELS.map((txt, idx) => el('span', idx + 1 === v ? 'slider-step is-selected' : 'slider-step', txt)));
    meaning.textContent = LEVEL_MEANINGS[v - 1];
  };
  slider.addEventListener('input', paintSteps);
  paintSteps();

  const sliderGroup = el('div', 'form-group slider-container');
  sliderGroup.append(sliderLabel, slider, steps, meaning);
  form.append(sliderGroup);

  const proofInput = textInput('skill-proof', item && item.proof_url ? item.proof_url : '', 'https://github.com/... or https://...', 'url');
  form.append(makeField('Proof link (optional)', proofInput, 'skill-proof-error'));

  const usedSelect = document.createElement('select');
  usedSelect.id = 'skill-used-at';
  usedSelect.className = 'form-select';
  const none = el('option', '', 'None / Not linked to an experience');
  none.value = '';
  usedSelect.append(none);
  state.experiences.forEach((exp) => {
    const opt = el('option', '', `${exp.title}${exp.organisation ? ` (${exp.organisation})` : ''}`);
    opt.value = String(exp.id);
    if (item && item.used_at_experience === exp.id) opt.selected = true;
    usedSelect.append(opt);
  });
  form.append(makeField('Used at (optional)', usedSelect, 'skill-used-at-error'));

  return () => {
    const name = nameInput.value.trim();
    if (!name) return fail('skill-name', 'skill-name-error', 'Please enter a skill name.');

    const duplicate = state.skills.find((s) => s.name.toLowerCase() === name.toLowerCase() && (!item || s.id !== item.id));
    if (duplicate) return fail('skill-name', 'skill-name-error', 'A skill with this name already exists. Enter a unique name.');

    const proof = proofInput.value.trim();
    if (proof && !proof.startsWith('http://') && !proof.startsWith('https://')) {
      return fail('skill-proof', 'skill-proof-error', 'Proof link must start with http:// or https://.');
    }

    return {
      payload: {
        name,
        level: Number(slider.value),
        proof_url: proof || null,
        used_at_experience: usedSelect.value ? Number(usedSelect.value) : null,
      },
    };
  };
}

function experienceFields(form, item) {
  const kindSelect = document.createElement('select');
  kindSelect.id = 'exp-kind';
  kindSelect.className = 'form-select';
  const optWork = el('option', '', 'Experience');
  optWork.value = 'experience';
  const optVol = el('option', '', 'Volunteering');
  optVol.value = 'volunteering';
  if (item && item.kind === 'volunteering') optVol.selected = true;
  kindSelect.append(optWork, optVol);
  form.append(makeField('Type', kindSelect, 'exp-kind-error'));

  const titleInput = textInput('exp-title', item ? item.title : '', 'e.g. Software Engineer or Community Lead');
  form.append(makeField('Title', titleInput, 'exp-title-error'));

  const orgInput = textInput('exp-org', item && item.organisation ? item.organisation : '', 'e.g. Acme Corp or Open Source Initiative');
  form.append(makeField('Organisation (optional)', orgInput, 'exp-org-error'));

  const startInput = textInput('exp-start', item ? item.start_date : '', 'YYYY-MM or YYYY-MM-DD (e.g. 2023-01)');
  form.append(makeField('Start date', startInput, 'exp-start-error'));

  const currentCheck = document.createElement('input');
  currentCheck.type = 'checkbox';
  currentCheck.id = 'exp-current';
  currentCheck.checked = item ? Boolean(item.is_current) : false;
  const currentLabel = el('label', 'checkbox-label');
  currentLabel.append(currentCheck, document.createTextNode(' Present (currently working or volunteering here)'));
  const currentGroup = el('div', 'form-group');
  currentGroup.append(currentLabel);
  form.append(currentGroup);

  const endInput = textInput('exp-end', item && item.end_date ? item.end_date : '', 'YYYY-MM or YYYY-MM-DD');
  endInput.disabled = currentCheck.checked;
  if (currentCheck.checked) endInput.value = '';
  currentCheck.addEventListener('change', () => {
    endInput.disabled = currentCheck.checked;
    if (currentCheck.checked) endInput.value = '';
  });
  form.append(makeField('End date (optional)', endInput, 'exp-end-error'));

  const descInput = document.createElement('textarea');
  descInput.id = 'exp-desc';
  descInput.className = 'form-textarea';
  descInput.placeholder = 'Brief summary of key tasks, achievements, or projects.';
  descInput.value = item && item.description ? item.description : '';
  form.append(makeField('Description (optional)', descInput, 'exp-desc-error'));

  return () => {
    const title = titleInput.value.trim();
    if (!title) return fail('exp-title', 'exp-title-error', 'Please enter a title.');

    const start = startInput.value.trim();
    if (!start) return fail('exp-start', 'exp-start-error', 'Please enter a start date.');
    const startErr = dateProblem(start, 'exp-start', 'exp-start-error', 'Start date');
    if (startErr) return startErr;

    const isCurrent = currentCheck.checked;
    const end = endInput.value.trim();
    if (!isCurrent && end) {
      const endErr = dateProblem(end, 'exp-end', 'exp-end-error', 'End date');
      if (endErr) return endErr;
      if (end < start) return fail('exp-end', 'exp-end-error', 'End date cannot be earlier than start date.');
    }

    return {
      payload: {
        kind: kindSelect.value,
        title,
        organisation: orgInput.value.trim() || null,
        start_date: start,
        end_date: isCurrent ? null : (end || null),
        is_current: isCurrent ? 1 : 0,
        description: descInput.value.trim() || null,
      },
    };
  };
}

function educationFields(form, item) {
  const courseInput = textInput('edu-course', item ? item.course : '', 'e.g. BSc in Computer Science, or Web Development Bootcamp');
  form.append(makeField('Course', courseInput, 'edu-course-error'));

  const instInput = textInput('edu-inst', item && item.institution ? item.institution : '', 'e.g. University of Colombo or Coursera');
  form.append(makeField('Institution (optional)', instInput, 'edu-inst-error'));

  const startInput = textInput('edu-start', item && item.start_date ? item.start_date : '', 'YYYY-MM or YYYY-MM-DD');
  form.append(makeField('Start date (optional)', startInput, 'edu-start-error'));

  const endInput = textInput('edu-end', item && item.end_date ? item.end_date : '', 'YYYY-MM or YYYY-MM-DD');
  form.append(makeField('End date (optional)', endInput, 'edu-end-error'));

  return () => {
    const course = courseInput.value.trim();
    if (!course) return fail('edu-course', 'edu-course-error', 'Please enter a course or degree.');

    const start = startInput.value.trim();
    const startErr = dateProblem(start, 'edu-start', 'edu-start-error', 'Start date');
    if (startErr) return startErr;

    const end = endInput.value.trim();
    const endErr = dateProblem(end, 'edu-end', 'edu-end-error', 'End date');
    if (endErr) return endErr;

    if (start && end && end < start) return fail('edu-end', 'edu-end-error', 'End date cannot be earlier than start date.');

    return {
      payload: {
        course,
        institution: instInput.value.trim() || null,
        start_date: start || null,
        end_date: end || null,
      },
    };
  };
}
