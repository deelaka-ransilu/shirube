// Switches screens by the #hash in the address bar.
const SCREENS = {
  jobs: 'Jobs',
  followups: 'Follow-ups',
  learn: 'What works',
  profile: 'My profile',
  settings: 'Settings',
  backup: 'Export backup',
};

// Level definitions for the skills slider.
const LEVEL_LABELS = ['Aware', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
const LEVEL_MEANINGS = [
  'Aware: you know what this is and can follow along in discussions.',
  'Beginner: you can complete basic tasks using tutorials or guidance.',
  'Intermediate: you work independently and solve common problems.',
  'Advanced: you understand best practices, solve complex problems, and guide others.',
  'Expert: you have deep mastery, architect solutions, and handle edge cases.',
];

// Profile screen state.
const profileState = {
  skills: [],
  experiences: [],
  education: [],
  activeTab: 'skills',
  isAdding: false,
  editingItem: null,
  confirmDeleteId: null,
};

// Safely escapes text for HTML rendering.
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Determines the plain-English next step advice.
function getNextStep(skills, experiences, education) {
  if (skills.length === 0 && experiences.length === 0 && education.length === 0) {
    return 'Still to do: add at least one skill to use Shirube.';
  }
  if (skills.length === 0) {
    return 'Still to do: add at least one skill to use Shirube.';
  }
  if (experiences.length === 0) {
    return 'Next: add an experience or volunteering entry to build your history.';
  }
  if (education.length === 0) {
    return 'Next: add your education or qualifications.';
  }
  const unverified = skills.find((s) => !s.proof_url && !s.used_at_experience);
  if (unverified) {
    return 'Next: add a proof link to verify a skill.';
  }
  return 'Profile complete: all your skills, experience, and education are up to date.';
}

// Loads profile data from the backend.
async function loadProfileData() {
  const res = await fetch('/api/profile');
  if (!res.ok) {
    throw new Error('Could not load profile data');
  }
  const data = await res.json();
  profileState.skills = data.skills || [];
  profileState.experiences = data.experiences || [];
  profileState.education = data.education || [];
}

// Renders the entire profile screen.
async function renderProfile(container) {
  container.innerHTML = '<p class="muted">Loading profile...</p>';

  try {
    await loadProfileData();
  } catch (err) {
    container.innerHTML = `<p class="field-error">Error loading profile: ${escapeHtml(err.message)}</p>`;
    return;
  }

  drawProfileView(container);
}

// Redraws the profile interface based on state.
function drawProfileView(container) {
  const { skills, experiences, education, activeTab, isAdding, editingItem, confirmDeleteId } = profileState;

  const shell = document.createElement('div');
  shell.className = 'profile-shell';

  // Heading and purpose.
  const header = document.createElement('header');
  const h1 = document.createElement('h1');
  h1.className = 'screen-title';
  h1.textContent = 'My profile';

  const intro = document.createElement('p');
  intro.className = 'profile-intro';
  intro.textContent = 'Keep your skills, experience, and education up to date so Shirube can match them against jobs.';
  header.append(h1, intro);

  // Progress summary.
  const progressBox = document.createElement('section');
  progressBox.className = 'profile-progress';
  progressBox.setAttribute('aria-label', 'Profile completion progress');

  const countsLine = document.createElement('div');
  countsLine.className = 'progress-counts';
  const skCount = `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
  const expCount = `${experiences.length} ${experiences.length === 1 ? 'experience' : 'experiences'}`;
  const eduCount = `${education.length} education`;
  countsLine.textContent = `${skCount}   ${expCount}   ${eduCount}`;

  const nextStepLine = document.createElement('div');
  nextStepLine.className = 'progress-next';
  nextStepLine.textContent = getNextStep(skills, experiences, education);

  progressBox.append(countsLine, nextStepLine);

  // Three tabs.
  const tabList = document.createElement('div');
  tabList.className = 'tab-list';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Profile sections');

  const tabsConfig = [
    { key: 'skills', label: `Skills (${skills.length})` },
    { key: 'experiences', label: `Experience and volunteering (${experiences.length})` },
    { key: 'education', label: `Education (${education.length})` },
  ];

  tabsConfig.forEach((tab, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.setAttribute('role', 'tab');
    btn.id = `tab-${tab.key}`;
    btn.setAttribute('aria-controls', `panel-${tab.key}`);
    const isSelected = activeTab === tab.key;
    btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    btn.setAttribute('tabindex', isSelected ? '0' : '-1');
    btn.textContent = tab.label;

    btn.addEventListener('click', () => {
      if (profileState.activeTab !== tab.key) {
        profileState.activeTab = tab.key;
        profileState.isAdding = false;
        profileState.editingItem = null;
        profileState.confirmDeleteId = null;
        drawProfileView(container);
      }
    });

    btn.addEventListener('keydown', (e) => {
      const allTabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
      let nextIndex = index;
      if (e.key === 'ArrowRight') {
        nextIndex = (index + 1) % allTabs.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (index - 1 + allTabs.length) % allTabs.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = allTabs.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      allTabs[nextIndex].focus();
      allTabs[nextIndex].click();
    });

    tabList.append(btn);
  });

  // Tab panel.
  const panel = document.createElement('section');
  panel.className = 'tab-panel';
  panel.id = `panel-${activeTab}`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `tab-${activeTab}`);

  // Tab header with action button.
  const tabHeader = document.createElement('div');
  tabHeader.className = 'tab-header';

  const tabHeaderText = document.createElement('div');
  tabHeaderText.className = 'tab-header-text';

  const tabTitle = document.createElement('h2');
  tabTitle.className = 'tab-title';

  const tabDesc = document.createElement('p');
  tabDesc.className = 'tab-desc';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary tab-header-btn';

  if (activeTab === 'skills') {
    tabTitle.textContent = 'Skills';
    tabDesc.textContent = 'List what you know and how well you know it, so Shirube can match them against jobs.';
    addBtn.textContent = '+ Add skill';
  } else if (activeTab === 'experiences') {
    tabTitle.textContent = 'Experience and volunteering';
    tabDesc.textContent = 'Record your past and current roles to track where your skills were built.';
    addBtn.textContent = '+ Add experience';
  } else {
    tabTitle.textContent = 'Education';
    tabDesc.textContent = 'Add your degrees, diplomas, courses, or certificates.';
    addBtn.textContent = '+ Add education';
  }

  addBtn.addEventListener('click', () => {
    profileState.isAdding = true;
    profileState.editingItem = null;
    profileState.confirmDeleteId = null;
    drawProfileView(container);
  });

  tabHeaderText.append(tabTitle, tabDesc);
  tabHeader.append(tabHeaderText, addBtn);
  panel.append(tabHeader);

  // Form opens above the list if adding or editing.
  if (isAdding || editingItem) {
    const formPanel = createItemForm(activeTab, editingItem, container);
    panel.append(formPanel);
  }

  // Cards list or empty state.
  const items = profileState[activeTab];
  if (items.length === 0) {
    const emptyBox = document.createElement('div');
    emptyBox.className = 'empty-state';

    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-text';
    if (activeTab === 'skills') {
      emptyMsg.textContent = 'No skills added yet. Add at least one skill to start building your profile.';
    } else if (activeTab === 'experiences') {
      emptyMsg.textContent = 'No experience added yet. Add your past jobs or volunteering to link your skills to real projects.';
    } else {
      emptyMsg.textContent = 'No education added yet. Add your courses or degrees to complete your profile.';
    }

    const emptyBtn = document.createElement('button');
    emptyBtn.type = 'button';
    emptyBtn.className = 'btn btn-primary';
    emptyBtn.textContent = addBtn.textContent;
    emptyBtn.addEventListener('click', () => {
      profileState.isAdding = true;
      profileState.editingItem = null;
      profileState.confirmDeleteId = null;
      drawProfileView(container);
    });

    emptyBox.append(emptyMsg, emptyBtn);
    panel.append(emptyBox);
  } else {
    const cardsList = document.createElement('div');
    cardsList.className = 'cards-list';

    items.forEach((item) => {
      const card = createItemCard(activeTab, item, container);
      cardsList.append(card);
    });

    panel.append(cardsList);
  }

  shell.append(header, progressBox, tabList, panel);
  container.innerHTML = '';
  container.append(shell);
}

// Creates the add/edit form for skills, experiences, or education.
function createItemForm(tabKey, item, container) {
  const formPanel = document.createElement('div');
  formPanel.className = 'form-panel';

  const formTitle = document.createElement('h3');
  formTitle.className = 'form-title';
  const actionLabel = item ? 'Edit' : 'Add';
  if (tabKey === 'skills') formTitle.textContent = `${actionLabel} skill`;
  else if (tabKey === 'experiences') formTitle.textContent = `${actionLabel} experience or volunteering`;
  else formTitle.textContent = `${actionLabel} education`;

  formPanel.append(formTitle);

  const form = document.createElement('form');
  form.noValidate = true;

  // Helper to append a field with an error slot.
  function addField(labelStr, inputEl, errorId) {
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
    form.append(group);
  }

  if (tabKey === 'skills') {
    // 1. Skill Name.
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'skill-name';
    nameInput.className = 'form-input';
    nameInput.value = item ? item.name : '';
    nameInput.placeholder = 'e.g. JavaScript, Docker, Figma';
    nameInput.required = true;
    addField('Skill name', nameInput, 'skill-name-error');

    // 2. Skill Level Slider.
    const sliderGroup = document.createElement('div');
    sliderGroup.className = 'form-group slider-container';

    const sliderLabel = document.createElement('label');
    sliderLabel.className = 'form-label';
    sliderLabel.htmlFor = 'skill-level';
    sliderLabel.textContent = 'Skill level';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'skill-level';
    slider.className = 'slider-input';
    slider.min = '1';
    slider.max = '5';
    slider.step = '1';
    slider.value = item ? String(item.level) : '3';

    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'slider-steps';

    LEVEL_LABELS.forEach((txt, idx) => {
      const stepSpan = document.createElement('span');
      stepSpan.className = `slider-step ${idx + 1 === Number(slider.value) ? 'is-selected' : ''}`;
      stepSpan.id = `step-label-${idx + 1}`;
      stepSpan.textContent = txt;
      stepsContainer.append(stepSpan);
    });

    const meaning = document.createElement('p');
    meaning.className = 'level-meaning';
    meaning.id = 'level-meaning-text';
    meaning.textContent = LEVEL_MEANINGS[Number(slider.value) - 1];

    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      stepsContainer.querySelectorAll('.slider-step').forEach((span, idx) => {
        if (idx + 1 === val) {
          span.classList.add('is-selected');
        } else {
          span.classList.remove('is-selected');
        }
      });
      meaning.textContent = LEVEL_MEANINGS[val - 1];
    });

    sliderGroup.append(sliderLabel, slider, stepsContainer, meaning);
    form.append(sliderGroup);

    // 3. Proof link.
    const proofInput = document.createElement('input');
    proofInput.type = 'url';
    proofInput.id = 'skill-proof';
    proofInput.className = 'form-input';
    proofInput.placeholder = 'https://github.com/... or https://...';
    proofInput.value = item && item.proof_url ? item.proof_url : '';
    addField('Proof link (optional)', proofInput, 'skill-proof-error');

    // 4. Used at experience.
    const expSelect = document.createElement('select');
    expSelect.id = 'skill-used-at';
    expSelect.className = 'form-select';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'None / Not linked to an experience';
    expSelect.append(defaultOpt);

    profileState.experiences.forEach((exp) => {
      const opt = document.createElement('option');
      opt.value = String(exp.id);
      const company = exp.organisation ? ` (${exp.organisation})` : '';
      opt.textContent = `${exp.title}${company}`;
      if (item && item.used_at_experience === exp.id) {
        opt.selected = true;
      }
      expSelect.append(opt);
    });
    addField('Used at (optional)', expSelect, 'skill-used-at-error');
  } else if (tabKey === 'experiences') {
    // 1. Type (Experience or Volunteering).
    const kindSelect = document.createElement('select');
    kindSelect.id = 'exp-kind';
    kindSelect.className = 'form-select';

    const optWork = document.createElement('option');
    optWork.value = 'experience';
    optWork.textContent = 'Experience';
    if (!item || item.kind === 'experience') optWork.selected = true;

    const optVol = document.createElement('option');
    optVol.value = 'volunteering';
    optVol.textContent = 'Volunteering';
    if (item && item.kind === 'volunteering') optVol.selected = true;

    kindSelect.append(optWork, optVol);
    addField('Type', kindSelect, 'exp-kind-error');

    // 2. Title.
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'exp-title';
    titleInput.className = 'form-input';
    titleInput.placeholder = 'e.g. Software Engineer or Community Lead';
    titleInput.value = item ? item.title : '';
    titleInput.required = true;
    addField('Title', titleInput, 'exp-title-error');

    // 3. Organisation.
    const orgInput = document.createElement('input');
    orgInput.type = 'text';
    orgInput.id = 'exp-org';
    orgInput.className = 'form-input';
    orgInput.placeholder = 'e.g. Acme Corp or Open Source Initiative';
    orgInput.value = item && item.organisation ? item.organisation : '';
    addField('Organisation (optional)', orgInput, 'exp-org-error');

    // 4. Start date.
    const startInput = document.createElement('input');
    startInput.type = 'text';
    startInput.id = 'exp-start';
    startInput.className = 'form-input';
    startInput.placeholder = 'YYYY-MM or YYYY-MM-DD (e.g. 2023-01)';
    startInput.value = item ? item.start_date : '';
    startInput.required = true;
    addField('Start date', startInput, 'exp-start-error');

    // 5. Present checkbox.
    const currentGroup = document.createElement('div');
    currentGroup.className = 'form-group';
    const currentLabel = document.createElement('label');
    currentLabel.className = 'checkbox-label';

    const currentCheck = document.createElement('input');
    currentCheck.type = 'checkbox';
    currentCheck.id = 'exp-current';
    currentCheck.checked = item ? Boolean(item.is_current) : false;

    currentLabel.append(currentCheck, document.createTextNode(' Present (currently working or volunteering here)'));
    currentGroup.append(currentLabel);
    form.append(currentGroup);

    // 6. End date.
    const endInput = document.createElement('input');
    endInput.type = 'text';
    endInput.id = 'exp-end';
    endInput.className = 'form-input';
    endInput.placeholder = 'YYYY-MM or YYYY-MM-DD';
    endInput.value = item && item.end_date ? item.end_date : '';
    if (currentCheck.checked) {
      endInput.disabled = true;
      endInput.value = '';
    }

    currentCheck.addEventListener('change', () => {
      if (currentCheck.checked) {
        endInput.disabled = true;
        endInput.value = '';
      } else {
        endInput.disabled = false;
      }
    });

    addField('End date (optional)', endInput, 'exp-end-error');

    // 7. Description.
    const descInput = document.createElement('textarea');
    descInput.id = 'exp-desc';
    descInput.className = 'form-textarea';
    descInput.placeholder = 'Brief summary of key tasks, achievements, or projects.';
    descInput.value = item && item.description ? item.description : '';
    addField('Description (optional)', descInput, 'exp-desc-error');
  } else {
    // Education form.
    // 1. Course.
    const courseInput = document.createElement('input');
    courseInput.type = 'text';
    courseInput.id = 'edu-course';
    courseInput.className = 'form-input';
    courseInput.placeholder = 'e.g. BSc in Computer Science, or Web Development Bootcamp';
    courseInput.value = item ? item.course : '';
    courseInput.required = true;
    addField('Course', courseInput, 'edu-course-error');

    // 2. Institution.
    const instInput = document.createElement('input');
    instInput.type = 'text';
    instInput.id = 'edu-inst';
    instInput.className = 'form-input';
    instInput.placeholder = 'e.g. University of Colombo or Coursera';
    instInput.value = item && item.institution ? item.institution : '';
    addField('Institution (optional)', instInput, 'edu-inst-error');

    // 3. Start date.
    const startInput = document.createElement('input');
    startInput.type = 'text';
    startInput.id = 'edu-start';
    startInput.className = 'form-input';
    startInput.placeholder = 'YYYY-MM or YYYY-MM-DD';
    startInput.value = item && item.start_date ? item.start_date : '';
    addField('Start date (optional)', startInput, 'edu-start-error');

    // 4. End date.
    const endInput = document.createElement('input');
    endInput.type = 'text';
    endInput.id = 'edu-end';
    endInput.className = 'form-input';
    endInput.placeholder = 'YYYY-MM or YYYY-MM-DD';
    endInput.value = item && item.end_date ? item.end_date : '';
    addField('End date (optional)', endInput, 'edu-end-error');
  }

  // Form actions.
  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = item ? 'Save changes' : `Save ${tabKey === 'skills' ? 'skill' : tabKey === 'experiences' ? 'experience' : 'education'}`;

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    profileState.isAdding = false;
    profileState.editingItem = null;
    drawProfileView(container);
  });

  const saveFeedback = document.createElement('span');
  saveFeedback.className = 'save-status';
  saveFeedback.setAttribute('aria-live', 'polite');

  actions.append(saveBtn, cancelBtn, saveFeedback);
  form.append(actions);

  // Form submit handler.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous errors.
    form.querySelectorAll('.field-error').forEach((el) => {
      el.textContent = '';
      el.style.display = 'none';
    });

    let isValid = true;
    let payload = {};

    function showError(fieldId, errorId, message) {
      isValid = false;
      const errorDiv = document.getElementById(errorId);
      if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
      }
      const field = document.getElementById(fieldId);
      if (field) field.focus();
    }

    // Date validator helper.
    function checkDateFormat(val) {
      if (!val) return true;
      return /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(val);
    }

    if (tabKey === 'skills') {
      const name = document.getElementById('skill-name').value.trim();
      const level = Number(document.getElementById('skill-level').value);
      const proofUrl = document.getElementById('skill-proof').value.trim();
      const usedAt = document.getElementById('skill-used-at').value;

      if (!name) {
        showError('skill-name', 'skill-name-error', 'Please enter a skill name.');
        return;
      }

      // Check duplicate name locally.
      const nameLower = name.toLowerCase();
      const duplicate = profileState.skills.find(
        (s) => s.name.toLowerCase() === nameLower && (!item || s.id !== item.id)
      );
      if (duplicate) {
        showError('skill-name', 'skill-name-error', 'A skill with this name already exists. Enter a unique name.');
        return;
      }

      if (proofUrl && !proofUrl.startsWith('http://') && !proofUrl.startsWith('https://')) {
        showError('skill-proof', 'skill-proof-error', 'Proof link must start with http:// or https://.');
        return;
      }

      payload = {
        name,
        level,
        proof_url: proofUrl || null,
        used_at_experience: usedAt ? Number(usedAt) : null,
      };
    } else if (tabKey === 'experiences') {
      const kind = document.getElementById('exp-kind').value;
      const title = document.getElementById('exp-title').value.trim();
      const organisation = document.getElementById('exp-org').value.trim();
      const startDate = document.getElementById('exp-start').value.trim();
      const isCurrent = document.getElementById('exp-current').checked ? 1 : 0;
      const endDate = document.getElementById('exp-end').value.trim();
      const description = document.getElementById('exp-desc').value.trim();

      if (!title) {
        showError('exp-title', 'exp-title-error', 'Please enter a title.');
        return;
      }

      if (!startDate) {
        showError('exp-start', 'exp-start-error', 'Please enter a start date.');
        return;
      }

      if (!checkDateFormat(startDate)) {
        showError('exp-start', 'exp-start-error', 'Start date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).');
        return;
      }

      if (!isCurrent && endDate) {
        if (!checkDateFormat(endDate)) {
          showError('exp-end', 'exp-end-error', 'End date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).');
          return;
        }
        if (endDate < startDate) {
          showError('exp-end', 'exp-end-error', 'End date cannot be earlier than start date.');
          return;
        }
      }

      payload = {
        kind,
        title,
        organisation: organisation || null,
        start_date: startDate,
        end_date: isCurrent ? null : (endDate || null),
        is_current: isCurrent,
        description: description || null,
      };
    } else {
      const course = document.getElementById('edu-course').value.trim();
      const institution = document.getElementById('edu-inst').value.trim();
      const startDate = document.getElementById('edu-start').value.trim();
      const endDate = document.getElementById('edu-end').value.trim();

      if (!course) {
        showError('edu-course', 'edu-course-error', 'Please enter a course or degree.');
        return;
      }

      if (startDate && !checkDateFormat(startDate)) {
        showError('edu-start', 'edu-start-error', 'Start date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).');
        return;
      }

      if (endDate && !checkDateFormat(endDate)) {
        showError('edu-end', 'edu-end-error', 'End date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).');
        return;
      }

      if (startDate && endDate && endDate < startDate) {
        showError('edu-end', 'edu-end-error', 'End date cannot be earlier than start date.');
        return;
      }

      payload = {
        course,
        institution: institution || null,
        start_date: startDate || null,
        end_date: endDate || null,
      };
    }

    if (!isValid) return;

    // Send to backend.
    const endpoint = `/api/${tabKey}${item ? `/${item.id}` : ''}`;
    const method = item ? 'PUT' : 'POST';

    saveBtn.disabled = true;
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        saveBtn.disabled = false;
        // Show server validation error under first field.
        const firstErrorDiv = form.querySelector('.field-error');
        if (firstErrorDiv) {
          firstErrorDiv.textContent = data.error || 'Failed to save item.';
          firstErrorDiv.style.display = 'block';
        }
        return;
      }

      // Show "Saved" feedback next to the button.
      saveFeedback.textContent = 'Saved';

      setTimeout(async () => {
        profileState.isAdding = false;
        profileState.editingItem = null;
        await loadProfileData();
        drawProfileView(container);
      }, 1200);
    } catch (err) {
      saveBtn.disabled = false;
      saveFeedback.textContent = '';
      const firstErrorDiv = form.querySelector('.field-error');
      if (firstErrorDiv) {
        firstErrorDiv.textContent = err.message || 'An error occurred while saving.';
        firstErrorDiv.style.display = 'block';
      }
    }
  });

  formPanel.append(form);
  return formPanel;
}

// Creates an individual card for a skill, experience, or education item.
function createItemCard(tabKey, item, container) {
  const card = document.createElement('article');
  card.className = 'card';
  card.id = `card-${tabKey}-${item.id}`;

  const main = document.createElement('div');
  main.className = 'card-main';

  // Title: most prominent text.
  const title = document.createElement('h3');
  title.className = 'card-title';

  if (tabKey === 'skills') {
    title.textContent = item.name;
    main.append(title);

    // Level chip and details.
    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const levelChip = document.createElement('span');
    levelChip.className = 'meta-chip';
    levelChip.textContent = `Level ${item.level} · ${LEVEL_LABELS[item.level - 1]}`;
    meta.append(levelChip);

    // Verified marker when proof or used_at is present.
    if (item.proof_url || item.used_at_experience) {
      const verifiedRow = document.createElement('div');
      verifiedRow.className = 'verified-row';

      const badge = document.createElement('span');
      badge.className = 'verified-badge';

      const dot = document.createElement('span');
      dot.className = 'verified-marker';
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = '●';

      const word = document.createElement('span');
      word.textContent = 'Verified';

      badge.append(dot, word);

      const note = document.createElement('span');
      note.className = 'verified-note';
      note.textContent = 'Verified means you can show proof or a real project.';

      verifiedRow.append(badge, note);
      main.append(meta, verifiedRow);
    } else {
      main.append(meta);
    }

    if (item.proof_url) {
      const proofP = document.createElement('p');
      proofP.className = 'card-detail';
      const proofLink = document.createElement('a');
      proofLink.href = item.proof_url;
      proofLink.className = 'link';
      proofLink.target = '_blank';
      proofLink.rel = 'noopener noreferrer';
      proofLink.textContent = `Proof link: ${item.proof_url} ↗`;
      proofP.append(proofLink);
      main.append(proofP);
    }

    if (item.used_at_experience) {
      const usedP = document.createElement('p');
      usedP.className = 'card-detail muted';
      const orgStr = item.experience_organisation ? ` at ${item.experience_organisation}` : '';
      usedP.textContent = `Used at: ${item.experience_title || 'Experience'}${orgStr}`;
      main.append(usedP);
    }
  } else if (tabKey === 'experiences') {
    title.textContent = item.title;
    main.append(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    const typeChip = document.createElement('span');
    typeChip.className = 'meta-chip';
    typeChip.textContent = item.kind === 'volunteering' ? 'Volunteering' : 'Experience';
    meta.append(typeChip);

    if (item.organisation) {
      const org = document.createElement('span');
      org.textContent = item.organisation;
      meta.append(org);
    }

    const dates = document.createElement('span');
    dates.className = 'card-dates';
    const endStr = item.is_current ? 'Present' : (item.end_date || '');
    dates.textContent = `${item.start_date}${endStr ? ` – ${endStr}` : ''}`;
    meta.append(dates);

    main.append(meta);

    if (item.description) {
      const desc = document.createElement('p');
      desc.className = 'card-desc';
      desc.textContent = item.description;
      main.append(desc);
    }
  } else {
    // Education.
    title.textContent = item.course;
    main.append(title);

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    if (item.institution) {
      const inst = document.createElement('span');
      inst.textContent = item.institution;
      meta.append(inst);
    }

    if (item.start_date || item.end_date) {
      const dates = document.createElement('span');
      dates.className = 'card-dates';
      const s = item.start_date || '';
      const e = item.end_date || '';
      dates.textContent = `${s}${s && e ? ' – ' : ''}${e}`;
      meta.append(dates);
    }

    main.append(meta);
  }

  card.append(main);

  // In-place delete confirmation or standard action buttons.
  const isConfirming = profileState.confirmDeleteId === item.id;

  if (isConfirming) {
    const confirmBox = document.createElement('div');
    confirmBox.className = 'delete-confirm';
    confirmBox.setAttribute('role', 'region');
    confirmBox.setAttribute('aria-label', 'Confirm delete');

    const displayName = item.name || item.title || item.course;
    const promptP = document.createElement('p');
    promptP.className = 'delete-prompt';
    promptP.textContent = `Delete ${displayName}? This cannot be undone.`;

    const actions = document.createElement('div');
    actions.className = 'delete-actions';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger confirm-delete-btn';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      delBtn.disabled = true;
      try {
        const res = await fetch(`/api/${tabKey}/${item.id}`, { method: 'DELETE' });
        if (res.ok) {
          profileState.confirmDeleteId = null;
          await loadProfileData();
          drawProfileView(container);
        } else {
          promptP.textContent = 'Could not delete item. Please try again.';
          delBtn.disabled = false;
        }
      } catch (err) {
        promptP.textContent = 'Error deleting item.';
        delBtn.disabled = false;
      }
    });

    const keepBtn = document.createElement('button');
    keepBtn.type = 'button';
    keepBtn.className = 'btn btn-secondary';
    keepBtn.textContent = 'Keep it';
    keepBtn.addEventListener('click', () => {
      profileState.confirmDeleteId = null;
      drawProfileView(container);
    });

    actions.append(delBtn, keepBtn);
    confirmBox.append(promptP, actions);
    card.append(confirmBox);
  } else {
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    // Edit button (grey).
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-secondary btn-edit';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      profileState.editingItem = item;
      profileState.isAdding = false;
      profileState.confirmDeleteId = null;
      drawProfileView(container);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Delete button (red: the only red element on the page).
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-danger-outline btn-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      profileState.confirmDeleteId = item.id;
      drawProfileView(container);
    });

    actions.append(editBtn, deleteBtn);
    card.append(actions);
  }

  return card;
}

// Jobs state.
const jobsState = {
  jobs: [],
  counts: {
    all: 0,
    to_apply: 0,
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    no_reply: 0,
    skipped: 0,
    stale: 0,
  },
  sources: ['Other'],
  roleTypes: ['Other'],
  stageFilter: 'all',
  sortChoice: 'closing_date',
  isAdding: false,
};

// Computes today's date in Asia/Colombo (YYYY-MM-DD).
function getTodayColombo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Stage chip definitions.
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
];

// Returns SVG shape plus label for a job's stage.
function renderStageBadge(stage, isStale) {
  if (isStale) {
    return `
      <span class="job-stage">
        <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <polygon points="7,1.5 12.5,7 7,12.5 1.5,7" fill="none" stroke="var(--grey)" stroke-width="1.5"/>
        </svg>
        <span>stale</span>
      </span>
    `;
  }

  switch (stage) {
    case 'to_apply':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--grey)" stroke-width="1.5" stroke-dasharray="2 2"/>
          </svg>
          <span>To apply</span>
        </span>
      `;
    case 'applied':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--grey)" stroke-width="1.5"/>
          </svg>
          <span>Applied</span>
        </span>
      `;
    case 'screening':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--blue)" stroke-width="1.5"/>
          </svg>
          <span>Screening</span>
        </span>
      `;
    case 'interview':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="var(--blue)"/>
          </svg>
          <span>Interview</span>
        </span>
      `;
    case 'offer':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="20" height="12" viewBox="0 0 20 12" aria-hidden="true">
            <rect x="1" y="1" width="18" height="10" rx="5" fill="var(--blue)"/>
          </svg>
          <span>Offer</span>
        </span>
      `;
    case 'rejected':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="var(--text)"/>
          </svg>
          <span>Rejected</span>
        </span>
      `;
    case 'no_reply':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--grey)" stroke-width="1.5" stroke-dasharray="3.5 2"/>
          </svg>
          <span>No reply</span>
        </span>
      `;
    case 'skipped':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="2.5" y="2.5" width="9" height="9" fill="none" stroke="var(--grey)" stroke-width="1.5"/>
          </svg>
          <span>Skipped</span>
        </span>
      `;
    default:
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--grey)" stroke-width="1.5"/>
          </svg>
          <span>${escapeHtml(stage)}</span>
        </span>
      `;
  }
}

