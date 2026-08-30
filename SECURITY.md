# Security

Userscripts run with full access to every page they match, so "trust me" is not good
enough. This file states exactly what each script in `scripts/` does, so you can verify
it against the source before installing. Every file is a few hundred lines and has no
dependencies, so reading one end to end is a realistic thing to ask of you.

## Properties that hold for every script

- **No remote code.** No `@require`, no `@resource`, no injected `<script src>`, no
  `eval`, no `new Function`, no `setTimeout("string")`. What you read in the file is
  everything that runs. This is a hard rule of the repo, not an accident. See the
  "Scripts are self-contained" golden rule in `CLAUDE.md`.
- **No telemetry.** Nothing is sent to Franco or to any third party. There is no
  analytics, no error reporting, and no phone-home of any kind.
- **No credential access.** No script reads `document.cookie`, `localStorage`, or
  `sessionStorage`, and none touches a password or token field.
- **No HTML is ever built from page data.** Two files assign `innerHTML`, three times
  between them, and the operand is always SVG markup written into the script itself.
  In `laravel-cloud-collapsible-permissions` it is the `CHEVRON_SVG` and `SEARCH_SVG`
  constants declared at the top of the file. In `laravel-cloud-nightwatch-linker` it is
  `cloudIconSvg()`, which concatenates a fixed path with a colour its caller passes as
  a literal. Grep `innerHTML` to see all three. No page content, URL, or user input
  reaches an HTML sink anywhere in the repo. The tradeoff is that those three
  assignments would be rejected by a site sending `require-trusted-types-for`. No site
  matched here sends it today, and `CLAUDE.md` records that as the trigger for switching
  them to `createElementNS`, which `github-actions-ci-branch-pin` already uses.
- **Narrow `@match`.** Each script matches the smallest URL pattern that works. No
  script matches `*` or `<all_urls>`.
- **`@noframes` by default.** Only `universal-sidebar-toggle` runs in frames, and it is
  documented below.

## What each script touches

| Script | Network | Persistent storage | Notable capability |
|---|---|---|---|
| `github-actions-ci-branch-pin` | Two same-origin `fetch` calls to `github.com`, with `credentials: 'include'` | `GM_setValue`: default branch per repo, cached 7 days | Also registers a `GM_registerMenuCommand` entry, `Re-detect default branch`, which refetches and overwrites that cache |
| `github-nav-reorder` | none | none | Injects CSS at `document-start` to prevent a flash of the native nav |
| `github-tab-title-numbers` | none | none | Rewrites `document.title`, and reads the merge box to derive the CI marker. Patches `history.pushState` / `replaceState` to notice SPA navigation |
| `github-auto-expand-single-check-group` | none | none | Opens check workflow `<details>` elements |
| `github-pr-checks-signal-first` | none | none | Reorders existing check rows and workflow wrappers, and dims skipped jobs. Adds nothing and clicks nothing |
| `github-pr-commits-newest-first` | none | none | Reorders existing DOM nodes |
| `laravel-cloud-copy-deployment-logs` | One same-origin `fetch` of the deployment page you are already on, with `credentials: 'same-origin'` | none | Writes to the clipboard, only when you click a copy control |
| `laravel-cloud-collapsible-permissions` | none | none | Clicks permission checkboxes on your behalf when you press Select all / Clear |
| `laravel-cloud-firewall-rules-unclip` | none | none | Sets inline flex/overflow styles on existing firewall rule rows and a `title` attribute carrying each rule's own name. Adds nothing else and clicks nothing |
| `laravel-cloud-nightwatch-linker` | none | `GM_setValue`: a map of Laravel Cloud environment paths to Nightwatch environment UUIDs | Uses `prompt()` once per pairing to read a URL you paste |
| `universal-sidebar-toggle` | none | none | Runs in iframes and uses `postMessage` (see below) |

### `github-actions-ci-branch-pin` and `credentials: 'include'`

To label the pin correctly it needs the repository's default branch. It requests
`/{owner}/{repo}` and, as a fallback, `/{owner}/{repo}/refs?type=branch`. Both are
same-origin on `github.com` and sent with your session cookie, exactly as the page
itself would.
That is required to resolve a private repo you can see. It extracts one string, the
branch name, and caches it under `GM_setValue`. Nothing else is read from the response
and nothing leaves the browser.

### `laravel-cloud-copy-deployment-logs`, the fetch and the clipboard

Laravel Cloud renders a deployment step's log only while that step is expanded, but ships
the whole log in a JSON script inside the page. That copy is written once at first paint,
so it goes stale the moment you navigate to another deployment or the running one gains a
line. So a copy click re-fetches the page currently in the address bar, reads the payload
out of the response, and refuses it unless the deployment number and commit hash in it
match the URL. Same origin, your own session cookie, one GET of a page you are looking
at. Nothing is sent anywhere, and no other URL is ever requested.

The clipboard is written with `navigator.clipboard.write`, never read. The write happens
only inside a click or Enter handler on one of the injected controls.

### `universal-sidebar-toggle`, frames and `postMessage`

This is the one script without `@noframes`, because a keyboard chord pressed while focus
sits inside an iframe never reaches the top frame. Key events do not cross document
boundaries. A subframe therefore forwards the chord to the top frame with
`postMessage({type: 'fg-sidebar-toggle-request'}, '*')`, and only the top frame acts.

Two consequences, stated plainly:

- The target origin is `'*'`, because a frame cannot read the top frame's origin when
  the two differ. The message carries no data beyond that marker string.
- The top frame accepts that message from any sender without checking the origin. The
  most a hostile page could achieve is collapsing a sidebar you can reopen by hand. If
  that is not a tradeoff you want, add `@noframes` to the script and lose the
  focus-inside-an-iframe case.

### `laravel-cloud-nightwatch-linker` and `prompt()`

The repo forbids `prompt()` because it blocks the page and freezes browser automation.
This script is the documented exception, marked with a `check-ignore` comment: it fires
once, only when a pairing is missing, to read a URL you paste. The stored mapping never
leaves your browser. `GM_setValue` data is not in this repo. See the `backup/` note in
README.md.

## Reporting something

Open an issue, or email the address on <https://github.com/fgilio>. This is a personal
collection with no SLA and no security team. Expect a best-effort reply from one person.
If the finding is sensitive, say so in the issue without the details and Franco will
follow up privately.
