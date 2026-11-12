const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Today as YYYY-MM-DD in the computer's own time.
export function todayISO(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2026-11-30" -> "30 Nov" (adds the year when it is not this year)
export function formatDay(iso, today = todayISO()) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const text = `${d} ${MONTHS[m - 1]}`;
  return String(y) === today.slice(0, 4) ? text : `${text} ${y}`;
}

export function closingText(iso, today = todayISO()) {
  if (!iso) return 'No closing date';
  return iso < today ? `Closed ${formatDay(iso, today)}` : `Closes ${formatDay(iso, today)}`;
}

// "Acme Corp" -> "AC", "Globex" -> "GL"
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const letters = words.length === 1 ? [...words[0]].slice(0, 2) : [[...words[0]][0], [...words[1]][0]];
  return letters.join('').toUpperCase();
}
