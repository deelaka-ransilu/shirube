// Small badges shared by Jobs and Job detail.
import { html } from './html.js';
import { closingText, todayISO } from './format.js';

// Green when it still closes, dashed grey when there is no date or it has closed.
export function closeBadge(iso, today = todayISO()) {
  if (!iso) return html`<span class="badge b-none">No closing date</span>`;
  return html`<span class="badge ${iso < today ? 'b-none' : 'b-close'}">${closingText(iso, today)}</span>`;
}
