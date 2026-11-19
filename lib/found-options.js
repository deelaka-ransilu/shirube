// The one place the New jobs (Found) filter options live. The server uses it to validate searches,
// and sends the display part to the page in every /api/found answer, so the page hard-codes none of it.
export const FOUND_OPTIONS = {
  source: 'ITPro',                 // the only site that is read
  refresh_minutes: 30,             // ITPro's feed says ttl 30, so it is asked at most this often
  default_posted: '3d',
  posted: [                        // days back from today; null = no limit
    { key: 'today', label: 'Today', days: 0 },
    { key: '3d', label: '3 days', days: 3 },
    { key: 'week', label: 'Week', days: 7 },
    { key: 'any', label: 'Any time', days: null },
  ],
  work_modes: [
    { key: 'any', label: 'Any' },
    { key: 'onsite', label: 'On-site' },
    { key: 'hybrid', label: 'Hybrid' },
    { key: 'remote', label: 'Remote' },
  ],
  other_sites: ['TopJobs', 'LinkedIn', 'Rooster', 'Xpress Jobs'],   // not connected: shown grayed out, nothing more
};

// What the page gets: the same lists without the server-only "days".
export function publicFoundOptions() {
  const { posted, ...rest } = FOUND_OPTIONS;
  return { ...rest, posted: posted.map(({ key, label }) => ({ key, label })) };
}
