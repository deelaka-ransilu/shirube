import { HttpError } from '../lib/errors.js';
import { isRealDate } from '../lib/validate-job.js';
import { STAGE_KINDS, STATUS_KINDS, statusFromStages, appliedOnFromStages } from '../lib/stage-rules.js';

const NOTE_MAX = 2000;

function loadStages(db, jobId) {
  return db.prepare('SELECT * FROM stages WHERE job_id = ? ORDER BY happened_on = \'\', happened_on, id').all(jobId);
}

// The whole job page in one answer: the job row and its stages.
export function loadJobPage(db, id) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!job) throw new HttpError(404, 'Job not found');
  return { job, stages: loadStages(db, id) };
}

// After a stage that decides status changes, bring status and applied date in line.
function syncJob(db, jobId, kind) {
  if (!STATUS_KINDS.includes(kind)) return;
  const stages = loadStages(db, jobId);
  db.prepare("UPDATE jobs SET status = ?, applied_on = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(statusFromStages(stages), appliedOnFromStages(stages), jobId);
}

function cleanStageFields(body, { partial }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send the stage as JSON');
  const out = {};
  if (body.happened_on !== undefined) {
    if (typeof body.happened_on !== 'string' || (body.happened_on !== '' && !isRealDate(body.happened_on))) {
      throw new HttpError(400, 'Date must be a real date');
    }
    out.happened_on = body.happened_on;
  }
  if (body.note !== undefined) {
    if (typeof body.note !== 'string') throw new HttpError(400, 'Note must be text');
    const note = body.note.trim();
    if (note.length > NOTE_MAX) throw new HttpError(400, `Note is too long (most ${NOTE_MAX} characters)`);
    out.note = note;
  }
  if (!partial) {
    if (!STAGE_KINDS.includes(body.kind)) throw new HttpError(400, 'Unknown stage');
    out.kind = body.kind;
  }
  return out;
}

export function addStage({ db, params, body }) {
  const jobId = Number(params.id);
  loadJobPage(db, jobId); // 404 when the job is missing
  const data = cleanStageFields(body, { partial: false });
  const cols = ['job_id', ...Object.keys(data)];
  db.prepare(`INSERT INTO stages (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(jobId, ...Object.values(data));
  syncJob(db, jobId, data.kind);
  return loadJobPage(db, jobId);
}

function findStage(db, id) {
  const stage = db.prepare('SELECT * FROM stages WHERE id = ?').get(Number(id));
  if (!stage) throw new HttpError(404, 'Stage not found');
  return stage;
}

export function updateStage({ db, params, body }) {
  const stage = findStage(db, params.id);
  const data = cleanStageFields(body, { partial: true });
  const cols = Object.keys(data);
  if (!cols.length) throw new HttpError(400, 'Nothing to change');
  db.prepare(`UPDATE stages SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => data[c]), stage.id);
  syncJob(db, stage.job_id, stage.kind);
  return loadJobPage(db, stage.job_id);
}

export function deleteStage({ db, params }) {
  const stage = findStage(db, params.id);
  db.prepare('DELETE FROM stages WHERE id = ?').run(stage.id);
  syncJob(db, stage.job_id, stage.kind);
  return loadJobPage(db, stage.job_id);
}
