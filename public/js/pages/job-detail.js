import { html } from '../lib/html.js';

export function render(el, { params }) {
  el.innerHTML = html`
    <div class="page-head">
      <div>
        <h1>Job ${params.id}</h1>
        <p class="text-muted">Built in step 4.</p>
      </div>
    </div>`;
}
