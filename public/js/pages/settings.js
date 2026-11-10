// Settings screen: due-date days (lists come in the next step).
const DAY_FIELDS = [
  {
    key: 'reply_days',
    label: 'Expect a reply after',
    hint: 'Days after you apply before a reply is expected.',
  },
  {
    key: 'follow_up_days',
    label: 'Follow up on Applied after',
    hint: 'Days after you apply before you follow up.',
  },
  {
    key: 'screening_follow_up_days',
    label: 'Follow up on Screening after',
    hint: 'Days after the latest reply before you follow up.',
  },
  {
    key: 'no_reply_days',
    label: 'Mark as No reply after',
    hint: 'Days after you apply before a job with no answer is treated as No reply.',
  },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function readJson(res) {
  return res.json().catch(() => ({}));
}

export async function renderSettings(container) {
  container.innerHTML = '<p class="muted">Loading settings...</p>';
  let settings;
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Could not load settings.');
    settings = await res.json();
  } catch (err) {
    container.innerHTML = '';
    container.append(el('p', 'field-error', `Error loading settings: ${err.message}`));
    return;
  }
  draw(container, settings);
}

function draw(container, settings) {
  const shell = el('div', 'settings-shell');

  const header = el('header');
  header.append(
    el('h1', 'screen-title', 'Settings'),
    el('p', 'profile-intro', 'Choose when follow-ups fall due, and edit the lists used by the job forms.')
  );

  const panel = el('form', 'form-panel');
  panel.noValidate = true;
  panel.append(el('h2', 'form-title', 'Due-date days'));

  const inputs = new Map();
  const errors = new Map();

  DAY_FIELDS.forEach((f) => {
    const group = el('div', 'form-group');
    const label = el('label', 'form-label', f.label);
    const inputId = `setting-${f.key}`;
    label.htmlFor = inputId;

    const input = el('input', 'form-input settings-days-input');
    input.type = 'number';
    input.id = inputId;
    input.min = '1';
    input.max = '365';
    input.step = '1';
    input.value = String(settings[f.key]);

    const hint = el('p', 'muted settings-hint', f.hint);
    hint.id = `${inputId}-hint`;
    const error = el('p', 'field-error');
    error.id = `${inputId}-error`;
    error.hidden = true;
    input.setAttribute('aria-describedby', `${hint.id} ${error.id}`);

    group.append(label, input, hint, error);
    panel.append(group);
    inputs.set(f.key, input);
    errors.set(f.key, error);
  });

  const status = el('p', 'settings-status');
  status.setAttribute('role', 'status');

  const actions = el('div', 'form-actions');
  const saveBtn = el('button', 'btn btn-primary', 'Save settings');
  saveBtn.type = 'submit';
  actions.append(saveBtn);
  panel.append(actions, status);

  function setError(key, message) {
    const error = errors.get(key);
    error.textContent = message || '';
    error.hidden = !message;
    inputs.get(key).setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  panel.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    status.className = 'settings-status';

    const body = {};
    let firstBad = null;
    DAY_FIELDS.forEach((f) => {
      const raw = inputs.get(f.key).value.trim();
      const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        setError(f.key, 'Enter a whole number from 1 to 365.');
        if (!firstBad) firstBad = f.key;
      } else {
        setError(f.key, '');
        body[f.key] = n;
      }
    });
    if (firstBad) {
      inputs.get(firstBad).focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readJson(res);
      if (!res.ok) {
        if (data.field && errors.has(data.field)) {
          setError(data.field, data.error);
          inputs.get(data.field).focus();
        } else {
          status.className = 'settings-status field-error';
          status.textContent = data.error || 'Could not save settings.';
        }
      } else {
        DAY_FIELDS.forEach((f) => {
          inputs.get(f.key).value = String(data[f.key]);
        });
        status.textContent = 'Saved. New due dates apply straight away.';
      }
    } catch {
      status.className = 'settings-status field-error';
      status.textContent = 'Could not reach the server. Check that Shirube is running, then try again.';
    }
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save settings';
  });

  shell.append(header, panel, createListsPanel(settings));
  container.innerHTML = '';
  container.append(shell);
}

// Role types, sources and rejection reasons. Each change saves straight away.
const LISTS = [
  { key: 'role_types', title: 'Role types', hint: 'Used by the job forms and the Category filter.' },
  { key: 'sources', title: 'Sources', hint: 'Where you found a job.' },
  { key: 'rejection_reasons', title: 'Rejection reasons', hint: 'Choices when you mark a job as Rejected.' },
];
const MAX_NAME = 60;
const MAX_ITEMS = 50;

