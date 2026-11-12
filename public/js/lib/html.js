// Safe HTML building. Every value put into html`...` is escaped,
// so text from jobs or the advert can never run as code.
// Nested html`` results and raw() are trusted and not escaped again.
class Raw {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function fmt(value) {
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(fmt).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < values.length ? fmt(values[i]) : ''); });
  return new Raw(out);
}

export const raw = (s) => new Raw(String(s));
