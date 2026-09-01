# Userscripts

My Tampermonkey userscripts, and the source of truth for what's installed in my Chrome.

Every one of these started the same way. Something I do many times a day, that the site
makes slightly worse than it has to be. Tabs in an order nobody chose. A permissions
modal with no "select all". Two dashboards that clearly know about each other and still
don't link to each other. A sidebar with a keyboard shortcut on one site and nothing on
the next nine. None of it is hard to fix, which is the annoying part.

Six of these are GitHub, three are Laravel Cloud, and one is a single sidebar toggle
that behaves the same way across ten sites that each hide their sidebar behind a
different button. They're built for my habits, so treat the list as a menu rather than a
suite.

## Install

Install [Tampermonkey](https://www.tampermonkey.net/), then click a script name in the
table below. Tampermonkey recognises a raw `.user.js` URL and shows its own install
prompt. Every script carries `@updateURL`, so it tracks `main` from then on.

Built and used in Chrome on macOS. Nothing here is Chrome-specific, so Firefox with
Tampermonkey or Violentmonkey ought to work, but I haven't tried it.

Worth knowing before you install anything:

- **Every script is self-contained.** No `@require`, no remote code, no `eval`, no build
  step, and nothing is ever sent anywhere. [SECURITY.md](SECURITY.md) says exactly what
  each one touches.
- **These read the DOM of specific sites.** When a site redesigns, a script stops
  working rather than breaking the page. Check the console first: each one names the
  selector that missed. [Known fragilities](#known-fragilities) ranks them.
- **Pick the ones you want.** Several encode my own preferences about tab order and
  keyboard chords, which may well not be yours.

Changing anything locally, or want the whole set at once? See
[CONTRIBUTING.md](CONTRIBUTING.md) and *Syncing the repo into Tampermonkey* below.

## Installed

| Script | Sites | What it does |
|---|---|---|
| [`github-actions-ci-branch-pin`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-actions-ci-branch-pin.user.js) | `github.com/*/*/actions*` | Pins **CI+main** at the top of the Actions sidebar, one click to the CI workflow on the repo's default branch. Branch is detected per repo and cached 7 days |
| [`github-nav-reorder`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-nav-reorder.user.js) | `github.com/*` | Repo tabs reordered to Settings, Code, Pull requests, Actions, Releases. Settings pulled to the front of the org nav. Flattens the "More" overflow, adds a synthetic Releases tab, hides all tab icons |
| [`github-tab-title-numbers`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-tab-title-numbers.user.js) | `github.com/*` | Prefixes the tab title with the issue/PR/discussion number, and on PRs a CI marker (`✓` passed, `✗` failed, `…` still running) so a background tab shows the result without switching to it. On Actions run pages, uses the originating PR number, falling back to the run number |
| [`github-auto-expand-single-check-group`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-auto-expand-single-check-group.user.js) | `github.com/*/*/pull/*` | On the PR Checks tab, expands every workflow when there are three or fewer. Above three, expands the one named `CI` plus any workflow holding a failure, whatever that one is called, falling back to all of them when neither exists |
| [`github-pr-checks-signal-first`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-checks-signal-first.user.js) | `github.com/*/*/pull/*` | On the PR Checks tab, floats whatever needs attention to the top: workflows are ordered by their worst job, jobs by their own status, and skipped jobs sink to the bottom dimmed. A single failure buried at row 16 of 17 ends up first |
| [`github-pr-commits-newest-first`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-commits-newest-first.user.js) | `github.com/*/*/pull/*` | Reverses the PR Commits tab so the newest commit and newest day are on top |
| [`laravel-cloud-nightwatch-linker`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-nightwatch-linker.user.js) | `cloud.laravel.com`, `nightwatch.laravel.com` | Native-looking cross-links between a Laravel Cloud environment and its Nightwatch dashboard. Learns the pairing once, then remembers it |
| [`laravel-cloud-copy-deployment-logs`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-copy-deployment-logs.user.js) | `cloud.laravel.com/*` | A copy button on every deployment step and on each of the two log sections. Copies the log as plain text without expanding anything, including the technical failure cause the page never shows. Idle on every other page |
| [`laravel-cloud-collapsible-permissions`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-collapsible-permissions.user.js) | `cloud.laravel.com/*` | API token modal: collapsible permission categories, Select all / Clear with a live count, and a search box over the Resources list |
| [`laravel-cloud-firewall-rules-unclip`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-firewall-rules-unclip.user.js) | `cloud.laravel.com/*` | On edge network zone pages, truncates long firewall rule names with an ellipsis (full name on hover) so the events count stays visible, and locks the rules cards against the stray horizontal scroll that hides the action column. Idle on every other page |
| [`laravel-cloud-firewall-rule-ids`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-firewall-rule-ids.user.js) | `cloud.laravel.com/*` | On edge network zone pages, prints each custom, rate limit and cache rule's provider id under its name, in the rules table and under the name field of the rule editor, so a rule id read off a Cloudflare log names a rule you can see. Idle on every other page |
| [`universal-sidebar-toggle`](https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/universal-sidebar-toggle.user.js) | 10 sites | Hyper+S (⌘⇧⌃⌥S) toggles the sidebar. Per-site selector config. Handles Closure Library and pointer-event quirks |

Retired scripts are in `scripts/retired/` with the reason recorded (see that folder's README).

## Known fragilities

Ranked by how likely they are to break. Hashed CSS-module class names change without
notice. When a script goes quiet, check the console first: it warns once and names what
it looked for.

Two scripts stay silent deliberately, because a missing target is a normal state for
them rather than a break: `github-auto-expand-single-check-group` (a PR with no check
groups) and `github-tab-title-numbers` (the run label is null until React hydrates, and
the observer simply runs again).

| Script | Risk | What breaks it |
|---|---|---|
| `github-pr-commits-newest-first` | high | `div.prc-Timeline-Timeline-awSoC`, `ul.ListView-module__ul__uMK30`, both hashed |
| `github-nav-reorder` | high | `ul.prc-components-UnderlineItemList-xKlKC`, `ul.prc-ActionList-ActionList-rPFF2`, both hashed. Fails safe: the nav reveals itself unreordered after 1.5 s |
| `laravel-cloud-collapsible-permissions` | medium | Structural heuristics ("a div whose 2 children look like a header and a checkbox list") plus literal `color(display-p3 ...)` tokens sampled from the live page |
| `laravel-cloud-nightwatch-linker` | medium | Finds its mount point by the button text "Visit" and by `aside button[role=combobox]` |
| `laravel-cloud-copy-deployment-logs` | medium | Reads the deployment payload out of the page's own JSON script, keyed on `deploymentBuildSteps` / `deploymentDeploySteps`. Mounts on `div.sticky.justify-between` and `button.group/inner`. Degrades to copying the expanded log when the payload stops making sense |
| `laravel-cloud-firewall-rules-unclip` | medium | Anchors on each rule row's dnd-kit drag handle (`aria-roledescription="sortable"`, durable), then walks a fixed shape: `.group` row, a flex strip, a 3-child `flex-1` cell. Warns once and leaves the table native when the shape changes |
| `laravel-cloud-firewall-rule-ids` | medium | The same drag-handle anchor and row shape as `-unclip`, plus the rule payload keyed on `firewallRules` / `rateLimitRules` / `cacheRules` and paired to a row by rule name. In the editor it anchors on `input#rule_name` and the `data-slot` field wrapper around it. Prints nothing, and says so once, when any of that stops matching |
| `universal-sidebar-toggle` | low | Per-site `data-testid` / `aria-label` selectors, several per site as fallbacks |
| `github-actions-ci-branch-pin` | low | Primer classes (`ActionListItem`) are stable. Also parses `"defaultBranch"` out of the repo home page, with the refs endpoint as fallback |
| `github-auto-expand-single-check-group` | low | `details.checks-list-item` |
| `github-pr-checks-signal-first` | medium | Reads status from the `aria-label` on each job's icon (`This job failed`, `This job was skipped`), which is durable. Reorders the `div.js-socket-channel` wrappers GitHub live-updates over, which is the risky half |
| `github-tab-title-numbers` | low | Reads the number from the URL. Only the Actions-run label is scraped |

## Working on this repo

```bash
bin/check.sh                              # lint every script
bin/check.sh scripts/<name>.user.js       # lint one
bin/test.sh                               # run test/*.test.js (plain node, no framework)
bin/install.sh scripts/<name>.user.js     # push one script into Tampermonkey
bin/build-import-zip.py                   # repo -> dist/userscripts-import.zip (lints first)
bin/build-import-zip.py --source-only     # the same, carrying no local state
```

No build step and nothing to install: `bin/check.sh` wants `bash` and `node`, the zip
builder wants `python3`. [CONTRIBUTING.md](CONTRIBUTING.md) has the golden rules and the
pre-PR checklist. `CLAUDE.md` is the long-form playbook: header fields, the SPA boot
pattern, `@run-at` selection, making injected UI look native, and testing through Chrome.
`_template.user.js` is the file you copy to start a new script, and the home of the boot
block. `snippets/` holds reference patterns, not canon.

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

The remote is public. `backup/` stays gitignored permanently, and that is the whole of the
privacy story for the working tree: those exports carry internal environment UUIDs, so
un-ignoring the directory publishes them.
