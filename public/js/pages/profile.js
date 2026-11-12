import { html } from '../lib/html.js';

export function render(el) {
  el.innerHTML = html`
    <div class="page-head">
      <div>
        <h1>My profile</h1>
        <p class="text-muted">Built in step 5.</p>
      </div>
    </div>`;
}
