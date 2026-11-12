// Temporary page for step 1. The real shell replaces this in step 2.
const status = document.getElementById('status');
try {
  const res = await fetch('/api/health');
  const data = await res.json();
  status.textContent = `Server and database are working. Jobs saved: ${data.jobs}.`;
} catch {
  status.textContent = 'Could not reach the server.';
}