function createListsPanel(settings) {
  const wrap = el('div', 'settings-lists');
  const items = {};
  LISTS.forEach((def) => {
    items[def.key] = (settings[def.key] || []).filter((n) => n.toLowerCase() !== 'other');
  });
  const pending = new Map(); // key -> name waiting for remove confirmation
  const messages = new Map(); // key -> { text, error }
  const drafts = new Map(); // key -> text typed in the add box
  let busy = false;
  let focusKey = null;

  async function save(key, next) {
    busy = true;
    draw();
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        messages.set(key, { text: data.error || 'Could not save.', error: true });
      } else {
        items[key] = (data[key] || []).filter((n) => n.toLowerCase() !== 'other');
        messages.set(key, { text: 'Saved.', error: false });
      }
    } catch {
      messages.set(key, { text: 'Could not reach the server. Check that Shirube is running, then try again.', error: true });
    }
    busy = false;
    draw();
  }

  function fail(key, text) {
    messages.set(key, { text, error: true });
    focusKey = key;
    draw();
  }

  function add(key, raw) {
    const name = raw.trim().replace(/\s+/g, ' ');
    messages.delete(key);
    if (!name) return fail(key, 'Type a name first.');
    if (name.length > MAX_NAME) return fail(key, `Keep the name to ${MAX_NAME} characters or fewer.`);
    if (name.toLowerCase() === 'other' || items[key].some((n) => n.toLowerCase() === name.toLowerCase())) {
      return fail(key, `"${name}" is already in the list.`);
    }
    if (items[key].length >= MAX_ITEMS - 1) return fail(key, `Keep the list to ${MAX_ITEMS} items or fewer.`);
    drafts.delete(key);
    focusKey = key;
    return save(key, [...items[key], name]);
  }

  function buildSection(def) {
    const key = def.key;
    const section = el('section', 'form-panel');
    section.append(el('h2', 'form-title', def.title), el('p', 'muted settings-hint', def.hint));

    const ul = el('ul', 'settings-list');
    items[key].forEach((name) => {
      const li = el('li', 'settings-item');
      if (pending.get(key) === name) {
        li.append(el('span', 'delete-prompt', `Remove "${name}"? Jobs that already use it keep it.`));
        const actions = el('div', 'settings-item-actions');
        const confirmBtn = el('button', 'btn btn-danger', 'Remove');
        confirmBtn.type = 'button';
        confirmBtn.disabled = busy;
        confirmBtn.addEventListener('click', () => {
          pending.delete(key);
          messages.delete(key);
          save(key, items[key].filter((n) => n !== name));
        });
        const keepBtn = el('button', 'btn btn-secondary', 'Keep it');
        keepBtn.type = 'button';
        keepBtn.addEventListener('click', () => {
          pending.delete(key);
          draw();
        });
        actions.append(confirmBtn, keepBtn);
        li.append(actions);
      } else {
        li.append(el('span', 'settings-item-name', name));
        const removeBtn = el('button', 'btn btn-danger-outline btn-delete', 'Remove');
        removeBtn.type = 'button';
        removeBtn.disabled = busy;
        removeBtn.setAttribute('aria-label', `Remove ${name} from ${def.title}`);
        removeBtn.addEventListener('click', () => {
          pending.set(key, name);
          messages.delete(key);
          draw();
        });
        li.append(removeBtn);
      }
      ul.append(li);
    });

    const other = el('li', 'settings-item');
    other.append(el('span', 'settings-item-name', 'Other'), el('span', 'muted settings-fixed', 'Always last'));
    ul.append(other);

    const addRow = el('div', 'settings-add');
    const input = el('input', 'form-input');
    input.type = 'text';
    input.id = `settings-add-${key}`;
    input.placeholder = 'New item';
    input.setAttribute('aria-label', `Add to ${def.title}`);
    input.value = drafts.get(key) || '';
    input.disabled = busy;
    input.addEventListener('input', () => drafts.set(key, input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        add(key, input.value);
      }
    });
    const addBtn = el('button', 'btn btn-secondary', 'Add');
    addBtn.type = 'button';
    addBtn.disabled = busy;
    addBtn.addEventListener('click', () => add(key, input.value));
    addRow.append(input, addBtn);

    section.append(ul, addRow);

    const msg = messages.get(key);
    if (msg) {
      const p = el('p', msg.error ? 'field-error' : 'settings-status', msg.text);
      p.setAttribute('role', msg.error ? 'alert' : 'status');
      section.append(p);
    }
    return section;
  }

  function draw() {
    wrap.replaceChildren(...LISTS.map(buildSection));
    if (focusKey) {
      const box = wrap.querySelector(`#settings-add-${focusKey}`);
      if (box && !box.disabled) box.focus();
      focusKey = null;
    }
  }

  draw();
  return wrap;
}
