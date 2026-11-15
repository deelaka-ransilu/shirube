// Small badges shared by Jobs and Job detail.
import { html } from './html.js';
import { closingWithDays, formatDay, todayISO } from './format.js';

// Green when it still closes, dashed grey when there is no date or it has closed.
// With no closing date, the date the job was found is shown instead (when we know it).
export function closeBadge(iso, today = todayISO(), foundOn = '') {
  if (!iso && foundOn) return html`<span class="badge">Found ${formatDay(foundOn, today)}</span>`;
  if (!iso) return html`<span class="badge b-none">No closing date</span>`;
  return html`<span class="badge ${iso < today ? 'b-none' : 'b-close'}">${closingWithDays(iso, today)}</span>`;
}