// Builds the summary counts line for the Jobs screen.
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
    if (cnt > 0) {
      parts.push(`${cnt} ${s.label}`);
    }
  });
  return parts.join('   ');
}

// Loads jobs data from the backend.
async function loadJobsData() {
  const url = `/api/jobs?stage=${encodeURIComponent(jobsState.stageFilter)}&sort=${encodeURIComponent(jobsState.sortChoice)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Could not load jobs');
  }
  const data = await res.json();
  jobsState.jobs = data.jobs || [];
  jobsState.counts = data.counts || {};
  jobsState.sources = data.sources || ['Other'];
  jobsState.roleTypes = data.roleTypes || ['Other'];
}

// Renders the Jobs list view.
async function renderJobs(container) {
  container.innerHTML = '<p class="muted">Loading jobs...</p>';

  try {
    await loadJobsData();
  } catch (err) {
    container.innerHTML = `<p class="field-error">Error loading jobs: ${escapeHtml(err.message)}</p>`;
    return;
  }

  drawJobsView(container);
}

// Redraws the Jobs view based on current state.
function drawJobsView(container) {
  const shell = document.createElement('div');
  shell.className = 'jobs-shell';

  // 1. Top bar: Heading, subtitle, and primary "+ Add job" button.
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
    jobsState.isAdding = !jobsState.isAdding;
    drawJobsView(container);
    if (jobsState.isAdding) {
      const pasteEl = document.getElementById('job-paste');
      if (pasteEl) pasteEl.focus();
    }
  });

  topBar.append(headerText, addJobBtn);
  shell.append(topBar);

  // 2. Counts line.
  const countsBox = document.createElement('div');
  countsBox.className = 'jobs-counts';
  countsBox.textContent = buildJobsCountsLine(jobsState.counts);
  shell.append(countsBox);

  // 3. Add job form (opens above the list if isAdding is true).
  if (jobsState.isAdding) {
    const formPanel = createAddJobForm(container);
    shell.append(formPanel);
  }

  // 4. Controls: Stage chips and Sort choice.
  const controlsBar = document.createElement('div');
  controlsBar.className = 'jobs-controls';

  // Stage chips.
  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'stage-chips';
  chipsContainer.setAttribute('role', 'group');
  chipsContainer.setAttribute('aria-label', 'Filter jobs by stage');

  STAGE_CHIPS.forEach((chip) => {
    const chipBtn = document.createElement('button');
    chipBtn.type = 'button';
    chipBtn.className = 'stage-chip';
    const isChosen = jobsState.stageFilter === chip.key;
    chipBtn.setAttribute('aria-pressed', isChosen ? 'true' : 'false');

    const count = jobsState.counts[chip.key] || 0;
    chipBtn.textContent = `${isChosen ? '✓ ' : ''}${chip.label} (${count})`;

    chipBtn.addEventListener('click', async () => {
      if (jobsState.stageFilter !== chip.key) {
        jobsState.stageFilter = chip.key;
        await loadJobsData();
        drawJobsView(container);
      }
    });

    chipsContainer.append(chipBtn);
  });

  // Sort choice.
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
  if (jobsState.sortChoice === 'closing_date') optClosing.selected = true;

  const optAdded = document.createElement('option');
  optAdded.value = 'date_added';
  optAdded.textContent = 'Date added';
  if (jobsState.sortChoice === 'date_added') optAdded.selected = true;

  sortSelect.append(optClosing, optAdded);

  sortSelect.addEventListener('change', async () => {
    jobsState.sortChoice = sortSelect.value;
    await loadJobsData();
    drawJobsView(container);
  });

  sortGroup.append(sortLabel, sortSelect);
  controlsBar.append(chipsContainer, sortGroup);
  shell.append(controlsBar);

  // 5. Job list or empty filter state.
  if (jobsState.jobs.length === 0) {
    const emptyBox = document.createElement('div');
    emptyBox.className = 'empty-state';

    if (jobsState.stageFilter !== 'all') {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'empty-text';
      emptyMsg.textContent = 'No jobs in this stage.';

      const showAllBtn = document.createElement('button');
      showAllBtn.type = 'button';
      showAllBtn.className = 'btn btn-secondary';
      showAllBtn.textContent = 'Show all jobs';
      showAllBtn.addEventListener('click', async () => {
        jobsState.stageFilter = 'all';
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
        jobsState.isAdding = true;
        drawJobsView(container);
        const pasteEl = document.getElementById('job-paste');
        if (pasteEl) pasteEl.focus();
      });

      emptyBox.append(emptyMsg, emptyAddBtn);
    }

    shell.append(emptyBox);
  } else {
    const list = document.createElement('div');
    list.className = 'jobs-list';

    jobsState.jobs.forEach((job, index) => {
      const row = document.createElement('a');
      row.href = `#job/${job.id}`;
      row.className = 'job-row';
      row.id = `job-row-${job.id}`;

      // Left section: index, company, title, tags.
      const left = document.createElement('div');
      left.className = 'job-row-left';

      const idxSpan = document.createElement('span');
      idxSpan.className = 'job-index';
      idxSpan.textContent = `#${index + 1}`;

      const main = document.createElement('div');
      main.className = 'job-main';

      const comp = document.createElement('span');
      comp.className = 'job-company';
      comp.textContent = job.company;

      const title = document.createElement('h3');
      title.className = 'job-title';
      title.textContent = job.title;

      const tags = document.createElement('div');
      tags.className = 'job-tags';

      if (job.work_mode) {
        const wmTag = document.createElement('span');
        wmTag.className = 'meta-chip';
        wmTag.textContent = job.work_mode;
        tags.append(wmTag);
      }

      if (job.level) {
        const lvlTag = document.createElement('span');
        lvlTag.className = 'meta-chip';
        lvlTag.textContent = job.level;
        tags.append(lvlTag);
      }

      if (job.role_type) {
        const rtTag = document.createElement('span');
        rtTag.className = 'meta-chip';
        rtTag.textContent = job.role_type;
        tags.append(rtTag);
      }

      main.append(comp, title);
      if (tags.childNodes.length > 0) main.append(tags);

      left.append(idxSpan, main);

      // Right section: closing date, stage shape + word.
      const right = document.createElement('div');
      right.className = 'job-row-right';

      const closingSpan = document.createElement('span');
      closingSpan.className = 'job-closing';
      closingSpan.textContent = job.closing_date ? `Closes ${job.closing_date}` : 'No closing date';

      const stageHolder = document.createElement('div');
      stageHolder.innerHTML = renderStageBadge(job.stage, Boolean(job.is_stale));

      right.append(closingSpan, stageHolder);

      row.append(left, right);
      list.append(row);
    });

    shell.append(list);
  }

  container.innerHTML = '';
  container.append(shell);
}

