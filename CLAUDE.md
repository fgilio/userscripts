# Userscripts

Tampermonkey userscripts for Chrome. One file per script in `scripts/`, self-contained, no build step.

## Layout

```
scripts/      one <kebab-name>.user.js per script (the only source of truth)
snippets/     reference patterns to copy from (see snippets/README.md, not canon)
test/         *.test.js, plain node, no framework. Logic that needs no browser
bin/          check.sh (lint), test.sh, build-import-zip.py (repo -> importable zip), install.sh
backup/       raw Tampermonkey export: .options.json + .storage.json (gitignored)
_template.user.js   start here for a new script, and the home of the boot block
```

Public-facing docs: `README.md` (install links + what each script does),
`CONTRIBUTING.md` (golden rules, pre-PR checklist), `SECURITY.md` (what every script
touches). Keep `SECURITY.md` true: update it whenever a script gains a `@grant`, a
network call, or a new capability.

## Golden rules

1. **Never change `@name` or `@namespace` of an installed script.** Tampermonkey identifies a
   script by that pair. Change either one and a re-install creates a DUPLICATE that runs
   alongside the old one. Rename the *file* freely. The header stays.
2. **Scripts are self-contained.** No `@require`, no build step. Copy shared code from
   `snippets/` instead. Three reasons, none of them "Chrome blocks it" (Chrome gates
   `file://` behind an extension toggle, and `bin/install.sh` already serves over localhost):

   - A `@require` pointing at a local path or `127.0.0.1` breaks on any other machine, and
     the moment the server stops.
   - `@require` content is cached at install time, so editing a snippet would not reach
     installed scripts without a version bump on every consumer.
   - A build step would cost `scripts/` its status as the only source of truth.
3. **Idempotent by construction.** Every entry point must be safe to call 100x/second. Guard
   with a DOM marker (`getElementById`, `dataset.fgDone`), never with a "did I already run"
   flag. SPA navigation destroys the DOM but not your closure.
4. **Never `alert` / `confirm` / `prompt`.** They block the page and freeze browser automation.
   Use an injected inline input, or `GM_registerMenuCommand` for config. One script breaks
   this: `laravel-cloud-nightwatch-linker` reads a pasted URL with `prompt()` when a pairing
   is missing. It carries the mandatory `check-ignore: prompt` pragma and SECURITY.md
   documents it. Replacing it with an inline input is the standing fix, and no new script
   gets the same exemption.
5. **Fail visible, not silent.** When a selector misses, `console.warn` once with the selector
   text. Six months later that message is the whole debugging session.

## Writing a new script

```
Start
├── cp _template.user.js scripts/<kebab-name>.user.js
├── Header
│   ├── @name        Title Case, human-readable, permanent
│   ├── @namespace   https://github.com/fgilio          (all new scripts)
│   ├── @version     semver, bump on every edit
│   ├── @description one sentence: what appears, where, what for
│   ├── @author      Franco Gilio
│   ├── @match       narrowest pattern that works: https://github.com/*/*/pull/*
│   │                 not https://github.com/*
│   ├── @icon        site favicon (see table below), warn if absent
│   ├── @run-at      document-idle, EXCEPT anti-flicker work → document-start
│   ├── @noframes    unless the script must run inside iframes
│   └── @grant       none, or the exact GM_* functions used
├── Body
│   ├── IIFE + 'use strict'
│   ├── const TAG = '[script-name]'   for every console call
│   ├── Route guard   : regex on location.pathname, anchored, escaped
│   ├── apply()       : idempotent, early-return when the DOM is not ready
│   └── boot()        : wire the observer and the nav events
└── Test → Install → Record in README.md
```

### Choosing `@run-at`

| Goal | Value | Why |
|---|---|---|
| Add / read / rearrange existing UI | `document-idle` | DOM exists, cheapest |
| Prevent a flash of native layout | `document-start` | inject CSS before first paint (`snippets/anti-flicker.js`) |
| Rewrite `document.title` | `document-start` | beat the site's own title write |

### SPA navigation, the single largest source of bugs

GitHub, Laravel Cloud, ChatGPT and friends swap content without a page load. A script that
runs once is a script that works once. `_template.user.js` carries the boot block. It covers:

- `MutationObserver` on `document.documentElement` (not `body`, which is null at `document-start`)
- `soft-nav:end` (GitHub React nav), `turbo:load`, `turbo:render`, `turbo:frame-render`, `pjax:end`
- `popstate` + patched `history.pushState` / `replaceState`

**Debounce with `setTimeout`, never `requestAnimationFrame`.** rAF does not fire in a background
tab, so a script scheduled on rAF silently does nothing until the tab is focused. Every
cmd-clicked link is a background tab. It is also cheaper in the foreground: a 50 ms timer
caps the callback at 20 Hz where rAF ran it at 60. Reference this paragraph from a script
rather than restating it. `bin/check.sh` enforces it (rules `raf` and `debounce`).

The `history.pushState` / `replaceState` patch at the bottom of `_template.user.js` is
**conditional**: include it only when the script's output derives from the URL rather than
the DOM. A DOM-driven script already sees the change through the observer. Only
`github-tab-title-numbers` needs it.

### Making injected UI look native

Best result, in order of preference:

1. **Clone a sibling element** (`snippets/clone-native.js`). Inherits every design-system class,
   including whichever variant the site is currently rendering. Then swap only the icon `<svg>`
   and the label text node. This is what `laravel-cloud-nightwatch-linker` does with the
   "Visit" button, and why it still looks right after redesigns.
