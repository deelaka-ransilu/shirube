// A v3 confirm box, instead of the browser's "localhost:3000 says" window.
// const ok = await confirmDialog({ title, message, ok: 'Delete', danger: true });
// Resolves true for the OK button, false for Cancel, Escape or a click outside the box.
import { html } from './html.js';

export function confirmDialog({ title, message = '', ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const host = document.createElement('div');
    host.className = 'cf-modal';
    host.innerHTML = html`
      <div class="cf-box" role="alertdialog" aria-modal="true" aria-labelledby="cf-title" ${message ? html`aria-describedby="cf-msg"` : ''}>
        <h2 id="cf-title">${title}</h2>
        ${message ? html`<p id="cf-msg" class="cf-msg">${message}</p>` : ''}
        <div class="cf-actions">
          <button type="button" class="btn btn-secondary" data-cf="no">${cancel}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-cf="yes">${ok}</button>
        </div>
      </div>`.toString();
    document.body.appendChild(host);

    const yes = host.querySelector('[data-cf="yes"]');
    const no = host.querySelector('[data-cf="no"]');

    function close(result) {
      host.remove();
      if (before && before.isConnected && typeof before.focus === 'function') before.focus();
      resolve(result);
    }

    host.addEventListener('click', (e) => {
      if (e.target === host) { close(false); return; }
      const b = e.target.closest('[data-cf]');
      if (b) close(b.dataset.cf === 'yes');
    });
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key === 'Tab') {                       // keep the focus inside the box
        e.preventDefault();
        (document.activeElement === no ? yes : no).focus();
      }
    });

    (danger ? no : yes).focus();                   // a delete never has OK pre-selected
  });
}
