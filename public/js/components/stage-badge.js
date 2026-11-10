// Stage badge: a shape plus a word. Never colour alone.
import { escapeHtml } from '../lib/format.js';

export function renderStageBadge(stage, isStale) {
  if (isStale) {
    return `
      <span class="job-stage">
        <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <polygon points="7,1.5 12.5,7 7,12.5 1.5,7" fill="none" stroke="var(--grey)" stroke-width="1.5"/>
        </svg>
        <span>stale</span>
      </span>
    `;
  }

  switch (stage) {
    case 'to_apply':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--grey)" stroke-width="1.5" stroke-dasharray="2 2"/>
          </svg>
          <span>To apply</span>
        </span>
      `;
    case 'applied':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--grey)" stroke-width="1.5"/>
          </svg>
          <span>Applied</span>
        </span>
      `;
    case 'screening':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--blue)" stroke-width="1.5"/>
          </svg>
          <span>Screening</span>
        </span>
      `;
    case 'interview':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="var(--blue)"/>
          </svg>
          <span>Interview</span>
        </span>
      `;
    case 'offer':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="20" height="12" viewBox="0 0 20 12" aria-hidden="true">
            <rect x="1" y="1" width="18" height="10" rx="5" fill="var(--blue)"/>
          </svg>
          <span>Offer</span>
        </span>
      `;
    case 'rejected':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="var(--text)"/>
          </svg>
          <span>Rejected</span>
        </span>
      `;
    case 'no_reply':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--grey)" stroke-width="1.5" stroke-dasharray="3.5 2"/>
          </svg>
          <span>No reply</span>
        </span>
      `;
    case 'skipped':
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="2.5" y="2.5" width="9" height="9" fill="none" stroke="var(--grey)" stroke-width="1.5"/>
          </svg>
          <span>Skipped</span>
        </span>
      `;
    default:
      return `
        <span class="job-stage">
          <svg class="status-shape" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="var(--grey)" stroke-width="1.5"/>
          </svg>
          <span>${escapeHtml(stage)}</span>
        </span>
      `;
  }
}
