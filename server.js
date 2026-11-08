// Starts Shirube. Serves the pages in public/ and (later) the API in routes/.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js'; // opens the database and creates the tables

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = join(root, 'public');
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // API routes are added in the Profile step.
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const filePath = join(publicDir, requested);

  // Refuse any path that leaves the public folder.
  if (!filePath.startsWith(publicDir + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Bound to this machine only, so nothing else on your network can reach it.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Shirube is running at http://localhost:${PORT}`);
});