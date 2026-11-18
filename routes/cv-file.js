// The CV you applied with, one per job.
//   PUT    /api/jobs/:id/cv?name=my-cv.pdf   the file itself as the request body (replaces the old one)
//   POST   /api/jobs/:id/cv/made?preset=<id> save the Word CV Shirube builds for this job
//   GET    /api/jobs/:id/cv/file             open or download it
//   DELETE /api/jobs/:id/cv                  remove it
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../lib/errors.js';
import { todayLocal } from '../lib/dates.js';
import { cvDir, removeStored, STORED } from '../lib/cv-store.js';
import { makeDocx, cvFileName } from '../lib/docx.js';
import { loadJobPage } from './stages.js';
import { getMatch } from './match.js';
import { DOCX_TYPE } from './cv.js';

export const MAX_CV_BYTES = 10 * 1024 * 1024;

// Allowed files, and the first bytes each one must start with (so a renamed .exe is refused).
const KINDS = {
  pdf: { type: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46], label: 'PDF' },
  docx: { type: DOCX_TYPE, magic: [0x50, 0x4b, 0x03, 0x04], label: 'Word (.docx) file' },
  doc: { type: 'application/msword', magic: [0xd0, 0xcf, 0x11, 0xe0], label: 'Word (.doc) file' },
};

const safeName = (name) => String(name ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);

function jobRow(db, id) {
  const job = db.prepare('SELECT id, cv_name, cv_file FROM jobs WHERE id = ?').get(id);
  if (!job) throw new HttpError(404, 'Job not found');
  return job;
}

function store({ db, deps, id, buffer, name, source }) {
  const job = jobRow(db, id);
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  const kind = KINDS[ext];
  if (!kind) throw new HttpError(400, 'Use a PDF or a Word file (.pdf, .docx or .doc)');
  if (!buffer?.length) throw new HttpError(400, 'That file is empty');
  if (buffer.length > MAX_CV_BYTES) throw new HttpError(413, 'That file is bigger than 10 MB');
  if (!kind.magic.every((byte, i) => buffer[i] === byte)) throw new HttpError(400, `That does not look like a ${kind.label}`);

  const file = `${randomUUID()}.${ext}`;
  mkdirSync(cvDir(deps), { recursive: true });
  writeFileSync(join(cvDir(deps), file), buffer);
  db.prepare('UPDATE jobs SET cv_name = ?, cv_file = ?, cv_source = ?, cv_added_on = ? WHERE id = ?')
    .run(name, file, source, todayLocal(), id);
  removeStored(deps, job.cv_file); // the old file goes only after the new one is saved
  return loadJobPage(db, id);
}

export function putCv({ db, params, query, body, deps }) {
  if (!Buffer.isBuffer(body)) throw new HttpError(400, 'Send the file as the request body');
  return store({ db, deps, id: Number(params.id), buffer: body, name: safeName(query.name) || 'CV', source: 'uploaded' });
}

export function saveMadeCv({ db, params, query, deps }) {
  const d = getMatch({ db, params, query });
  return store({ db, deps, id: Number(params.id), buffer: makeDocx(d), name: cvFileName(d, 'docx'), source: 'made' });
}

export function getCvFile({ db, params, deps }) {
  const job = jobRow(db, Number(params.id));
  if (!job.cv_file || !STORED.test(job.cv_file)) throw new HttpError(404, 'No CV is saved for this job');
  const path = join(cvDir(deps), job.cv_file);
  if (!existsSync(path)) throw new HttpError(404, 'The file is not on this computer (it was saved on another one)');
  const ext = job.cv_file.slice(job.cv_file.lastIndexOf('.') + 1);
  return { file: { buffer: readFileSync(path), name: job.cv_name || `CV.${ext}`, type: KINDS[ext].type, inline: ext === 'pdf' } };
}

export function deleteCv({ db, params, deps }) {
  const id = Number(params.id);
  const job = jobRow(db, id);
  db.prepare("UPDATE jobs SET cv_name = '', cv_file = '', cv_source = '', cv_added_on = '' WHERE id = ?").run(id);
  removeStored(deps, job.cv_file);
  return loadJobPage(db, id);
}