// Creates the Add job form.
function createAddJobForm(container) {
  const panel = document.createElement('div');
  panel.className = 'form-panel';

  const formTitle = document.createElement('h2');
  formTitle.className = 'form-title';
  formTitle.textContent = 'Add job';

  const form = document.createElement('form');
  form.noValidate = true;

  // 1. Paste box first.
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

  // Helper to add a form field.
  function addField(labelStr, inputEl, errorId, parent = form) {
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

  // Row 1: Title and Company.
  const row1 = document.createElement('div');
  row1.className = 'form-row';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.id = 'job-title';
  titleInput.className = 'form-input';
  titleInput.placeholder = 'e.g. Frontend Engineer';
  titleInput.required = true;
  addField('Job title *', titleInput, 'job-title-error', row1);

  const compInput = document.createElement('input');
  compInput.type = 'text';
  compInput.id = 'job-company';
  compInput.className = 'form-input';
  compInput.placeholder = 'e.g. Acme Corp';
  compInput.required = true;
  addField('Company *', compInput, 'job-company-error', row1);

  form.append(row1);

  // Row 2: Source and Role Type.
  const row2 = document.createElement('div');
  row2.className = 'form-row';

  const sourceSelect = document.createElement('select');
  sourceSelect.id = 'job-source';
  sourceSelect.className = 'form-select';

  // Ensure "Other" is last.
  const cleanSources = jobsState.sources.filter((s) => s.toLowerCase() !== 'other');
  cleanSources.push('Other');

  cleanSources.forEach((src) => {
    const opt = document.createElement('option');
    opt.value = src;
    opt.textContent = src;
    if (src === 'Other') opt.selected = true;
    sourceSelect.append(opt);
  });
  addField('Source', sourceSelect, 'job-source-error', row2);

  const roleSelect = document.createElement('select');
  roleSelect.id = 'job-role-type';
  roleSelect.className = 'form-select';

  const roleDefaultOpt = document.createElement('option');
  roleDefaultOpt.value = '';
  roleDefaultOpt.textContent = 'Select role type (optional)';
  roleSelect.append(roleDefaultOpt);

  jobsState.roleTypes.forEach((rt) => {
    const opt = document.createElement('option');
    opt.value = rt;
    opt.textContent = rt;
    roleSelect.append(opt);
  });
  addField('Role type (optional)', roleSelect, 'job-role-error', row2);

  form.append(row2);

  // Row 3: Work mode, Level, and Link.
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
  addField('Work mode (optional)', wmSelect, 'job-wm-error', row3);

  const lvlInput = document.createElement('input');
  lvlInput.type = 'text';
  lvlInput.id = 'job-level';
  lvlInput.className = 'form-input';
  lvlInput.placeholder = 'e.g. Junior, Mid, Senior, Lead';
  addField('Level (optional)', lvlInput, 'job-lvl-error', row3);

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.id = 'job-url';
  urlInput.className = 'form-input';
  urlInput.placeholder = 'https://...';
  addField('Job link (optional)', urlInput, 'job-url-error', row3);

  form.append(row3);

  // Row 4: Date found, Posted date, Closing date.
  const row4 = document.createElement('div');
  row4.className = 'form-row';

  const foundInput = document.createElement('input');
  foundInput.type = 'text';
  foundInput.id = 'job-found-date';
  foundInput.className = 'form-input';
  foundInput.placeholder = 'YYYY-MM-DD';
  foundInput.value = getTodayColombo();
  addField('Date found', foundInput, 'job-found-date-error', row4);

  const postedInput = document.createElement('input');
  postedInput.type = 'text';
  postedInput.id = 'job-posted-date';
  postedInput.className = 'form-input';
  postedInput.placeholder = 'YYYY-MM-DD';
  addField('Posted date (optional)', postedInput, 'job-posted-date-error', row4);

  const closingInput = document.createElement('input');
  closingInput.type = 'text';
  closingInput.id = 'job-closing-date';
  closingInput.className = 'form-input';
  closingInput.placeholder = 'YYYY-MM-DD';
  addField('Closing date (optional)', closingInput, 'job-closing-date-error', row4);

  form.append(row4);

  // Row 5: Description.
  const descArea = document.createElement('textarea');
  descArea.id = 'job-desc';
  descArea.className = 'form-textarea';
  descArea.placeholder = 'Full job description or notes from the advert...';
  addField('Description (optional)', descArea, 'job-desc-error');

  // Sync pasteArea to descArea.
  pasteArea.addEventListener('input', () => {
    descArea.value = pasteArea.value;
  });

  // Row 6: Notes.
  const notesArea = document.createElement('textarea');
  notesArea.id = 'job-notes';
  notesArea.className = 'form-textarea';
  notesArea.placeholder = 'Personal notes, referrals, follow-up ideas...';
  addField('Notes (optional)', notesArea, 'job-notes-error');

  // Duplicate warning banner.
  const duplicateWarning = document.createElement('div');
  duplicateWarning.className = 'warning-banner';
  duplicateWarning.id = 'job-duplicate-warning';
  duplicateWarning.style.display = 'none';
  duplicateWarning.textContent = 'A job with this company and title already exists in your list.';
  form.append(duplicateWarning);

  // Check duplicate on input.
  function checkDuplicate() {
    const t = titleInput.value.trim().toLowerCase();
    const c = compInput.value.trim().toLowerCase();
    if (t && c) {
      const match = jobsState.jobs.find(
        (j) => j.title.toLowerCase() === t && j.company.toLowerCase() === c
      );
      if (match) {
        duplicateWarning.style.display = 'block';
        return;
      }
    }
    duplicateWarning.style.display = 'none';
  }

  titleInput.addEventListener('input', checkDuplicate);
  compInput.addEventListener('input', checkDuplicate);

  // Form actions.
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
    jobsState.isAdding = false;
    drawJobsView(container);
  });

  const saveStatus = document.createElement('span');
  saveStatus.className = 'save-status';
  saveStatus.id = 'job-save-status';
  saveStatus.setAttribute('aria-live', 'polite');

  actions.append(saveBtn, cancelBtn, saveStatus);
  form.append(actions);

  // Form submission handler.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous errors.
    form.querySelectorAll('.field-error').forEach((el) => {
      el.textContent = '';
      el.style.display = 'none';
    });

    let isValid = true;
    function showError(fieldId, errorId, message) {
      isValid = false;
      const errEl = document.getElementById(errorId);
      if (errEl) {
        errEl.textContent = message;
        errEl.style.display = 'block';
      }
      const inputEl = document.getElementById(fieldId);
      if (inputEl) inputEl.focus();
    }

    const title = titleInput.value.trim();
    if (!title) {
      showError('job-title', 'job-title-error', 'Job title is required.');
      return;
    }

    const company = compInput.value.trim();
    if (!company) {
      showError('job-company', 'job-company-error', 'Company name is required.');
      return;
    }

    function checkDate(val) {
      if (!val) return true;
      return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(val);
    }

    const foundDate = foundInput.value.trim();
    if (foundDate && !checkDate(foundDate)) {
      showError('job-found-date', 'job-found-date-error', 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).');
      return;
    }

    const postedDate = postedInput.value.trim();
    if (postedDate && !checkDate(postedDate)) {
      showError('job-posted-date', 'job-posted-date-error', 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).');
      return;
    }

    const closingDate = closingInput.value.trim();
    if (closingDate && !checkDate(closingDate)) {
      showError('job-closing-date', 'job-closing-date-error', 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).');
      return;
    }

    const urlVal = urlInput.value.trim();
    if (urlVal && !urlVal.startsWith('http://') && !urlVal.startsWith('https://')) {
      showError('job-url', 'job-url-error', 'Job link must start with http:// or https://.');
      return;
    }

    if (!isValid) return;

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
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        saveBtn.disabled = false;
        const firstErr = form.querySelector('.field-error');
        if (firstErr) {
          firstErr.textContent = data.error || 'Failed to save job.';
          firstErr.style.display = 'block';
        }
        return;
      }

      // Show "Saved" next to button.
      saveStatus.textContent = 'Saved';

      // Navigate to the job page at /#job/<id> after 1 second.
      setTimeout(() => {
        jobsState.isAdding = false;
        location.hash = `#job/${data.id}`;
      }, 1000);
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

  panel.append(formTitle, form);
  return panel;
}

