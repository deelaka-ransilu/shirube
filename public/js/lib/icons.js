// Small line icons, same stroke style as the sidebar. Each one is a trusted raw() SVG string.
import { raw } from './html.js';

export const icon = (paths) => raw(`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`);

export const ICON = {
  save: icon('<path d="M6 4h12v17l-6-4-6 4z"/>'),
  saved: icon('<path d="M5 12l5 5 9-10"/>'),
  open: icon('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>'),
  hide: icon('<path d="M3 3l18 18M10.6 6.2A9 9 0 0121 12a13 13 0 01-3.2 3.9M6.4 7.7A13 13 0 003 12s3.5 6 9 6a9 9 0 003.4-.7M9.9 9.9a3 3 0 004.2 4.2"/>'),
  unhide: icon('<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="3"/>'),
  edit: icon('<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>'),
  back: icon('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  undo: icon('<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>'),
  settings: icon('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  download: icon('<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>'),
  upload: icon('<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>'),
  match: icon('<path d="M9 6h11M9 12h11M9 18h11M3.5 6l1.2 1.2L7 4.8M3.5 12l1.2 1.2L7 10.8M3.5 18l1.2 1.2L7 16.8"/>'),
  note: icon('<path d="M5 4h14v11l-5 5H5zM14 20v-5h5M8.5 9h7M8.5 13h4"/>'),
  refresh: icon('<path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5"/>'),
  trash: icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'),
};
