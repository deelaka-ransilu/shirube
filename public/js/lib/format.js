// Small helpers shared by every page. No state, no DOM access.

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Today's date in Sri Lanka time, as YYYY-MM-DD.
export function getTodayColombo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// YYYY-MM-DD becomes "Nov 09". Returns the input unchanged if it isn't a full date.
export function formatMonthDay(ymd) {
  if (!ymd) return '';
  const parts = ymd.split('-');
  if (parts.length < 3) return ymd;
  const month = MONTHS[parseInt(parts[1], 10) - 1] || parts[1];
  return `${month} ${parts[2].padStart(2, '0')}`;
}

// YYYY-MM-DD becomes "2026".
export function yearOf(ymd) {
  if (!ymd) return '';
  return ymd.split('-')[0] || '';
}