2. **Reuse the site's class names** (`ActionListItem`, `ActionListContent`). Works on stable
   design systems like Primer. See `github-actions-ci-branch-pin`.
3. **Hand-styled inline CSS** with tokens sampled from the live page. Last resort, and this is why
   `laravel-cloud-collapsible-permissions` carries a block of literal
   `color(display-p3 ...)` values.

Build SVG with `createElementNS`, not `innerHTML`, so Trusted-Types pages cannot reject it.
No site in this repo sent `require-trusted-types-for` as of 2026-08-19, so `bin/check.sh`
has no `innerHTML` rule. Add one keyed on `@match` host if that changes.

### Selectors, from most to least durable

```
Durable    aria-label / role / data-testid / data-tab-item / href shape
Usable     semantic tags + structure (aside > ul > li)
Fragile    hashed CSS-module classes  →  ul.ListView-module__ul__uMK30
```

Hashed classes change without notice. If you must use one, name it in a `const` at the top,
`console.warn` once when it misses, and note it in the README fragility column.

## Testing (Chrome MCP)

Do not install a draft. Inject and iterate first:

```
1. mcp__claude-in-chrome__tabs_context_mcp     → find or open the target tab
2. javascript_tool                             → paste the IIFE body, run it
3. read_page / screenshot                      → confirm the visual result
4. Re-inject after edits (a full page load wipes the injection, which is expected)
```

Gotchas seen in practice:

- `javascript_tool` refuses `chrome-extension://` URLs, so Tampermonkey's editor cannot be
  automated. Installing is always a manual paste by Franco.
- `javascript_tool` output containing URLs or query strings gets blocked. Strip `href`/`?&=`
  from anything you print.
- `GM_*` is undefined when injected this way. Stub it: `const GM_getValue = (k, d) => d`.
- Verify in a **background** tab too if the script uses a debounce.

## Installing

### Updating what is already installed: use this, it is the good one

After pushing to `main`, open every changed script's raw URL. Tampermonkey recognises a
`.user.js` URL and shows an **update** prompt, matched on `@name` + `@namespace`, so each
one updates in place. Franco confirmed this is the flow he wants (2026-08-23).

```bash
BASE="https://raw.githubusercontent.com/fgilio/userscripts/main/scripts"
for f in $(git ls-files 'scripts/*.user.js' | xargs -n1 basename); do open "$BASE/$f"; done
```

One `open` per script, one click each, and nothing else touched. Three reasons it beats
every other route:

- **It never touches `GM_setValue` storage.** Only the script body changes.
- **It needs no local server**, unlike `bin/install.sh`.
- **It arms `@updateURL`.** From then on Tampermonkey tracks `main` by itself, so this
  manual pass is only needed for a script that does not yet carry the header.

Before doing this on a script that stores anything, re-export into `backup/` first. It is
the only rollback point, and a storage migration runs on first read of the new version.

### Do NOT use the zip to update in place

`bin/build-import-zip.py` **replaces** storage rather than merging it, from whatever
snapshot is sitting in `backup/`. Running it to update a live browser pushes a stale
`storage.json` over newer data and silently drops every pairing made since the export.
The zip is for restoring onto a fresh machine. Nothing else.

### One script, from a working copy that is not pushed yet

```bash
bin/install.sh scripts/<name>.user.js     # serves over localhost, Tampermonkey prompts
pbcopy < scripts/<name>.user.js           # fallback: paste into a new Tampermonkey script
```

### Everything, onto a fresh machine

```bash
bin/build-import-zip.py                   # -> dist/userscripts-import.zip
bin/build-import-zip.py --source-only     # no local state, safe to hand to anyone
# Tampermonkey → Utilities → Import from file → Choose File
```

It refuses to build if `bin/check.sh` reports an error, and warns when a default build
carries private storage. Tampermonkey falls back to matching on `@name` + `@namespace`, so
golden rule 1 is enforced by the extension itself. Full matching rules: README.md,
*Syncing the repo into Tampermonkey*.

Re-export from Tampermonkey into `backup/` after editing a script in the Tampermonkey
editor, so this repo stays authoritative.

## Checklist before calling a script done

- [ ] `bin/check.sh` passes (it checks @noframes, the TAG const, and that the
      MutationObserver is wired to `schedule()`)
- [ ] Runs on hard load, on soft nav into the page, and on soft nav *away and back*
- [ ] Runs in a background tab (cmd-click the link, then switch to it)
- [ ] Second run changes nothing (idempotent)
- [ ] Degrades to a no-op when its target element is absent (never throws, never blanks the page)
- [ ] Fragile selectors listed in README.md
- [ ] `@version` bumped

## Site notes

| Site | Icon URL | Nav events | Notes |
|---|---|---|---|
| GitHub | `https://github.githubassets.com/favicons/favicon.svg` | `soft-nav:end` first, then turbo/pjax | Mixed React + Turbo. Primer classes are stable, CSS-module hashes are not |
| Laravel Cloud | `https://cloud.laravel.com/.../apple-touch-icon.png` | none, observe the body | React + Headless UI + Inertia. Re-renders on every checkbox toggle, so drive controls one at a time with a ~60 ms gap. The Inertia payload sits in a `script[type=application/json]` beside the app root and is written once at first paint, so it is stale after any soft nav: re-fetch the current URL and check the payload against it before trusting it |
| ChatGPT (retired) | `https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com` | none, MutationObserver | Tailwind classes are generated, so clone a sibling |
| Google Docs | n/a | n/a | Closure Library: needs the full `mouseenter`, `mouseover`, `mousedown`, `mouseup`, `click` sequence, plus a capture-phase key listener |
