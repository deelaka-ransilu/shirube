// Quick date choices for the Add job page. Pure functions: pass a Date to test them.
import { todayISO } from './format.js';

const shift = (now, days) => todayISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));

// "Date found": [label, YYYY-MM-DD]
export function foundChips(now = new Date()) {
  return [['Today', shift(now, 0)], ['Yesterday', shift(now, -1)], ['2 days ago', shift(now, -2)], ['Last week', shift(now, -7)]];
}

// "Closing date": [label, YYYY-MM-DD]; "None" has an empty date.
// "End of month" is left out when it would be today or the same day as another chip.
export function closeChips(now = new Date()) {
  const list = [['Tomorrow', shift(now, 1)], ['1 week', shift(now, 7)], ['2 weeks', shift(now, 14)], ['3 weeks', shift(now, 21)]];
  const eom = todayISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (eom > shift(now, 0) && !list.some(([, d]) => d === eom)) list.push(['End of month', eom]);
  list.sort((a, b) => a[1].localeCompare(b[1]));
  list.push(['None', '']);
  return list;
}
