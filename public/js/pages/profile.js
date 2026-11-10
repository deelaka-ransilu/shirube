// My profile page: progress, tabs, and cards for skills, experience, and education.
// Add and edit forms are in this file too, added in part 2.
import { escapeHtml } from '../lib/format.js';

const LEVEL_LABELS = ['Aware', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];

const state = {
  skills: [],
  experiences: [],
  education: [],
  activeTab: 'skills',
  isAdding: false,
  editingItem: null,
  confirmDeleteId: null,
};

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

function nextStepText() {
  const { skills, experiences, education } = state;
  if (skills.length === 0) return 'Still to do: add at least one skill to use Shirube.';
  if (experiences.length === 0) return 'Next: add an experience or volunteering entry to build your history.';
  if (education.length === 0) return 'Next: add your education or qualifications.';
  if (skills.find((s) => !s.proof_url && !s.used_at_experience)) return 'Next: add a proof link to verify a skill.';
  return 'Profile complete: all your skills, experience, and education are up to date.';
}

function refresh(container) {
  loadProfileData().then(() => draw(container)).catch((err) => {
    container.innerHTML = `<p class="field-error">Error loading profile: ${escapeHtml(err.message)}</p>`;
  });
}

function draw(container) {
  const { skills, experiences, education, activeTab } = state;

  const shell = document.createElement('div');
  shell.className = 'profile-shell';

  const header = document.createElement('header');
  const h1 = document.createElement('h1');
  h1.className = 'screen-title';
  h1.textContent = 'My profile';
  const intro = document.createElement('p');
  intro.className = 'profile-intro';
  intro.textContent = 'Keep your skills, experience, and education up to date so Shirube can match them against jobs.';
  header.append(h1, intro);

  const progress = document.createElement('section');
  progress.className = 'profile-progress';
  progress.setAttribute('aria-label', 'Profile completion progress');

  const counts = document.createElement('div');
  counts.className = 'progress-counts';
  counts.textContent = `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}   ${experiences.length} ${experiences.length === 1 ? 'experience' : 'experiences'}   ${education.length} education`;

  const next = document.createElement('div');
  next.className = 'progress-next';
  next.textContent = nextStepText();

  progress.append(counts, next);

  shell.append(header, progress, buildTabs(container, skills, experiences, education, activeTab));
  shell.append(buildPanel(container, activeTab));

  container.innerHTML = '';
  container.append(shell);
}

