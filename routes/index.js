// All API routes live here. Handlers get { db, params, query, body }
// and return an object (sent as JSON) or throw HttpError.
import { HttpError } from '../lib/errors.js';
import { health } from './health.js';

const list = [
  ['GET', '/api/health', health],
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
