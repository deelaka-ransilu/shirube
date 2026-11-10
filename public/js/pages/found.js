// Found tab: new ITPro postings you can save into Jobs or dismiss.
import { loadFound, saveFound, dismissFound } from '../lib/api.js';

const state = {
  postings: [],
  stale: false,
  notice: null, // { text, jobId }
  rowErrors: new Map(), // external_id -> message
  busyIds: new Set(),
};

// ITPro times are Colombo time (UTC+5:30).
function postedAgo(posting) {
  if (posting.posted_at) {
    const iso = String(posting.posted_at).replace(' ', 'T');
    const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(iso);
    const when = new Date(hasZone ? iso : iso + '+05:30');
    if (!Number.isNaN(when.getTime())) {
      const mins = Math.max(0, Math.round((Date.now() - when.getTime()) / 60000));
      if (mins < 60) return `Posted ${mins} min ago`;
      const hours = Math.round(mins / 60);
      if (hours < 24) return `Posted ${hours} h ago`;
      const days = Math.round(hours / 24);
      return `Posted ${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
  }
  return posting.posted_date ? `Posted ${posting.posted_date}` : '';
}

export async function renderFound(container) {
  container.innerHTML = '<p class="muted">Loading postings...</p>';
  await loadAndDraw(container, false);
}

async function loadAndDraw(container, refresh) {
  try {
    const data = await loadFound(refresh);
    state.postings = data.postings || [];
    state.stale = Boolean(data.stale);
    state.rowErrors.clear();
    state.busyIds.clear();
    drawFound(container, null);
  } catch (err) {
    drawFound(container, err.message);
  }
}

function drawFound(container, loadError) {
  const shell = document.createElement('div');
  shell.className = 'found-shell';

  const topBar = document.createElement('header');
  topBar.className = 'jobs-top-bar';

  const headerText = document.createElement('div');
  headerText.className = 'jobs-header-text';
  const h1 = document.createElement('h1');
  h1.className = 'screen-title';
  h1.textContent = 'Found';
  const intro = document.createElement('p');
  intro.className = 'profile-intro';
  intro.textContent = 'New postings from ITPro. Save one to add it to Jobs, or dismiss it.';
  headerText.append(h1, intro);

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn btn-secondary';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
    state.notice = null;
    await loadAndDraw(container, true);
  });

  topBar.append(headerText, refreshBtn);
  shell.append(topBar);

  if (loadError) {
    const box = document.createElement('div');
    box.className = 'found-message';
    const msg = document.createElement('p');
    msg.className = 'field-error';
    msg.textContent = `Could not reach ITPro: ${loadError}`;
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = 'Check your internet connection, then click Refresh.';
    box.append(msg, hint);
    shell.append(box);
    container.innerHTML = '';
    container.append(shell);
    return;
  }

  if (state.stale) {
    const stale = document.createElement('p');
    stale.className = 'found-message muted';
    stale.textContent = 'ITPro could not be reached. Showing an older list.';
    shell.append(stale);
  }

  if (state.notice) {
    const note = document.createElement('p');
    note.className = 'found-message found-notice';
    note.setAttribute('role', 'status');
    note.append(document.createTextNode(state.notice.text + ' '));
    if (state.notice.jobId) {
      const link = document.createElement('a');
      link.href = `#job/${state.notice.jobId}`;
      link.textContent = 'View job';
      note.append(link);
    }
    shell.append(note);
  }

  const count = document.createElement('div');
  count.className = 'jobs-counts';
  count.textContent = `${state.postings.length} new ${state.postings.length === 1 ? 'posting' : 'postings'}`;
  shell.append(count);

  if (state.postings.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'found-message';
    const text = document.createElement('p');
    text.className = 'muted';
    text.textContent = 'No new postings. Click Refresh later to check ITPro again.';
    empty.append(text);
    shell.append(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'found-list';
    state.postings.forEach((p) => list.append(createCard(p, container)));
    shell.append(list);
  }

  container.innerHTML = '';
  container.append(shell);
}

function createCard(posting, container) {
  const card = document.createElement('article');
  card.className = 'found-card';

  const title = document.createElement('h2');
  title.className = 'found-title';
  title.textContent = posting.title;

  const company = document.createElement('p');
  company.className = 'found-company';
  company.textContent = [posting.company, posting.location].filter(Boolean).join(' · ');

  const facts = document.createElement('p');
  facts.className = 'found-facts';
  facts.textContent = [
    postedAgo(posting),
    posting.job_type,
    posting.role_type,
    posting.work_mode,
  ].filter(Boolean).join(' · ');

  const actions = document.createElement('div');
  actions.className = 'found-actions';

  const busy = state.busyIds.has(posting.external_id);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save';
  saveBtn.disabled = busy;

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'btn btn-secondary';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.disabled = busy;

  const view = document.createElement('a');
  view.className = 'found-link';
  view.href = posting.url;
  view.target = '_blank';
  view.rel = 'noopener noreferrer';
  view.textContent = 'View on ITPro';

  actions.append(saveBtn, dismissBtn, view);
  card.append(title, company, facts, actions);

  const err = state.rowErrors.get(posting.external_id);
  if (err) {
    const errEl = document.createElement('p');
    errEl.className = 'field-error';
    errEl.textContent = err;
    card.append(errEl);
  }

  const run = async (action, doneText) => {
    state.busyIds.add(posting.external_id);
    state.rowErrors.delete(posting.external_id);
    saveBtn.disabled = true;
    dismissBtn.disabled = true;
    try {
      const data = await action(posting.external_id);
      state.postings = state.postings.filter((p) => p.external_id !== posting.external_id);
      state.notice = {
        text: doneText,
        jobId: data && (data.id ?? (data.job && data.job.id)),
      };
    } catch (e) {
      state.rowErrors.set(posting.external_id, e.message);
    }
    state.busyIds.delete(posting.external_id);
    drawFound(container, null);
  };

  saveBtn.addEventListener('click', () => run(saveFound, `Saved "${posting.title}" to Jobs.`));
  dismissBtn.addEventListener('click', async () => {
    await run(dismissFound, `Dismissed "${posting.title}".`);
    if (state.notice) state.notice.jobId = null;
    drawFound(container, null);
  });

  return card;
}
