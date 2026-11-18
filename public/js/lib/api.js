// Sends one file as it is (not JSON). Used for the CV file on a job.
export async function uploadFile(path, file) {
  const res = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
  let data = null;
  try { data = await res.json(); } catch { /* no JSON body */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// Talks to the server. Throws an Error with a readable message when something fails.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* no JSON body */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
