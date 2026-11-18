#!/usr/bin/env python3
"""Step 51j: skill match line on the Dashboard 'next' tile + outlined 'See all jobs' pill.

Run from ~/projects/shirube. Every edit must match exactly once, otherwise nothing is written.
"""
import os
import re
import shutil
import sys

PAGE = 'public/js/pages/dashboard.js'
CSS = 'public/css/app.css'

ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>'

EDITS = [
    # 1. an empty slot for the match line (hidden by CSS while empty)
    (PAGE,
     '          <div class="next-foot">',
     '          <p class="mono text-muted next-match"></p>\n          <div class="next-foot">'),

    # 2. fill the slot after the page is drawn; a failed or empty match leaves it hidden
    (PAGE,
     '          <div class="rows">${appliedRows}</div>\n          </div>\n        </section>\n      </div>\n    </div>`;',
     '          <div class="rows">${appliedRows}</div>\n          </div>\n        </section>\n      </div>\n    </div>`;\n'
     '\n'
     '  // Skill match for the suggested job: same answer the Job match page uses. Never blocks the Dashboard.\n'
     "  const matchSlot = el.querySelector('.next-match');\n"
     '  if (matchSlot && jobId) {\n'
     '    api(`/api/jobs/${jobId}/match`).then((d) => {\n'
     '      const list = d?.match?.skills || [];\n'
     '      if (!d?.job?.has_advert || !list.length) return;\n'
     '      const hit = list.filter((s) => s.matched).length;\n'
     "      matchSlot.textContent = `${hit} of ${list.length} skills match` + (d.preset?.name ? ` \u00b7 ${d.preset.name}` : '');\n"
     '    }).catch(() => {});\n'
     '  }'),

    # 3. See all jobs: outlined pill with an arrow
    (PAGE,
     '<a class="link text-sm" href="#/jobs">See all jobs</a>',
     '<a class="btn-see" href="#/jobs">See all jobs' + ARROW + '</a>'),

    # 4. styles
    (CSS,
     '.btn-open svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }',
     '.btn-open svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }\n'
     '.next-match { margin: 0; font-size: 12px; }\n'
     '.next-match:empty { display: none; }\n'
     'a.btn-see { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px 7px 16px; border: 1.5px solid var(--color-frame); border-radius: var(--radius-control); color: var(--color-frame); background: transparent; font-size: 13px; font-weight: var(--weight-medium); text-decoration: none; }\n'
     'a.btn-see:hover { background: var(--color-frame); color: #FFFFFF; }\n'
     '.btn-see svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }'),
]


def main():
    files = {}
    for path, _, _ in EDITS:
        if path not in files:
            if not os.path.exists(path):
                print(f'STOP: {path} not found. Run this from ~/projects/shirube. Nothing changed.')
                return 1
            files[path] = open(path, encoding='utf-8').read()

    if 'next-match' in files[PAGE]:
        print('STOP: this step looks already applied. Nothing changed.')
        return 1
    if 'next-foot' not in files[PAGE]:
        print('STOP: step 51i is not in dashboard.js. Nothing changed.')
        return 1
    if not re.search(r'import\s*\{[^}]*\bapi\b[^}]*\}', files[PAGE]):
        print('STOP: dashboard.js does not import api(). Tell Claude. Nothing changed.')
        return 1

    bad = False
    for path, old, new in EDITS:
        n = files[path].count(old)
        if n != 1:
            print(f'FAILED in {path}: expected 1 match, found {n} for:\n  {old[:90]}')
            bad = True
        else:
            files[path] = files[path].replace(old, new)
    if bad:
        print('Nothing changed.')
        return 1

    backup = os.path.expanduser('~/shirube-backup-51j')
    os.makedirs(backup, exist_ok=True)
    for path in files:
        shutil.copy(path, os.path.join(backup, path.replace('/', '__')))
    for path, text in files.items():
        open(path, 'w', encoding='utf-8').write(text)
    print('Applied step 51j. Backup in', backup)
    return 0


if __name__ == '__main__':
    sys.exit(main())