// Creates the Edit Job form panel.
function createEditJobPanel(job, onSaveSuccess, onCancel) {
  const panel = document.createElement('section');
  panel.className = 'job-page-card';
  panel.id = 'edit-job-panel';
  panel.setAttribute('aria-labelledby', 'edit-job-title');

  const formTitle = document.createElement('h2');
  formTitle.id = 'edit-job-title';
  formTitle.className = 'card-heading';
  formTitle.textContent = 'Edit job';

  const form = document.createElement('form');
  form.className = 'job-form';
  form.noValidate = true;

  function addField(labelStr, inputEl, errorId, parent = form) {
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

  // Row 1: Title and Company.
  const row1 = document.createElement('div');
  row1.className = 'form-row';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.id = 'edit-job-title-input';
  titleInput.className = 'form-input';
  titleInput.value = job.title || '';
  titleInput.required = true;
  addField('Job title *', titleInput, 'edit-job-title-error', row1);

  const compInput = document.createElement('input');
  compInput.type = 'text';
  compInput.id = 'edit-job-company-input';
  compInput.className = 'form-input';
  compInput.value = job.company || '';
  compInput.required = true;
  addField('Company *', compInput, 'edit-job-company-error', row1);

  form.append(row1);

  // Row 2: Source and Role Type.
  const row2 = document.createElement('div');
  row2.className = 'form-row';

  const sourceSelect = document.createElement('select');
  sourceSelect.id = 'edit-job-source';
  sourceSelect.className = 'form-select';

  const cleanSources = (jobsState.sources && jobsState.sources.length > 0 ? jobsState.sources : ['LinkedIn', 'TopJobs', 'Roar', 'Company site', 'Direct email', 'Referral', 'Other'])
    .filter((s) => s.toLowerCase() !== 'other');
  cleanSources.push('Other');

  cleanSources.forEach((src) => {
    const opt = document.createElement('option');
    opt.value = src;
    opt.textContent = src;
    if (src === (job.source || 'Other')) opt.selected = true;
    sourceSelect.append(opt);
  });
  addField('Source', sourceSelect, 'edit-job-source-error', row2);

  const roleSelect = document.createElement('select');
  roleSelect.id = 'edit-job-role-type';
  roleSelect.className = 'form-select';

  const roleDefaultOpt = document.createElement('option');
  roleDefaultOpt.value = '';
  roleDefaultOpt.textContent = 'Select role type (optional)';
  roleSelect.append(roleDefaultOpt);

  const roleTypes = jobsState.roleTypes && jobsState.roleTypes.length > 0
    ? jobsState.roleTypes
    : ['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'DevOps / Cloud', 'QA / Test Engineer', 'Product / Design', 'Other'];

  roleTypes.forEach((rt) => {
    const opt = document.createElement('option');
    opt.value = rt;
    opt.textContent = rt;
    if (rt === job.role_type) opt.selected = true;
    roleSelect.append(opt);
  });
  addField('Role type (optional)', roleSelect, 'edit-job-role-error', row2);

  form.append(row2);

  // Row 3: Work mode, Level, and Link.
  const row3 = document.createElement('div');
  row3.className = 'form-row';

  const wmSelect = document.createElement('select');
  wmSelect.id = 'edit-job-work-mode';
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
    if (wm.val === (job.work_mode || '')) opt.selected = true;
    wmSelect.append(opt);
  });
  addField('Work mode (optional)', wmSelect, 'edit-job-wm-error', row3);

  const lvlInput = document.createElement('input');
  lvlInput.type = 'text';
  lvlInput.id = 'edit-job-level';
  lvlInput.className = 'form-input';
  lvlInput.placeholder = 'e.g. Junior, Mid, Senior, Lead';
  lvlInput.value = job.level || '';
  addField('Level (optional)', lvlInput, 'edit-job-lvl-error', row3);

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.id = 'edit-job-url';
  urlInput.className = 'form-input';
  urlInput.placeholder = 'https://...';
  urlInput.value = job.url || '';
  addField('Job link (optional)', urlInput, 'edit-job-url-error', row3);

  form.append(row3);

  // Row 4: Date found, Posted date, Closing date.
  const row4 = document.createElement('div');
  row4.className = 'form-row';

  const foundInput = document.createElement('input');
  foundInput.type = 'text';
  foundInput.id = 'edit-job-found-date';
  foundInput.className = 'form-input';
  foundInput.placeholder = 'YYYY-MM-DD';
  foundInput.value = job.found_date || getTodayColombo();
  addField('Date found', foundInput, 'edit-job-found-date-error', row4);

  const postedInput = document.createElement('input');
  postedInput.type = 'text';
  postedInput.id = 'edit-job-posted-date';
  postedInput.className = 'form-input';
  postedInput.placeholder = 'YYYY-MM-DD';
  postedInput.value = job.posted_date || '';
  addField('Posted date (optional)', postedInput, 'edit-job-posted-date-error', row4);

  const closingInput = document.createElement('input');
  closingInput.type = 'text';
  closingInput.id = 'edit-job-closing-date';
  closingInput.className = 'form-input';
  closingInput.placeholder = 'YYYY-MM-DD';
  closingInput.value = job.closing_date || '';
  addField('Closing date (optional)', closingInput, 'edit-job-closing-date-error', row4);

  form.append(row4);

  // Row 5: Description.
  const descArea = document.createElement('textarea');
  descArea.id = 'edit-job-desc';
  descArea.className = 'form-textarea';
  descArea.placeholder = 'Full job description or notes from the advert...';
  descArea.value = job.description || '';
  addField('Description (optional)', descArea, 'edit-job-desc-error');

  // Row 6: Notes.
  const notesArea = document.createElement('textarea');
  notesArea.id = 'edit-job-notes';
  notesArea.className = 'form-textarea';
  notesArea.placeholder = 'Personal notes, referrals, follow-up ideas...';
  notesArea.value = job.notes || '';
  addField('Notes (optional)', notesArea, 'edit-job-notes-error');

  // Warning banner if title & company match another job.
  const duplicateWarning = document.createElement('div');
  duplicateWarning.className = 'warning-banner';
  duplicateWarning.id = 'edit-job-duplicate-warning';
  duplicateWarning.style.display = 'none';
  duplicateWarning.textContent = 'A job with this company and title already exists in your list.';
  form.append(duplicateWarning);

  function checkDuplicate() {
    const t = titleInput.value.trim().toLowerCase();
    const c = compInput.value.trim().toLowerCase();
    if (t && c && Array.isArray(jobsState.jobs)) {
      const match = jobsState.jobs.find(
        (j) => j.id !== job.id && j.title.toLowerCase() === t && j.company.toLowerCase() === c
      );
      if (match) {
        duplicateWarning.style.display = 'block';
        return;
      }
    }
    duplicateWarning.style.display = 'none';
  }

  titleInput.addEventListener('input', checkDuplicate);
  compInput.addEventListener('input', checkDuplicate);

  // Form actions.
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
  cancelBtn.addEventListener('click', onCancel);

  const saveStatus = document.createElement('span');
  saveStatus.className = 'save-status';
  saveStatus.id = 'edit-job-save-status';
  saveStatus.setAttribute('aria-live', 'polite');

  actions.append(saveBtn, cancelBtn, saveStatus);
  form.append(actions);

  // Form submit handler.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    form.querySelectorAll('.field-error').forEach((el) => {
      el.textContent = '';
      el.style.display = 'none';
    });

    let isValid = true;
    function showError(fieldId, errorId, message) {
      isValid = false;
      const errEl = document.getElementById(errorId);
      if (errEl) {
        errEl.textContent = message;
        errEl.style.display = 'block';
      }
      const inputEl = document.getElementById(fieldId);
      if (inputEl) inputEl.focus();
    }

    const title = titleInput.value.trim();
    if (!title) {
      showError('edit-job-title-input', 'edit-job-title-error', 'Job title is required.');
      return;
    }

    const company = compInput.value.trim();
    if (!company) {
      showError('edit-job-company-input', 'edit-job-company-error', 'Company name is required.');
      return;
    }

    function checkDate(val) {
      if (!val) return true;
      return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(val);
    }

    const foundDate = foundInput.value.trim();
    if (foundDate && !checkDate(foundDate)) {
      showError('edit-job-found-date', 'edit-job-found-date-error', 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).');
      return;
    }

    const postedDate = postedInput.value.trim();
    if (postedDate && !checkDate(postedDate)) {
      showError('edit-job-posted-date', 'edit-job-posted-date-error', 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).');
      return;
    }

    const closingDate = closingInput.value.trim();
    if (closingDate && !checkDate(closingDate)) {
      showError('edit-job-closing-date', 'edit-job-closing-date-error', 'Date must be in YYYY-MM-DD format (for example, 2026-11-30).');
      return;
    }

    const urlVal = urlInput.value.trim();
    if (urlVal && !urlVal.startsWith('http://') && !urlVal.startsWith('https://')) {
      showError('edit-job-url', 'edit-job-url-error', 'Job link must start with http:// or https://.');
      return;
    }

    if (!isValid) return;

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
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        saveBtn.disabled = false;
        const firstErr = form.querySelector('.field-error');
        if (firstErr) {
          firstErr.textContent = data.error || 'Failed to update job.';
          firstErr.style.display = 'block';
        }
        return;
      }

      saveStatus.textContent = 'Saved';
      setTimeout(() => {
        onSaveSuccess(data);
      }, 700);
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

  panel.append(formTitle, form);
  return panel;
}

