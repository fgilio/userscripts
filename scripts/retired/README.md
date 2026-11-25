# Retired

Scripts that no longer run, or that the site made redundant. Kept for the record,
never reinstalled. Each file states at the top why it was retired and when.

Delete these from Tampermonkey. A broken script still costs a page-load hook and
throws into the console on every navigation.

Every file here carries a trailing `.txt`, so the repo is public without offering a
one-click install of a script that is known to throw: Tampermonkey only recognises a URL
ending in `.user.js`. Strip the suffix if you want to read one as JavaScript.

| Script | Retired | Reason |
|---|---|---|
| `laravel-cloud-collapsible-permissions.user.js.txt` | 2026-11-25 | Laravel Cloud rebuilt the API token form with native permission search, Select all / Deselect all and an "N selected" count; the flat list has no categories left to collapse, and the script's anchors match nothing |
| `chatgpt-scheduled-tasks.user.js.txt` | 2026-08-19 | ChatGPT added a native **Scheduled** sidebar item; the script's mount point also no longer exists, so it threw on every load |
