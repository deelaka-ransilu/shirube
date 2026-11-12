// Checks and cleans a job sent from the browser. Only known fields get through.
import { HttpError } from './errors.js';

export const STATUSES = ['open', 'applied', 'reply', 'interview', 'offer', 'rejected'];
export const WORK_MODES = ['onsite', 'hybrid', 'remote'];

const TEXT_FIELDS = {
  title: ['Job title', 200],
  company: ['Company', 200],
  location: ['Location', 200],
  source: ['Source', 100],
  job_type: ['Job type', 100],
  description: ['Description', 50000],
  notes: ['Notes', 20000],
};
const DATE_FIELDS = { found_on: 'Date found', closes_on: 'Closing date', applied_on: 'Applied date' };

export function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// partial = false: a new job (title needed). partial = true: an edit (only given fields).
export function cleanJob(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send the job as JSON');
  const out = {};

  for (const [key, [label, max]] of Object.entries(TEXT_FIELDS)) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string') throw new HttpError(400, `${label} must be text`);
    const value = body[key].trim();
    if (value.length > max) throw new HttpError(400, `${label} is too long (most ${max} characters)`);
    out[key] = value;
  }
  if (!partial && !out.title) throw new HttpError(400, 'Job title is required');
  if (partial && 'title' in out && !out.title) throw new HttpError(400, 'Job title is required');

  if (body.url !== undefined) {
    if (typeof body.url !== 'string') throw new HttpError(400, 'Job link must be text');
    const url = body.url.trim();
    if (url) {
      let ok = false;
      try { ok = ['http:', 'https:'].includes(new URL(url).protocol); } catch { /* not a URL */ }
      if (!ok || url.length > 2000) throw new HttpError(400, 'Job link must start with http:// or https://');
    }
    out.url = url;
  }

  for (const [key, label] of Object.entries(DATE_FIELDS)) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string' || (body[key] !== '' && !isRealDate(body[key]))) throw new HttpError(400, `${label} must be a real date`);
    out[key] = body[key];
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Unknown status');
    out.status = body.status;
  }
  if (body.work_mode !== undefined) {
    if (body.work_mode !== '' && !WORK_MODES.includes(body.work_mode)) throw new HttpError(400, 'Unknown work mode');
    out.work_mode = body.work_mode;
  }
  if (!partial && !out.source) out.source = 'manual';
  return out;
}
