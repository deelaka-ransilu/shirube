// Shirube server: static files from public/ and a JSON API under /api/.
// Listens on 127.0.0.1 only, so other computers on the network cannot reach it.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { buildRouter } from './routes/index.js';
import { HttpError } from './lib/errors.js';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const MAX_BODY = 25_000_000; // 25 MB (a restored backup can be big)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// Blocks other websites from talking to the app through your browser.
function requestAllowed(req) {
  const host = (req.headers.host || '').toLowerCase();
  const hostname = host.replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return false;
  const origin = req.headers.origin;
  if (origin && req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      if (new URL(origin).host.toLowerCase() !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function readJsonBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') return undefined;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request is too big');
    chunks.push(chunk);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

async function serveStatic(pathname, res) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Bad path');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(publicDir, rel));
  if (file !== publicDir && !file.startsWith(publicDir + sep)) throw new HttpError(403, 'Forbidden');
  let data;
  try {
    data = await readFile(file);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  res.writeHead(200, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(data);
}

// deps is for tests: { fetchFeed, now }. The real app passes nothing.
export function createServer(db, deps = {}) {
  const route = buildRouter(db, deps);
  return http.createServer(async (req, res) => {
    try {
      if (!requestAllowed(req)) throw new HttpError(403, 'Forbidden');
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const body = await readJsonBody(req);
        const query = Object.fromEntries(url.searchParams);
        return sendJson(res, 200, await route(req.method, url.pathname, { query, body }));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      await serveStatic(url.pathname, res);
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      sendJson(res, 500, { error: 'Something went wrong' });
    }
  });
}

// Start only when run directly (npm start), not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer(openDb());
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Try: PORT=3001 npm start` : err);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => console.log(`Shirube is running at http://localhost:${port}`));
}
