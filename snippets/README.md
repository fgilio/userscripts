# Reference patterns

Techniques worth copying, not canon. Nothing here is `@require`d, and no script
is expected to match these byte for byte.

The boot pattern and the warn-once helper are **not** here: they live in
`_template.user.js`, which is the file you copy to start a new script. Keeping a
second copy in this folder only let the two drift apart.

| File | What it is for | Used by |
|---|---|---|
| `clone-native.js` | Clone a native button so injected UI inherits the site's design system | `laravel-cloud-nightwatch-linker`, `github-nav-reorder` (both hand-rolled, see README fragilities) |
| `gm-store.js` | One JSON blob under one GM key, with schema migration | none yet. `github-actions-ci-branch-pin` deliberately uses one key per repo instead, and says why |
| `anti-flicker.js` | Hide, rearrange, reveal, so native layout never paints | `github-nav-reorder` ships a richer version |
| `github-check-status.js` | Read a check's status, and a workflow's worst status, on the PR Checks tab | `github-pr-checks-signal-first`, `github-auto-expand-single-check-group`. Both carry their own copy, per the self-contained rule |

`TARGET` and similar constants in these files are placeholders. Replace them.
