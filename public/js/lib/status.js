// Status = shape + word, never colour alone.
export const STATUS = {
  open:      { symbol: '◌', label: 'To apply' },
  applied:   { symbol: '●', label: 'Applied' },
  reply:     { symbol: '○', label: 'Reply' },
  interview: { symbol: '■', label: 'Interview' },
  offer:     { symbol: '◆', label: 'Offer' },
  rejected:  { symbol: '▲', label: 'Rejected' },
};
export const STATUS_KEYS = Object.keys(STATUS);
export const hasStatus = (key) => Object.hasOwn(STATUS, key);
export const statusText = (key) => (hasStatus(key) ? `${STATUS[key].symbol} ${STATUS[key].label}` : key);
// For badges: "To apply" shows the word only (its ◌ symbol looks like ○ when small). The others keep shape + word.
export const badgeText = (key) => (key === 'open' && hasStatus(key) ? STATUS[key].label : statusText(key));

// Where a job can go from here. A stage is added for the move (the job's status follows its stages),
// so only forward moves are offered; going back means removing the stage in Job detail.
const NEXT = { open: ['applied'], applied: ['reply', 'interview', 'offer', 'rejected'], reply: ['interview', 'offer', 'rejected'], interview: ['offer', 'rejected'], offer: ['rejected'], rejected: [] };
export const nextStatuses = (key) => NEXT[key] ?? [];
