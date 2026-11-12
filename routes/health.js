export function health({ db }) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM jobs').get();
  return { ok: true, app: 'shirube', jobs: n };
}