// Renders the complete Job page at /#job/<id> (Phase 4).
async function renderJobPage(container, jobId) {
  container.innerHTML = '<p class="muted">Loading job details...</p>';

  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) {
      container.innerHTML = `
        <div class="job-detail-card">
          <h1 class="screen-title">Job not found</h1>
          <p class="muted">The requested job could not be found.</p>
          <p><a href="#jobs" class="back-link">← Back to jobs</a></p>
        </div>
      `;
      return;
    }

    let job = await res.json();
    document.title = `${job.title} | Shirube`;

    // Ensure settings are available for sources/roleTypes if user directly opened this URL.
    if (!jobsState.sources || jobsState.sources.length === 0) {
      try {
        const jobsRes = await fetch('/api/jobs?stage=all');
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          jobsState.sources = jobsData.sources || [];
          jobsState.roleTypes = jobsData.roleTypes || [];
          jobsState.jobs = jobsData.jobs || [];
        }
      } catch (_) {
        // Fallbacks are handled inside form
      }
    }

    let isEditing = false;
    let isConfirmingDelete = false;

    function drawJobView() {
      container.innerHTML = '';

      const shell = document.createElement('div');
      shell.className = 'job-page-shell';

      // 1. Back link at top.
      const backLink = document.createElement('a');
      backLink.href = '#jobs';
      backLink.className = 'back-link';
      backLink.textContent = '← Back to jobs';
      shell.append(backLink);

      // 2. Heading, company & stage, purpose.
      const header = document.createElement('header');
      header.className = 'job-page-header';

      const h1 = document.createElement('h1');
      h1.className = 'screen-title';
      h1.textContent = job.title;

      const meta = document.createElement('div');
      meta.className = 'job-page-meta';
      meta.innerHTML = `<span class="job-page-company">${escapeHtml(job.company)}</span> &nbsp;·&nbsp; ${renderStageBadge(job.stage, Boolean(job.is_stale))}`;

      const intro = document.createElement('p');
      intro.className = 'profile-intro';
      intro.textContent = 'Record what happened with this job. Shirube uses this to show follow-ups.';

      header.append(h1, meta, intro);
      shell.append(header);

      // 3. "What happened" section.
      const whatHappenedCard = document.createElement('section');
      whatHappenedCard.className = 'job-page-card';
      whatHappenedCard.setAttribute('aria-labelledby', 'heading-what-happened');

      const whHeading = document.createElement('h2');
      whHeading.id = 'heading-what-happened';
      whHeading.className = 'card-heading';
      whHeading.textContent = 'What happened';

      const buttonsRow = document.createElement('div');
      buttonsRow.className = 'outcome-buttons-row';

      const outcomeFeedback = document.createElement('span');
      outcomeFeedback.className = 'save-status';
      outcomeFeedback.id = 'outcome-save-status';
      outcomeFeedback.setAttribute('aria-live', 'polite');

      const outcomeError = document.createElement('div');
      outcomeError.className = 'field-error';
      outcomeError.id = 'outcome-error';
      outcomeError.style.display = 'none';

      // 6 outcome buttons.
      const outcomes = [
        { key: 'applied', label: 'Applied', stage: 'applied' },
        { key: 'reply', label: 'Reply', stage: 'screening' },
        { key: 'interview', label: 'Interview', stage: 'interview' },
        { key: 'offer', label: 'Offer', stage: 'offer' },
        { key: 'rejected', label: 'Rejected', stage: 'rejected' },
        { key: 'no_reply', label: 'No reply', stage: 'no_reply' },
      ];

      outcomes.forEach((o) => {
        const isActive = job.stage === o.stage;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'outcome-btn';
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        btn.textContent = isActive ? `✓ ${o.label}` : o.label;

        btn.addEventListener('click', async () => {
          // Clicking the outcome the job already has does nothing.
          if (isActive) return;

          outcomeError.textContent = '';
          outcomeError.style.display = 'none';
          outcomeFeedback.textContent = '';

          try {
            const payload = { outcome: o.key };
            if (o.key === 'rejected') {
              const reasonSelect = document.getElementById('job-rejection-reason');
              payload.rejection_reason = reasonSelect
                ? reasonSelect.value
                : (job.application?.rejection_reason || 'Other');
            }

            const res = await fetch(`/api/jobs/${job.id}/outcome`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) {
              outcomeError.textContent = data.error || 'Failed to update outcome.';
              outcomeError.style.display = 'block';
              return;
            }

            job = data;
            document.title = `${job.title} | Shirube`;
            drawJobView();

            const newFeedback = document.getElementById('outcome-save-status');
            if (newFeedback) {
              newFeedback.textContent = 'Saved';
              setTimeout(() => {
                if (newFeedback.textContent === 'Saved') {
                  newFeedback.textContent = '';
                }
              }, 3000);
            }
          } catch (err) {
            outcomeError.textContent = err.message || 'An error occurred.';
            outcomeError.style.display = 'block';
          }
        });

        buttonsRow.append(btn);
      });

      buttonsRow.append(outcomeFeedback);

      // Rejection reason dropdown - appears ONLY when Rejected is chosen.
      const rejectionBox = document.createElement('div');
      rejectionBox.className = 'rejection-reason-box';
      rejectionBox.id = 'rejection-reason-box';

      if (job.stage === 'rejected') {
        rejectionBox.style.display = 'flex';
      } else {
        rejectionBox.style.display = 'none';
      }

      const rLabel = document.createElement('label');
      rLabel.htmlFor = 'job-rejection-reason';
      rLabel.className = 'form-label';
      rLabel.textContent = 'Rejection reason';

      const rSelect = document.createElement('select');
      rSelect.id = 'job-rejection-reason';
      rSelect.className = 'form-select';

      const reasons = job.rejection_reasons || [
        'No reply to CV',
        'Skills gap',
        'Salary',
        'Role filled',
        'Other',
      ];
      const activeReason = job.application?.rejection_reason || 'Other';

      reasons.forEach((reason) => {
        const opt = document.createElement('option');
        opt.value = reason;
        opt.textContent = reason;
        if (reason === activeReason) opt.selected = true;
        rSelect.append(opt);
      });

      rSelect.addEventListener('change', async () => {
        outcomeError.textContent = '';
        outcomeError.style.display = 'none';
        try {
          const res = await fetch(`/api/jobs/${job.id}/outcome`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome: 'rejected', rejection_reason: rSelect.value }),
          });
          const data = await res.json();
          if (!res.ok) {
            outcomeError.textContent = data.error || 'Failed to update rejection reason.';
            outcomeError.style.display = 'block';
            return;
          }
          job = data;
          drawJobView();

          const newFeedback = document.getElementById('outcome-save-status');
          if (newFeedback) {
            newFeedback.textContent = 'Saved';
            setTimeout(() => {
              if (newFeedback.textContent === 'Saved') {
                newFeedback.textContent = '';
              }
            }, 3000);
          }
        } catch (err) {
          outcomeError.textContent = err.message || 'An error occurred.';
          outcomeError.style.display = 'block';
        }
      });

      rejectionBox.append(rLabel, rSelect);
      whatHappenedCard.append(whHeading, buttonsRow, rejectionBox, outcomeError);
      shell.append(whatHappenedCard);

      // 4. Edit job form (opens above details).
      if (isEditing) {
        const editPanel = createEditJobPanel(
          job,
          (updatedJob) => {
            job = updatedJob;
            isEditing = false;
            document.title = `${job.title} | Shirube`;
            drawJobView();
          },
          () => {
            isEditing = false;
            drawJobView();
          }
        );
        shell.append(editPanel);
      }

      // 5. Details section (10 items). Empty values show "Not added yet".
      const detailsCard = document.createElement('section');
      detailsCard.className = 'job-page-card';
      detailsCard.setAttribute('aria-labelledby', 'heading-details');

      const dtHeading = document.createElement('h2');
      dtHeading.id = 'heading-details';
      dtHeading.className = 'card-heading';
      dtHeading.textContent = 'Details';

      const detailsGrid = document.createElement('div');
      detailsGrid.className = 'details-grid';

      function createDetailItem(label, value, isLink = false) {
        const div = document.createElement('div');
        div.className = 'detail-item';

        const dt = document.createElement('span');
        dt.className = 'detail-label';
        dt.textContent = label;

        const dd = document.createElement('span');
        dd.className = 'detail-value';

        if (!value) {
          dd.classList.add('is-empty');
          dd.textContent = 'Not added yet';
        } else if (isLink) {
          const a = document.createElement('a');
          a.href = value;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'link';
          a.textContent = value;
          dd.append(a);
        } else {
          dd.textContent = value;
        }

        div.append(dt, dd);
        return div;
      }

      detailsGrid.append(
        createDetailItem('Source', job.source),
        createDetailItem('Role type', job.role_type),
        createDetailItem('Work mode', job.work_mode),
        createDetailItem('Level', job.level),
        createDetailItem('Date found', job.found_date),
        createDetailItem('Applied date', job.application?.applied_date),
        createDetailItem('Posted date', job.posted_date),
        createDetailItem('Closing date', job.closing_date),
        createDetailItem('Follow-up due date', job.due_date),
        createDetailItem('Job link', job.url, true)
      );

      detailsCard.append(dtHeading, detailsGrid);
      shell.append(detailsCard);

      // 6. Timeline: each reply and status change, oldest first, with its date.
      const timelineCard = document.createElement('section');
      timelineCard.className = 'job-page-card';
      timelineCard.setAttribute('aria-labelledby', 'heading-timeline');

      const tlHeading = document.createElement('h2');
      tlHeading.id = 'heading-timeline';
      tlHeading.className = 'card-heading';
      tlHeading.textContent = 'Timeline';

      // Build events list.
      const events = [];

      if (job.found_date) {
        events.push({
          date: job.found_date,
          text: `Job found (${job.source || 'Other'})`,
        });
      }

      if (job.application?.applied_date) {
        events.push({
          date: job.application.applied_date,
          text: 'Application submitted',
        });
      }

      const kindLabels = {
        replied: 'Reply received (screening)',
        first_interview: 'First interview',
        second_interview: 'Second interview',
        test_task: 'Test task',
        offer: 'Offer received',
        rejected: 'Rejected',
      };

      if (Array.isArray(job.replies)) {
        job.replies.forEach((r) => {
          let desc = kindLabels[r.kind] || r.kind;
          if (r.kind === 'rejected' && job.application?.rejection_reason) {
            desc = `Rejected: ${job.application.rejection_reason}`;
          }
          if (r.note) {
            desc += ` (${r.note})`;
          }
          events.push({
            date: r.happened_on,
            text: desc,
          });
        });
      }

      if (job.application?.status === 'no_reply' && (!job.replies || job.replies.length === 0)) {
        events.push({
          date: job.application.applied_date || job.found_date,
          text: 'Marked as no reply',
        });
      }

      // Sort chronological, oldest first.
      events.sort((a, b) => a.date.localeCompare(b.date));

      const timelineList = document.createElement('div');
      timelineList.className = 'timeline-list';

      if (events.length === 0) {
        const noEvents = document.createElement('p');
        noEvents.className = 'muted';
        noEvents.textContent = 'No events recorded yet.';
        timelineList.append(noEvents);
      } else {
        events.forEach((ev) => {
          const item = document.createElement('div');
          item.className = 'timeline-item';

          const d = document.createElement('span');
          d.className = 'timeline-date';
          d.textContent = ev.date;

          const t = document.createElement('span');
          t.className = 'timeline-text';
          t.textContent = ev.text;

          item.append(d, t);
          timelineList.append(item);
        });
      }

      timelineCard.append(tlHeading, timelineList);
      shell.append(timelineCard);

      // 7. Notes and description: two text areas, each with a visible label.
      const notesCard = document.createElement('section');
      notesCard.className = 'job-page-card';
      notesCard.setAttribute('aria-labelledby', 'heading-notes-desc');

      const ndHeading = document.createElement('h2');
      ndHeading.id = 'heading-notes-desc';
      ndHeading.className = 'card-heading';
      ndHeading.textContent = 'Notes and description';

      const notesGroup = document.createElement('div');
      notesGroup.className = 'form-group';

      const notesLabel = document.createElement('label');
      notesLabel.htmlFor = 'job-view-notes';
      notesLabel.className = 'form-label';
      notesLabel.textContent = 'Notes';

      const notesArea = document.createElement('textarea');
      notesArea.id = 'job-view-notes';
      notesArea.className = 'form-textarea';
      notesArea.rows = 3;
      notesArea.readOnly = true;
      notesArea.placeholder = 'Not added yet';
      notesArea.value = job.notes || '';
      notesGroup.append(notesLabel, notesArea);

      const descGroup = document.createElement('div');
      descGroup.className = 'form-group';

      const descLabel = document.createElement('label');
      descLabel.htmlFor = 'job-view-desc';
      descLabel.className = 'form-label';
      descLabel.textContent = 'Description';

      const descArea = document.createElement('textarea');
      descArea.id = 'job-view-desc';
      descArea.className = 'form-textarea';
      descArea.rows = 6;
      descArea.readOnly = true;
      descArea.placeholder = 'Not added yet';
      descArea.value = job.description || '';
      descGroup.append(descLabel, descArea);

      notesCard.append(ndHeading, notesGroup, descGroup);
      shell.append(notesCard);

      // 8. Edit job and Delete job at bottom.
      const footerActions = document.createElement('div');
      footerActions.className = 'job-footer-actions';
      footerActions.id = 'job-footer-actions';

      if (!isConfirmingDelete) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-secondary';
        editBtn.id = 'btn-edit-job';
        editBtn.textContent = isEditing ? 'Close edit form' : 'Edit job';
        editBtn.addEventListener('click', () => {
          isEditing = !isEditing;
          drawJobView();
          if (isEditing) {
            const formEl = document.getElementById('edit-job-panel');
            if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
          }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.id = 'btn-delete-job';
        deleteBtn.textContent = 'Delete job';
        deleteBtn.addEventListener('click', () => {
          isConfirmingDelete = true;
          drawJobView();
        });

        footerActions.append(editBtn, deleteBtn);
      } else {
        const confirmBox = document.createElement('div');
        confirmBox.className = 'delete-confirm';
        confirmBox.setAttribute('role', 'alert');

        const promptText = document.createElement('p');
        promptText.className = 'delete-prompt';
        promptText.textContent = `Delete ${job.company} ${job.title}? This also deletes its application and replies. It cannot be undone.`;

        const deleteActions = document.createElement('div');
        deleteActions.className = 'delete-actions';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'btn btn-danger';
        confirmBtn.id = 'btn-confirm-delete';
        confirmBtn.textContent = 'Delete';

        const cancelConfirmBtn = document.createElement('button');
        cancelConfirmBtn.type = 'button';
        cancelConfirmBtn.className = 'btn btn-secondary';
        cancelConfirmBtn.id = 'btn-cancel-delete';
        cancelConfirmBtn.textContent = 'Keep it';

        cancelConfirmBtn.addEventListener('click', () => {
          isConfirmingDelete = false;
          drawJobView();
        });

        confirmBtn.addEventListener('click', async () => {
          confirmBtn.disabled = true;
          cancelConfirmBtn.disabled = true;
          try {
            const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
            if (!res.ok) {
              const data = await res.json();
              alert(data.error || 'Failed to delete job.');
              confirmBtn.disabled = false;
              cancelConfirmBtn.disabled = false;
              return;
            }
            location.hash = '#jobs';
          } catch (err) {
            alert(err.message || 'Error deleting job.');
            confirmBtn.disabled = false;
            cancelConfirmBtn.disabled = false;
          }
        });

        deleteActions.append(confirmBtn, cancelConfirmBtn);
        confirmBox.append(promptText, deleteActions);
        footerActions.append(confirmBox);
      }

      shell.append(footerActions);
      container.append(shell);
    }

    drawJobView();
  } catch (err) {
    container.innerHTML = `<p class="field-error">Error loading job: ${escapeHtml(err.message)}</p>`;
  }
}

