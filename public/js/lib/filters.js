// Shared filter bar for Found (and later Jobs).
// Works on items with: title, company, location, job_type, role_type, work_mode, posted_at, posted_date.

const POSTED_OPTIONS = [
  { value: 'any', label: 'Any time', hours: null },
  { value: '24h', label: 'Last 24 hours', hours: 24 },
  { value: '3d', label: 'Last 3 days', hours: 72 },
  { value: '7d', label: 'Last 7 days', hours: 168 },
  { value: '30d', label: 'Last 30 days', hours: 720 },
];

const WORK_MODES = ['Remote', 'Hybrid', 'On-site', 'Not stated'];

export function createFilters() {
  return { search: '', role_type: '', job_type: '', work_mode: '', location: '', posted: 'any' };
}

export function clearFilters(filters) {
  Object.assign(filters, createFilters());
}

export function filtersActive(filters) {
  return Boolean(
    filters.search.trim() || filters.role_type || filters.job_type ||
    filters.work_mode || filters.location || filters.posted !== 'any'
  );
}

// ITPro times are Colombo time (UTC+5:30). A date alone means midnight Colombo.
export function parseColombo(text) {
  if (!text) return null;
  let iso = String(text).trim().replace(' ', 'T');
  if (/^\d{4}-\d\d-\d\d$/.test(iso)) iso += 'T00:00:00';
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += '+05:30';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function applyFilters(items, filters) {
  const q = filters.search.trim().toLowerCase();
  const posted = POSTED_OPTIONS.find((o) => o.value === filters.posted);
  const cutoff = posted && posted.hours ? Date.now() - posted.hours * 3600000 : null;

  return items.filter((item) => {
    if (q) {
      const text = `${item.title} ${item.company} ${item.location} ${item.role_type}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    if (filters.role_type && item.role_type !== filters.role_type) return false;
    if (filters.job_type && item.job_type !== filters.job_type) return false;
    if (filters.location && item.location !== filters.location) return false;
    if (filters.work_mode) {
      if (filters.work_mode === 'Not stated') {
        if (item.work_mode) return false;
      } else if (item.work_mode !== filters.work_mode) {
        return false;
      }
    }
    if (cutoff !== null) {
      const when = parseColombo(item.posted_at) || parseColombo(item.posted_date);
      if (!when || when.getTime() < cutoff) return false;
    }
    return true;
  });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Builds the bar. onChange runs after any filter changes.
export function createFilterBar(items, filters, onChange) {
  const bar = document.createElement('div');
  bar.className = 'filter-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Filter postings');

  function field(labelText, el) {
    const wrap = document.createElement('label');
    wrap.className = 'filter-field';
    const span = document.createElement('span');
    span.className = 'filter-label';
    span.textContent = labelText;
    wrap.append(span, el);
    return wrap;
  }

  function select(key, labelText, allLabel, options) {
    const el = document.createElement('select');
    el.className = 'filter-input';
    const list = options.slice();
    // Keep the chosen value even if no posting has it any more.
    if (filters[key] && filters[key] !== 'any' && !list.some((o) => o.value === filters[key])) {
      list.push({ value: filters[key], label: filters[key] });
    }
    if (allLabel !== null) list.unshift({ value: '', label: allLabel });
    list.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      el.append(opt);
    });
    el.value = filters[key];
    el.addEventListener('change', () => {
      filters[key] = el.value;
      clearBtn.hidden = !filtersActive(filters);
      onChange();
    });
    return field(labelText, el);
  }

  const asOptions = (values) => values.map((v) => ({ value: v, label: v }));

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'filter-input';
  search.placeholder = 'Title, company, place';
  search.value = filters.search;
  search.addEventListener('input', () => {
    filters.search = search.value;
    clearBtn.hidden = !filtersActive(filters);
    onChange();
  });

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-secondary';
  clearBtn.textContent = 'Clear filters';
  clearBtn.hidden = !filtersActive(filters);
  clearBtn.addEventListener('click', () => {
    clearFilters(filters);
    // Rebuild the bar controls in place.
    const fresh = createFilterBar(items, filters, onChange);
    bar.replaceWith(fresh);
    onChange();
  });

  bar.append(
    field('Search', search),
    select('role_type', 'Category', 'All categories', asOptions(uniqueSorted(items.map((i) => i.role_type)))),
    select('job_type', 'Job type', 'All types', asOptions(uniqueSorted(items.map((i) => i.job_type)))),
    select('work_mode', 'Work mode', 'All', asOptions(WORK_MODES)),
    select('location', 'Location', 'All locations', asOptions(uniqueSorted(items.map((i) => i.location)))),
    select('posted', 'Posted', null, POSTED_OPTIONS.map((o) => ({ value: o.value, label: o.label }))),
    clearBtn
  );
  return bar;
}
