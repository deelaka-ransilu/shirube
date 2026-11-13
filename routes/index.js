// All API routes live here. Handlers get { db, params, query, body }
// and return an object (sent as JSON) or throw HttpError.
import { HttpError } from '../lib/errors.js';
import { health } from './health.js';
import { listJobs, createJob, findDuplicate, deleteJob, getJob, updateJob } from './jobs.js';
import { addStage, updateStage, deleteStage } from './stages.js';
import {
  getProfile, saveProfile, createPreset, deletePreset,
  createEducation, updateEducation, deleteEducation,
  createExperience, updateExperience, deleteExperience,
} from './profile.js';
import { exportBackup, restoreBackup } from './backup.js';
import { getDashboard } from './dashboard.js';

const list = [
  ['GET', '/api/health', health],
  ['GET', '/api/dashboard', getDashboard],
  ['GET', '/api/jobs', listJobs],
  ['POST', '/api/jobs', createJob],
  ['GET', '/api/jobs/duplicate', findDuplicate],
  ['GET', '/api/jobs/:id', getJob],
  ['PATCH', '/api/jobs/:id', updateJob],
  ['DELETE', '/api/jobs/:id', deleteJob],
  ['POST', '/api/jobs/:id/stages', addStage],
  ['PATCH', '/api/stages/:id', updateStage],
  ['DELETE', '/api/stages/:id', deleteStage],
  ['GET', '/api/profile', getProfile],
  ['PATCH', '/api/profile', saveProfile],
  ['POST', '/api/presets', createPreset],
  ['DELETE', '/api/presets/:id', deletePreset],
  ['POST', '/api/education', createEducation],
  ['PATCH', '/api/education/:id', updateEducation],
  ['DELETE', '/api/education/:id', deleteEducation],
  ['POST', '/api/experience', createExperience],
  ['PATCH', '/api/experience/:id', updateExperience],
  ['DELETE', '/api/experience/:id', deleteExperience],
  ['GET', '/api/backup', exportBackup],
  ['POST', '/api/restore', restoreBackup],
];

export function buildRouter(db) {
  const compiled = list.map(([method, path, handler]) => ({
    method,
    handler,
    re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'),
  }));

  return async function route(method, pathname, ctx) {
    let pathMatched = false;
    for (const r of compiled) {
      const m = pathname.match(r.re);
      if (!m) continue;
      pathMatched = true;
      if (r.method === method) return r.handler({ ...ctx, db, params: m.groups ?? {} });
    }
    throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Not found');
  };
}