// Renders the Follow-ups screen at #followups (Phase 5).
async function renderFollowups(container) {
  container.innerHTML = '<p class="muted">Loading follow-ups...</p>';

  try {
    const res = await fetch('/api/followups');
    if (!res.ok) {
      throw new Error('Could not load follow-ups.');
    }
    const data = await res.json();
    drawFollowupsView(container, data);
  } catch (err) {
    container.innerHTML = `<p class="field-error">Error loading follow-ups: ${escapeHtml(err.message)}</p>`;
  }
}

function drawFollowupsView(container, data) {
  const { coming_up = [], overdue = [] } = data;
  container.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'followups-shell';

  // Heading and purpose.
  const header = document.createElement('header');
  const h1 = document.createElement('h1');
  h1.className = 'screen-title';
  h1.textContent = 'Follow-ups';

  const intro = document.createElement('p');
  intro.className = 'profile-intro';
  intro.textContent = 'Track upcoming and overdue follow-ups for your active job applications.';

  header.append(h1, intro);
  shell.append(header);

  // Helper to create a job row in a follow-up list.
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

  // Check if both sections are empty.
  if (coming_up.length === 0 && overdue.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const emptyText = document.createElement('p');
    emptyText.className = 'empty-text';
    emptyText.textContent = 'No follow-ups due. Add a job or apply to one.';

    const addBtn = document.createElement('a');
    addBtn.href = '#jobs';
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ Add job';

    emptyState.append(emptyText, addBtn);
    shell.append(emptyState);
    container.append(shell);
    return;
  }

  const sectionsDiv = document.createElement('div');
  sectionsDiv.className = 'followups-sections';

  // Overdue section.
  const overdueSection = document.createElement('section');
  overdueSection.className = 'followups-section';
  overdueSection.setAttribute('aria-labelledby', 'heading-overdue');

  const overdueHeading = document.createElement('h2');
  overdueHeading.id = 'heading-overdue';
  overdueHeading.className = 'card-heading';
  overdueHeading.textContent = `Overdue (${overdue.length})`;
  overdueSection.append(overdueHeading);

  if (overdue.length === 0) {
    const emptyNote = document.createElement('p');
    emptyNote.className = 'muted';
    emptyNote.textContent = 'No overdue follow-ups.';
    overdueSection.append(emptyNote);
  } else {
    const list = document.createElement('div');
    list.className = 'jobs-list';
    overdue.forEach((job) => {
      list.append(createFollowupRow(job, true));
    });
    overdueSection.append(list);
  }

  // Coming up section.
  const comingSection = document.createElement('section');
  comingSection.className = 'followups-section';
  comingSection.setAttribute('aria-labelledby', 'heading-coming-up');

  const comingHeading = document.createElement('h2');
  comingHeading.id = 'heading-coming-up';
  comingHeading.className = 'card-heading';
  comingHeading.textContent = `Coming up (${coming_up.length})`;
  comingSection.append(comingHeading);

  if (coming_up.length === 0) {
    const emptyNote = document.createElement('p');
    emptyNote.className = 'muted';
    emptyNote.textContent = 'No follow-ups due in the next 7 days.';
    comingSection.append(emptyNote);
  } else {
    const list = document.createElement('div');
    list.className = 'jobs-list';
    coming_up.forEach((job) => {
      list.append(createFollowupRow(job, false));
    });
    comingSection.append(list);
  }

  sectionsDiv.append(overdueSection, comingSection);
  shell.append(sectionsDiv);
  container.append(shell);
}

