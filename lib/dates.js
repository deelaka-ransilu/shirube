// Small date helpers. Dates are text YYYY-MM-DD, in the computer's own time.
const pad = (n) => String(n).padStart(2, '0');

export function todayLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Whole days from a to b (b later = positive). Uses UTC so daylight saving cannot shift it.
export function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

// A date text plus some days (negative = earlier), as YYYY-MM-DD.
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
