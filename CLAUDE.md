# Userscripts

Tampermonkey userscripts for Chrome. One file per script in `scripts/`, self-contained, no build step.

## Layout

```
scripts/      one <kebab-name>.user.js per script — the only source of truth
snippets/     canonical code to COPY-PASTE into a new script (not @require'd)
bin/          check.sh (lint), build-import-zip.py (repo -> importable zip), install.sh
backup/       raw Tampermonkey export: .options.json + .storage.json (gitignored)
_template.user.js   start here for a new script
```

## Golden rules

1. **Never change `@name` or `@namespace` of an installed script.** Tampermonkey identifies a
   script by that pair. Change either one and a re-install creates a DUPLICATE that runs
   alongside the old one. Rename the *file* freely; the header stays.
2. **Scripts are self-contained.** No `@require`, no build step; shared code is copy-pasted
   from `snippets/`. Three reasons, none of them "Chrome blocks it" — Chrome gates `file://`
   behind an extension toggle, and `bin/install.sh` already serves over localhost:
   a `@require` pointing at a local path or `127.0.0.1` produces a script that breaks on any
   other machine and the moment the server stops; `@require` content is cached at
   install time, so editing a snippet would silently not reach installed scripts without a
   version bump on every consumer; and a build step would cost `scripts/` its status as the
   only source of truth. Duplication is the correct trade-off here.
3. **Idempotent by construction.** Every entry point must be safe to call 100x/second. Guard
   with a DOM marker (`getElementById`, `dataset.done`), never with a "did I already run" flag —
   SPA navigation destroys the DOM but not your closure.
4. **Never `alert` / `confirm` / `prompt`.** They block the page and freeze browser automation.
   Use an injected inline input, or `GM_registerMenuCommand` for config.
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
│   ├── @match       narrowest pattern that works — https://github.com/*/*/pull/*
│   │                 not https://github.com/*
│   ├── @icon        site favicon (see table below); warn if absent
│   ├── @run-at      document-idle, EXCEPT anti-flicker work → document-start
│   ├── @noframes    unless the script must run inside iframes
│   └── @grant       none, or the exact GM_* functions used
├── Body
│   ├── IIFE + 'use strict'
│   ├── const TAG = '[script-name]'   for every console call
│   ├── Route guard   — regex on location.pathname, anchored, escaped
│   ├── apply()       — idempotent, early-return when the DOM is not ready
│   └── boot()        — snippets/spa-nav.js
└── Test → Install → Record in README.md
```

### Choosing `@run-at`

| Goal | Value | Why |
|---|---|---|
| Add / read / rearrange existing UI | `document-idle` | DOM exists, cheapest |
| Prevent a flash of native layout | `document-start` | inject CSS before first paint (`snippets/anti-flicker.js`) |
| Rewrite `document.title` | `document-start` | beat the site's own title write |

### SPA navigation — the single largest source of bugs

GitHub, Laravel Cloud, ChatGPT and friends swap content without a page load. A script that
runs once is a script that works once. Copy `snippets/spa-nav.js` verbatim. It covers:

- `MutationObserver` on `document.documentElement` (not `body` — at `document-start` `body` is null)
- `soft-nav:end` (GitHub React nav), `turbo:load`, `turbo:render`, `turbo:frame-render`, `pjax:end`
- `popstate` + patched `history.pushState` / `replaceState`

**Debounce with `setTimeout`, never `requestAnimationFrame`.** rAF does not fire in a background
tab, so a script scheduled on rAF silently does nothing until the tab is focused. Every
cmd-clicked link is a background tab. It is also cheaper in the foreground: a 50 ms timer
caps the callback at 20 Hz where rAF ran it at 60. This paragraph is the authority —
scripts should reference it, not restate it. `bin/check.sh` enforces it (rule `raf`).

The `history.pushState` / `replaceState` patch in `snippets/spa-nav.js` is **conditional**:
include it only when the script's output derives from the URL rather than the DOM. A
DOM-driven script already sees the change through the observer. Only
`github-tab-title-numbers` needs it.

### Making injected UI look native

Best result, in order of preference:

1. **Clone a sibling element** (`snippets/clone-native.js`). Inherits every design-system class,
   including whichever variant the site is currently rendering. Then swap only the icon `<svg>`
   and the label text node. This is what `laravel-cloud-nightwatch-linker` does with the
   "Visit" button, and why it still looks right after redesigns.
2. **Reuse the site's class names** (`ActionListItem`, `ActionListContent`). Works on stable
   design systems like Primer. See `github-actions-ci-branch-pin`.
3. **Hand-styled inline CSS** with tokens sampled from the live page. Last resort — this is why
   `laravel-cloud-collapsible-permissions` carries a block of literal
   `color(display-p3 …)` values.

Build SVG with `createElementNS`, not `innerHTML`, so Trusted-Types pages cannot reject it.
Checked 2026-08-19: none of the sites in this repo send a `require-trusted-types-for`
directive, so this is a habit for portability, not a live constraint — which is why
`bin/check.sh` has no `innerHTML` rule. Add one keyed on `@match` host if that changes.

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
4. Re-inject after edits (a full page load wipes the injection — expected, not a bug)
```

Gotchas seen in practice:

- `javascript_tool` refuses `chrome-extension://` URLs — Tampermonkey's editor cannot be
  automated. Installing is always a manual paste by Franco.
- `javascript_tool` output containing URLs or query strings gets blocked. Strip `href`/`?&=`
  from anything you print.
- `GM_*` is undefined when injected this way. Stub it: `const GM_getValue = (k, d) => d`.
- Verify in a **background** tab too if the script uses a debounce.

## Installing

One script:

```bash
bin/install.sh scripts/<name>.user.js     # serves over localhost; Tampermonkey prompts
pbcopy < scripts/<name>.user.js           # fallback: paste into a new Tampermonkey script
```

Everything, in one shot:

```bash
bin/build-import-zip.py                   # -> dist/userscripts-import.zip
# Tampermonkey → Utilities → Import from file → Choose File
```

The import merges; it never wipes, and it refuses to build if `bin/check.sh` reports an
error. Tampermonkey falls back to matching on **`@name` + `@namespace`** — golden rule 1 is
enforced by the extension itself. Full matching rules: README.md, *Syncing the repo into
Tampermonkey*.

Re-export from Tampermonkey into `backup/` after editing a script in the Tampermonkey
editor, so this repo stays authoritative.

## Checklist before calling a script done

- [ ] `bin/check.sh` passes
- [ ] Runs on hard load, on soft nav into the page, and on soft nav *away and back*
- [ ] Runs in a background tab (cmd-click the link, then switch to it)
- [ ] Second run changes nothing (idempotent)
- [ ] Degrades to a no-op when its target element is absent — never throws, never blanks the page
- [ ] Fragile selectors listed in README.md
- [ ] `@version` bumped

## Site notes

| Site | Icon URL | Nav events | Notes |
|---|---|---|---|
| GitHub | `https://github.githubassets.com/favicons/favicon.svg` | `soft-nav:end` first, then turbo/pjax | Mixed React + Turbo; Primer classes are stable, CSS-module hashes are not |
| Laravel Cloud | `https://cloud.laravel.com/…/apple-touch-icon.png` | none — poll `location.href` | React + Headless UI; re-renders on every checkbox toggle, so drive controls one at a time with a ~60 ms gap |
| ChatGPT | `https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com` | none — MutationObserver | Tailwind classes are generated; clone a sibling |
| Google Docs | — | — | Closure Library: needs the full `mouseenter→mouseover→mousedown→mouseup→click` sequence, plus a capture-phase key listener |