// Screen switcher.
function showScreen() {
  const hash = location.hash.slice(1);
  const name = hash || 'jobs';
  const app = document.getElementById('app');

  if (name === 'jobs') {
    document.title = 'Jobs | Shirube';
    renderJobs(app);
  } else if (name.startsWith('job/')) {
    const jobId = name.slice(4);
    renderJobPage(app, jobId);
  } else if (name === 'profile') {
    document.title = 'My profile | Shirube';
    renderProfile(app);
  } else if (name === 'followups') {
    document.title = 'Follow-ups | Shirube';
    renderFollowups(app);
  } else if (SCREENS[name]) {
    const title = SCREENS[name];
    document.title = `${title} | Shirube`;
    app.innerHTML = '';

    const heading = document.createElement('h1');
    heading.className = 'screen-title';
    heading.textContent = title;

    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'This screen is not built yet.';

    app.append(heading, note);
  } else {
    document.title = 'Page not found | Shirube';
    app.textContent = 'Page not found.';
  }

  // Mark the current page in the navbar and in the account menu.
  document.querySelectorAll('[data-screen]').forEach((link) => {
    const isCurrent = link.dataset.screen === name || (name.startsWith('job/') && link.dataset.screen === 'jobs');
    link.setAttribute('aria-current', isCurrent ? 'page' : 'false');
  });

  // Close the account menu after a choice is made.
  document.querySelectorAll('.avatar-menu').forEach((menu) => {
    menu.open = false;
  });
}

window.addEventListener('hashchange', showScreen);
showScreen();
