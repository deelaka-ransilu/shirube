// Where the CV files live: a folder on this computer, next to the database. No cloud, no extra library.
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Tests pass deps.cvDir. SHIRUBE_CV_DIR picks another folder. With SHIRUBE_DB the folder sits next to that file.
export function cvDir(deps = {}) {
  if (deps.cvDir) return deps.cvDir;
  if (process.env.SHIRUBE_CV_DIR) return process.env.SHIRUBE_CV_DIR;
  const file = process.env.SHIRUBE_DB;
  if (file && file !== ':memory:') return join(dirname(file), 'cvs');
  return join(root, 'data', 'cvs');
}

// The only stored names we ever read or delete: a random id plus an allowed extension.
// A backup from another computer could carry any text in this column, so it is checked before it touches a path.
export const STORED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|doc)$/;

export function removeStored(deps, file) {
  if (typeof file === 'string' && STORED.test(file)) rmSync(join(cvDir(deps), file), { force: true });
}