function buildTabs(container, skills, experiences, education, activeTab) {
  const tabList = document.createElement('div');
  tabList.className = 'tab-list';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Profile sections');

  const tabs = [
    { key: 'skills', label: `Skills (${skills.length})` },
    { key: 'experiences', label: `Experience and volunteering (${experiences.length})` },
    { key: 'education', label: `Education (${education.length})` },
  ];

  tabs.forEach((tab, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.setAttribute('role', 'tab');
    btn.id = `tab-${tab.key}`;
    btn.setAttribute('aria-controls', `panel-${tab.key}`);
    const selected = activeTab === tab.key;
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    btn.setAttribute('tabindex', selected ? '0' : '-1');
    btn.textContent = tab.label;

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

function resetPanel() {
  state.isAdding = false;
  state.editingItem = null;
  state.confirmDeleteId = null;
}

function buildPanel(container, activeTab) {
  const panel = document.createElement('section');
  panel.className = 'tab-panel';
  panel.id = `panel-${activeTab}`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `tab-${activeTab}`);

  const header = document.createElement('div');
  header.className = 'tab-header';

  const text = document.createElement('div');
  text.className = 'tab-header-text';

  const title = document.createElement('h2');
  title.className = 'tab-title';
  const desc = document.createElement('p');
  desc.className = 'tab-desc';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary tab-header-btn';

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

  const items = state[activeTab];
  if (items.length === 0) {
    panel.append(buildEmpty(activeTab, addBtn.textContent, container));
  } else {
    const list = document.createElement('div');
    list.className = 'cards-list';
    items.forEach((item) => list.append(buildCard(activeTab, item, container)));
    panel.append(list);
  }

  return panel;
}

function buildEmpty(activeTab, actionLabel, container) {
  const box = document.createElement('div');
  box.className = 'empty-state';

  const msg = document.createElement('p');
  msg.className = 'empty-text';
  if (activeTab === 'skills') {
    msg.textContent = 'No skills added yet. Add at least one skill to start building your profile.';
  } else if (activeTab === 'experiences') {
    msg.textContent = 'No experience added yet. Add your past jobs or volunteering to link your skills to real projects.';
  } else {
    msg.textContent = 'No education added yet. Add your courses or degrees to complete your profile.';
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.textContent = actionLabel;
  btn.addEventListener('click', () => {
    state.isAdding = true;
    state.editingItem = null;
    state.confirmDeleteId = null;
    draw(container);
  });

  box.append(msg, btn);
  return box;
}

function buildCard(tabKey, item, container) {
  const card = document.createElement('article');
  card.className = 'card';
  card.id = `card-${tabKey}-${item.id}`;

  const main = document.createElement('div');
  main.className = 'card-main';

  const title = document.createElement('h3');
  title.className = 'card-title';

  if (tabKey === 'skills') {
    title.textContent = item.name;
    main.append(title, buildSkillMeta(item));
  } else if (tabKey === 'experiences') {
    title.textContent = item.title;
    main.append(title, buildExperienceMeta(item));
    if (item.description) {
      const desc = document.createElement('p');
      desc.className = 'card-desc';
      desc.textContent = item.description;
      main.append(desc);
    }
  } else {
    title.textContent = item.course;
    main.append(title, buildEducationMeta(item));
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
  const wrap = document.createElement('div');
  wrap.className = 'card-main';

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  const level = document.createElement('span');
  level.className = 'meta-chip';
  level.textContent = `Level ${item.level} · ${LEVEL_LABELS[item.level - 1]}`;
  meta.append(level);
  wrap.append(meta);

  if (item.proof_url || item.used_at_experience) {
    const row = document.createElement('div');
    row.className = 'verified-row';
    const badge = document.createElement('span');
    badge.className = 'verified-badge';
    const dot = document.createElement('span');
    dot.className = 'verified-marker';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '●';
    badge.append(dot, document.createTextNode(' Verified'));
    const note = document.createElement('span');
    note.className = 'verified-note';
    note.textContent = 'Verified means you can show proof or a real project.';
    row.append(badge, note);
    wrap.append(row);
  }

  if (item.proof_url) {
    const p = document.createElement('p');
    p.className = 'card-detail';
    const a = document.createElement('a');
    a.href = item.proof_url;
    a.className = 'link';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `Proof link: ${item.proof_url} ↗`;
    p.append(a);
    wrap.append(p);
  }

  if (item.used_at_experience) {
    const p = document.createElement('p');
    p.className = 'card-detail muted';
    const org = item.experience_organisation ? ` at ${item.experience_organisation}` : '';
    p.textContent = `Used at: ${item.experience_title || 'Experience'}${org}`;
    wrap.append(p);
  }

  return wrap;
}

function buildExperienceMeta(item) {
  const meta = document.createElement('div');
  meta.className = 'card-meta';

  const chip = document.createElement('span');
  chip.className = 'meta-chip';
  chip.textContent = item.kind === 'volunteering' ? 'Volunteering' : 'Experience';
  meta.append(chip);

  if (item.organisation) {
    const org = document.createElement('span');
    org.textContent = item.organisation;
    meta.append(org);
  }

  const dates = document.createElement('span');
  dates.className = 'card-dates';
  const end = item.is_current ? 'Present' : (item.end_date || '');
  dates.textContent = `${item.start_date}${end ? ` – ${end}` : ''}`;
  meta.append(dates);

  return meta;
}

function buildEducationMeta(item) {
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

  return meta;
}

function buildCardActions(item, container) {
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-secondary btn-edit';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => {
    state.editingItem = item;
    state.isAdding = false;
    state.confirmDeleteId = null;
    draw(container);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger-outline btn-delete';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => {
    state.confirmDeleteId = item.id;
    draw(container);
  });

  actions.append(editBtn, deleteBtn);
  return actions;
}

function buildDeleteConfirm(tabKey, item, container) {
  const box = document.createElement('div');
  box.className = 'delete-confirm';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Confirm delete');

  const displayName = item.name || item.title || item.course;
  const prompt = document.createElement('p');
  prompt.className = 'delete-prompt';
  prompt.textContent = `Delete ${displayName}? This cannot be undone.`;

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
      if (!res.ok) throw new Error('Could not delete item. Please try again.');
      state.confirmDeleteId = null;
      refresh(container);
    } catch (err) {
      prompt.textContent = err.message;
      delBtn.disabled = false;
    }
  });

  const keepBtn = document.createElement('button');
  keepBtn.type = 'button';
  keepBtn.className = 'btn btn-secondary';
  keepBtn.textContent = 'Keep it';
  keepBtn.addEventListener('click', () => {
    state.confirmDeleteId = null;
    draw(container);
  });

  actions.append(delBtn, keepBtn);
  box.append(prompt, actions);
  return box;
}
