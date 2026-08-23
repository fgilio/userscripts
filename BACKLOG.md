# Backlog

Open threads from the style audit of 2026-08-19/20. Nothing here is urgent, and
the collection works as it stands. Baseline before the audit is commit `82665df`,
so anything below can be compared against the original.

## Pending in Tampermonkey (manual, cannot be scripted)

- [x] Delete `ChatGPT "Scheduled Tasks"` in the dashboard. Done 2026-08-20. The
      source is kept in `scripts/retired/` with the reason.
- [ ] Re-export into `backup/tampermonkey-export-<date>/` after pairing any new
      Cloud/Nightwatch environment. The import replaces `GM_setValue` storage
      rather than merging it, so a stale snapshot silently drops new pairings.
      The 2026-08-19 snapshot holds 57 of them.

## Declined during the audit, recorded so they are not rediscovered

- **`laravel-cloud-nightwatch-linker` is the only ES5 file** (68 `var`, no arrow
  callbacks, string concatenation for URLs). Converting it is a large diff on a
  working script, so it was left alone. Its unreachable clone-fallback branch in
  `buildCloudButton` (roughly 15 lines, reached only when `findVisitButton()`
  returns null, which its caller already guards against) belongs with that same
  rewrite.
- [x] **Warn-once for the fragile scripts.** Done 2026-08-23. `github-nav-reorder`
      warns when a nav exists but its hashed tab list does not;
      `laravel-cloud-collapsible-permissions` warns when the modal is open but no
      category matches, and the message states the heuristic it wanted. Both gained the
      `TAG` const they were missing. `github-auto-expand-single-check-group` and
      `github-tab-title-numbers` were left silent on purpose: for them an absent target
      is a normal state, not a break, so a warning would fire on every hydration.
- **`semver`, `wildcard-match` and `raf` in `bin/check.sh` fire on nothing today.**
  They were kept deliberately: a guard that does not fire because the code is
  clean is working, not dead.
- **`universal-sidebar-toggle` has no `@noframes`** on purpose. The shortcut must
  keep working when focus sits inside an iframe on the nine non-Docs sites. Only
  Google Docs is gated, in code. Recorded as a `check-ignore` in the file.

## Ideas not acted on

- `isElementVisible` in `universal-sidebar-toggle` predates
  `Element.checkVisibility()`, which Chrome now ships and which this repo already
  confirmed is available.
- `github-tab-title-numbers` patches `history.pushState` where the Navigation API
  (`navigation.addEventListener('navigate', ...)`) would cover the same ground.
- `laravel-cloud-collapsible-permissions` drives hover and focus states from six
  JS listeners writing inline styles, in a file that already injects a stylesheet.
