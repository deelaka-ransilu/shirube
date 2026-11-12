// How stages and a job's status fit together. Pure functions, easy to test.
export const STAGE_KINDS = ['applied', 'follow_up', 'reply', 'interview', 'offer', 'rejected', 'other'];

// These stage kinds decide the job status. follow_up and other never change it.
export const STATUS_KINDS = ['applied', 'reply', 'interview', 'offer', 'rejected'];
const ORDER = ['applied', 'reply', 'interview', 'offer'];

// Rejected wins; otherwise the furthest step reached; no steps = still to apply.
export function statusFromStages(stages) {
  const kinds = new Set(stages.map((s) => s.kind));
  if (kinds.has('rejected')) return 'rejected';
  for (let i = ORDER.length - 1; i >= 0; i--) if (kinds.has(ORDER[i])) return ORDER[i];
  return 'open';
}

// Earliest dated Applied stage, or '' when there is none.
export function appliedOnFromStages(stages) {
  const dates = stages.filter((s) => s.kind === 'applied' && s.happened_on).map((s) => s.happened_on).sort();
  return dates[0] ?? '';
}
