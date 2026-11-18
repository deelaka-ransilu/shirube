#!/usr/bin/env python3
"""Step 51k: "N follow-ups due" and "N new on Found" line in the hero tile,
honest labels on the stat cards, and aligned list headers.

Run from ~/projects/shirube. Every edit must match exactly once, otherwise nothing is written.
"""
import os
import re
import shutil
import sys
from collections import Counter

PAGE = 'public/js/pages/dashboard.js'
CSS = 'public/css/app.css'


def find_route(pattern):
    """Most common hash route matching pattern in the client code (so links match your real routes)."""
    seen = Counter()
    for root, _, names in os.walk('public'):
        for n in names:
            if n.endswith(('.js', '.html')):
                try:
                    text = open(os.path.join(root, n), encoding='utf-8').read()
                except OSError:
                    continue
                seen.update(re.findall(pattern, text))
    return seen.most_common(1)[0][0] if seen else None


def main():
    for p in (PAGE, CSS):
        if not os.path.exists(p):
            print(f'STOP: {p} not found. Run this from ~/projects/shirube. Nothing changed.')
            return 1
    files = {p: open(p, encoding='utf-8').read() for p in (PAGE, CSS)}

    if 'next-alerts' in files[PAGE]:
        print('STOP: this step looks already applied. Nothing changed.')
        return 1
    if 'next-match' not in files[PAGE]:
        print('STOP: step 51j is not in dashboard.js. Nothing changed.')
        return 1

    follow = find_route(r'(#/follow[a-z-]*)')
    found = find_route(r'(#/found)\b')
    if not follow or not found:
        print(f'STOP: could not find the routes (follow-ups: {follow}, found: {found}). Tell Claude. Nothing changed.')
        return 1

    js_block = (
        '    }).catch(() => {});\n'
        '  }\n'
        '\n'
        '  // Alerts: follow-ups due and new Found jobs. Both numbers are read-only (Found is not refreshed). Hidden when both are 0.\n'
        "  const alertSlot = el.querySelector('.next-alerts');\n"
        '  if (alertSlot) {\n'
        '    Promise.all([\n'
        "      api('/api/found').then((d) => Number(d?.new_count) || 0).catch(() => 0),\n"
        "      api('/api/followups/count').then((d) => Number(d?.due) || 0).catch(() => 0),\n"
        '    ]).then(([fresh, due]) => {\n'
        '      if (stale()) return;\n'
        '      const bits = [];\n'
        f'      if (due) bits.push(`<a href="{follow}">${{due}} follow-up${{due === 1 ? \'\' : \'s\'}} due</a>`);\n'
        f'      if (fresh) bits.push(`<a href="{found}">${{fresh}} new on Found</a>`);\n'
        "      alertSlot.innerHTML = bits.join('<span aria-hidden=\"true\"> \\u00b7 </span>');\n"
        '    });\n'
        '  }\n'
        '}'
    )

    EDITS = [
        # 1. empty slot under the skill match line
        (PAGE,
         '          <p class="mono text-muted next-match"></p>',
         '          <p class="mono text-muted next-match"></p>\n          <p class="mono next-alerts"></p>'),

        # 2. fill it after the page is drawn
        (PAGE,
         '    }).catch(() => {});\n  }\n}',
         js_block),

        # 3. stat cards say what they are counted out of
        (PAGE,
         '<span class="stat-of mono text-muted">${s.n} of ${den}</span>',
         "<span class=\"stat-of mono text-muted\">${s.n} of ${den}${s.key === 'applied' ? ' jobs' : ' applied'}</span>"),

        # 4. both list headers the same height, centred (the pill made one taller)
        (CSS,
         '.tile-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); }',
         '.tile-head { display: flex; justify-content: space-between; align-items: center; min-height: 34px; gap: var(--space-3); }'),

        # 5. alerts styles
        (CSS,
         '.next-match:empty { display: none; }',
         '.next-match:empty { display: none; }\n'
         '.next-alerts { margin: 0; font-size: 12px; }\n'
         '.next-alerts:empty { display: none; }\n'
         '.next-alerts a { color: var(--color-frame); font-weight: var(--weight-medium); text-decoration: underline; text-underline-offset: 3px; }'),
    ]

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

    backup = os.path.expanduser('~/shirube-backup-51k')
    os.makedirs(backup, exist_ok=True)
    for path in files:
        shutil.copy(path, os.path.join(backup, path.replace('/', '__')))
    for path, text in files.items():
        open(path, 'w', encoding='utf-8').write(text)
    print(f'Applied step 51k (links: {follow}, {found}). Backup in', backup)
    return 0


if __name__ == '__main__':
    sys.exit(main())
