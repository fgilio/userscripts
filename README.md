# Userscripts

Franco's Tampermonkey userscripts. Source of truth for what is installed in Chrome.

`CLAUDE.md` is the playbook: conventions, the SPA boot pattern, testing, install.
`_template.user.js` is the starting point for a new script.

```bash
bin/check.sh                              # lint every script
bin/build-import-zip.py                   # repo -> dist/userscripts-import.zip (lints first)
bin/install.sh scripts/<name>.user.js     # push one script into Tampermonkey
```

## Installed

| Script | Sites | What it does |
|---|---|---|
| `github-actions-ci-branch-pin` | `github.com/*/*/actions*` | Pins **CI+main** at the top of the Actions sidebar, one click to the CI workflow on the repo's default branch. Branch is detected per repo and cached 7 days |
| `github-nav-reorder` | `github.com/*` | Repo tabs reordered to Settings, Code, Pull requests, Actions, Releases. Settings pulled to the front of the org nav. Flattens the "More" overflow, adds a synthetic Releases tab, hides all tab icons |
| `github-tab-title-numbers` | `github.com/*` | Prefixes the tab title with the issue/PR/discussion number. On Actions run pages, uses the originating PR number, falling back to the run number |
| `github-auto-expand-single-check-group` | `github.com/*/*/pull/*` | On the PR Checks tab, expands the only check group when a PR has one |
| `github-pr-commits-newest-first` | `github.com/*/*/pull/*` | Reverses the PR Commits tab so the newest commit and newest day are on top |
| `laravel-cloud-nightwatch-linker` | `cloud.laravel.com`, `nightwatch.laravel.com` | Native-looking cross-links between a Laravel Cloud environment and its Nightwatch dashboard. Learns the pairing once, then remembers it |
| `laravel-cloud-collapsible-permissions` | `cloud.laravel.com/*` | API token modal: collapsible permission categories, Select all / Clear with a live count, and a search box over the Resources list |
| `universal-sidebar-toggle` | 10 sites | Hyper+S (⌘⇧⌃⌥S) toggles the sidebar. Per-site selector config. Handles Closure Library and pointer-event quirks |

Retired scripts are in `scripts/retired/` with the reason recorded (see that folder's README).

## Known fragilities

Ranked by how likely they are to break. Hashed CSS-module class names change without
notice. When a script goes quiet, check the console first, because each one names the
selector that missed.

| Script | Risk | What breaks it |
|---|---|---|
| `github-pr-commits-newest-first` | high | `div.prc-Timeline-Timeline-awSoC`, `ul.ListView-module__ul__uMK30`, both hashed |
| `github-nav-reorder` | high | `ul.prc-components-UnderlineItemList-xKlKC`, `ul.prc-ActionList-ActionList-rPFF2`, both hashed. Fails safe: the nav reveals itself unreordered after 1.5 s |
| `laravel-cloud-collapsible-permissions` | medium | Structural heuristics ("a div whose 2 children look like a header and a checkbox list") plus literal `color(display-p3 ...)` tokens sampled from the live page |
| `laravel-cloud-nightwatch-linker` | medium | Finds its mount point by the button text "Visit" and by `aside button[role=combobox]` |
| `universal-sidebar-toggle` | low | Per-site `data-testid` / `aria-label` selectors, several per site as fallbacks |
| `github-actions-ci-branch-pin` | low | Primer classes (`ActionListItem`) are stable; also parses `"defaultBranch"` out of the repo home page, with the refs endpoint as fallback |
| `github-auto-expand-single-check-group` | low | `details.checks-list-item` |
| `github-tab-title-numbers` | low | Reads the number from the URL. Only the Actions-run label is scraped |

## Syncing the repo into Tampermonkey

`bin/build-import-zip.py` builds `dist/userscripts-import.zip`, refusing to build if
`bin/check.sh` reports an error. Load it with
**Tampermonkey → Utilities → Import from file**. A confirmation screen lists every script
before anything is applied.

**Do not delete your installed scripts first.** The import is a merge, not a wipe:

```
For each script in the zip
├── options.json present?
│   └── yes → match on meta.uuid
│       ├── uuid installed     → UPDATE IN PLACE, keeping enabled state and position
│       └── uuid not installed → install new, reusing that uuid
└── no options.json
    └── match on @name + @namespace from the source
        ├── found     → UPDATE IN PLACE
        └── not found → install new
```

Nothing outside the zip is touched, so deleting first buys nothing and risks losing
`GM_setValue` data. Seven of the eight shipping scripts carry their original `options.json`,
so their uuid, enabled state and sidebar position all survive. `github-actions-ci-branch-pin`
has no export yet and is matched by `@name` + `@namespace`, so it installs cleanly either way.

Two consequences worth knowing:

- **`@name` and `@namespace` are the fallback identity**, which is why they must never change
  on an installed script (see CLAUDE.md).
- **Storage is replaced, not merged**, and only when `storage.json` has a non-empty `data`
  object. Only `laravel-cloud-nightwatch-linker` has any. Re-export before importing if you
  have paired new environments since the snapshot in `backup/`.

Retired scripts are excluded from the zip. Importing will not remove them, so delete those
in the Tampermonkey dashboard.

## Backups

`backup/tampermonkey-export-<date>/` holds the raw Tampermonkey export: per-script
`.options.json` (enabled state, position, match overrides) and `.storage.json` (`GM_setValue`
data). Only `laravel-cloud-nightwatch-linker` stores anything real, its Cloud/Nightwatch
environment mappings.

**Gitignored on purpose:** those mappings contain internal publica.la environment UUIDs.
Re-export from Tampermonkey → Utilities → Export after any change worth keeping.

## Git

Keep the remote private if `backup/` is ever un-ignored: those exports carry internal
environment UUIDs.
