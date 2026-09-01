# Contributing

This is a personal collection that happens to be public. Set your expectations
accordingly: it optimises for one person's browser, and a change that makes a script
more general at the cost of making it harder to read is not an improvement here.

That said, fixes are genuinely welcome, especially the boring kind. When GitHub or
Laravel Cloud ships a redesign, a PR that updates one hashed selector is the most useful
thing anyone can send.

## What is likely to be merged

- A selector fix after a site redesign. Say which site, and paste the console warning.
- A real bug: a script that throws, blanks a page, fires twice, or is not idempotent.
- A new site added to `universal-sidebar-toggle`'s `SITE_CONFIG`.
- A documentation correction. If the README claims something the code does not do, that
  is a bug in the README and worth a PR on its own.

## What is unlikely to be merged

- A build step, a bundler, or a package manifest. See golden rule 2 below.
- `@require` pointing at a CDN, or any other remote code.
- A new script that only makes sense for someone else's workflow. Fork it. That is what
  a userscript collection is for.
- A reformat of a file you are not otherwise changing.

## Setup

There is nothing to install. No `npm install`, no build, no test runner.

```bash
git clone https://github.com/fgilio/userscripts
cd userscripts
bin/check.sh                                # lint every script
bin/test.sh                                 # run the tests
```

`bin/check.sh` needs only `bash` and `node` (for `node --check`). `bin/test.sh` runs
every `test/*.test.js` as a plain node script: no framework, no `package.json`, nothing
to install. Both run in CI on every push and pull request.

Tests here cover logic that can be reasoned about without a browser: the storage and
migration layer of `laravel-cloud-nightwatch-linker`, where a mistake silently corrupts
saved pairings, the clipboard text of `laravel-cloud-copy-deployment-logs`, and the rule
id lookup of `laravel-cloud-firewall-rule-ids`. The last two read a page payload that
goes stale the moment you navigate, so both are tested against a stale one. DOM
behaviour is still verified by hand against the live site, per the checklist below. If
you touch any of that, add a case, and make sure it would actually fail against the old
code, because a DOM stub that is too thin makes every assertion pass for the wrong
reason.
`bin/build-import-zip.py` needs `python3`. `bin/install.sh` works on macOS, Linux and
WSL; its clipboard copy and browser launch are best-effort and it prints the URL when
neither is available.

## The five golden rules

These are the constraints every script is written under. `CLAUDE.md` is the long-form
version, including the SPA boot pattern, `@run-at` selection, and how to make injected
UI look native. Read it before writing a new script.

1. **Never change the `@name` or `@namespace` of an installed script.** Tampermonkey
   identifies a script by that pair. Change either and a re-install creates a duplicate
   that runs alongside the original. Rename the *file* freely. The header stays.
2. **Scripts are self-contained.** No `@require`, no build step. Copy from `snippets/`
   instead. A local `@require` breaks on every other machine and the moment your server
   stops. `@require` content is cached at install time, so editing a snippet would not
   reach installed scripts without bumping every consumer's version. And a build step
   would cost `scripts/` its status as the only source of truth.
3. **Idempotent by construction.** Every entry point must be safe to call 100x/second.
   Guard with a DOM marker (`getElementById`, `dataset.fgDone`), never with a "did I
   already run" flag. SPA navigation destroys the DOM but not your closure.
4. **Never `alert` / `confirm` / `prompt`.** They block the page and freeze browser
   automation. Use an injected inline input, or `GM_registerMenuCommand` for config.
   (`laravel-cloud-nightwatch-linker` is a documented exception, marked `check-ignore`.)
5. **Fail visible, not silent.** When a selector misses, `console.warn` once with the
   selector text. Six months later that message is the whole debugging session. Copy the
   `need()` helper from `_template.user.js`. The exception is a target whose absence is
   a normal state (see the note under *Known fragilities* in README.md).

**Debounce with `setTimeout`, never `requestAnimationFrame`.** rAF does not fire in a
background tab, so a script scheduled on rAF does nothing until the tab is focused, and
every cmd-clicked link opens a background tab. `bin/check.sh` enforces this.

## Writing a new script

```
Start
├── cp _template.user.js scripts/<kebab-name>.user.js
├── Fill in the header (see CLAUDE.md for the field-by-field rules)
├── Keep the boot block. Delete the conditional history patch unless the
│   script's output derives from the URL rather than the DOM
├── Test by injecting into the page first, never by installing a draft
└── bin/check.sh, then record it in README.md
```

## Before opening a PR

- [ ] `bin/check.sh` passes, and `bin/test.sh` if you touched anything with tests
- [ ] Runs on hard load, on soft nav into the page, and on soft nav away and back
- [ ] Runs in a background tab (cmd-click the link, then switch to it)
- [ ] Second run changes nothing (idempotent)
- [ ] Degrades to a no-op when its target is absent: never throws, never blanks the page
- [ ] `@version` bumped (semver, and the linter checks the shape)
- [ ] Fragile selectors listed in README.md, and SECURITY.md updated if the script
      gained a `@grant`, a network call, or a new capability

Describe what you saw before and after. A screenshot of a redesigned site beats a
paragraph about it.

## Security

Report anything security-relevant per [SECURITY.md](SECURITY.md). Do not open a PR that
adds remote code loading, however convenient. It will be declined on principle.
