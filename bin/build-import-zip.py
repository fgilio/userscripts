#!/usr/bin/env python3
"""Build a Tampermonkey-importable zip from this repo.

    bin/build-import-zip.py            -> dist/userscripts-import.zip

Load it with Tampermonkey -> Utilities -> Import from file. The import merges rather
than wipes. README.md documents the matching rules under "Syncing the repo into
Tampermonkey".

Operationally: a script ships with its options.json when backup/ has one (so its
uuid, enabled state and sidebar position survive), and source-only otherwise
(matched by @name + @namespace).
"""
import glob
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / 'dist' / 'userscripts-import.zip'

# Same grammar as bin/check.sh enforces, so a header the linter rejects cannot
# ship a different @name than the one the linter validated.
NAME_RE = re.compile(r'^// @name[ \t]+(.+?)[ \t]*$', re.M)


def meta_name(source):
    """@name from the metadata block only, never from a stray body comment."""
    block, _, _ = source.partition('// ==/UserScript==')
    m = NAME_RE.search(block)
    return m.group(1) if m else None


def main():
    os.chdir(REPO)

    lint = subprocess.run(['bin/check.sh'], capture_output=True, text=True)
    if lint.returncode:
        sys.exit(f'refusing to build, bin/check.sh reports errors:\n{lint.stdout}{lint.stderr}')

    backups = sorted(glob.glob('backup/tampermonkey-export-*'))
    backup = backups[-1] if backups else None
    if not backup:
        print('note: no backup/tampermonkey-export-* found (it is gitignored, so a fresh\n'
              '      clone has none). Every script will ship source-only and be matched by\n'
              '      @name + @namespace. Enabled state and sidebar position will not be\n'
              '      restored. Export from Tampermonkey into backup/ to regain that.\n')

    # meta.name (verbatim, may contain '/') -> options.json path
    options_by_name = {}
    for path in glob.glob(os.path.join(backup or '', '*.options.json')):
        try:
            options_by_name[json.load(open(path))['meta']['name']] = path
        except (OSError, ValueError, KeyError):
            continue

    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows = []

    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        for script in sorted(glob.glob('scripts/*.user.js')):   # retired/ is not globbed
            source = open(script, encoding='utf-8').read()
            name = meta_name(source)
            if not name:
                print(f'  skip {script}: no @name in the metadata block')
                continue

            # Tampermonkey groups the three files by the part before the suffix,
            # and the suffixes must be exactly .user.js / .options.json / .storage.json.
            base = os.path.basename(script)[:-len('.user.js')]
            z.writestr(f'{base}.user.js', source)

            opt = options_by_name.get(name)
            if not opt:
                rows.append((base, 'by @name+@namespace', '-', '-'))
                continue

            data = json.load(open(opt))
            z.writestr(f'{base}.options.json', json.dumps(data, indent=1))

            stored = 0
            storage = opt[:-len('.options.json')] + '.storage.json'
            if os.path.exists(storage):
                blob = json.load(open(storage))
                stored = len(blob.get('data') or {})
                if stored:                    # empty storage is not restored anyway
                    z.writestr(f'{base}.storage.json', json.dumps(blob))

            settings = data.get('settings', {})
            rows.append((base,
                         'uuid ' + data['meta']['uuid'][:8],
                         'on' if settings.get('enabled') else 'OFF',
                         f'pos {settings.get("position")}'
                         + (f', {stored} stored key(s)' if stored else '')))

    if not rows:
        sys.exit('no scripts found. Expected at least one file matching scripts/*.user.js')

    w = max(len(r[0]) for r in rows)
    print(f'{"script".ljust(w)}  matched by            state  notes')
    for base, how, state, notes in rows:
        print(f'{base.ljust(w)}  {how.ljust(20)}  {state.ljust(5)}  {notes}')
    print(f'\n{len(rows)} script(s) -> {OUT.relative_to(REPO)} ({OUT.stat().st_size} bytes)')
    print('\nImport it: Tampermonkey -> Utilities -> Import from file -> Choose File')
    print('Tampermonkey shows a confirmation screen listing every script before applying.')


if __name__ == '__main__':
    main()
