// Every call to the jobs API goes through this file.

async function readJson(res) {
  return res.json().catch(() => ({}));
}

export async function loadJobs(stage, sort) {
  const url = `/api/jobs?stage=${encodeURIComponent(stage)}&sort=${encodeURIComponent(sort)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load jobs');
  return res.json();
}

export async function sendJson(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export async function deleteJob(id) {
  const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || 'Could not delete job.');
  return data;
}

export async function getJob(id) {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) throw new Error('Job not found.');
  return res.json();
}

export async function loadFound(refresh) {
  const res = await fetch(refresh ? '/api/found?refresh=1' : '/api/found');
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || 'Could not load postings.');
  return data;
}

export function saveFound(externalId) {
  return sendJson('/api/found/save', 'POST', { external_id: externalId });
}

export function dismissFound(externalId) {
  return sendJson('/api/found/dismiss', 'POST', { external_id: externalId });
}
