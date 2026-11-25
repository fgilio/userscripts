// ==UserScript==
// @name         GitHub Issue/PR/Run Number in Tab Title
// @namespace    https://github.com/
// @version      1.5.0
// @description  Prefixes the tab title with the issue/PR/discussion number, plus a CI pass/fail/pending marker on PRs so a background tab shows the result without switching to it
// @author       Franco Gilio
// @match        https://github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-tab-title-numbers.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-tab-title-numbers.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';
  // check-ignore: body-start watchBody() null-checks document.body and is only
  // called from boot(), which itself waits for <head> and <title> to exist.
  // A TAG is required for the console.error in schedule().
  const TAG = '[tab-title-numbers]';

  // The issue/PR/discussion number comes straight from the URL path.
  const NUM_RE = /\/(?:pull|issues|discussions)\/(\d+)(?:[/?#]|$)/;
  // Only pull requests run checks, so only they get a status marker.
  const PR_RE = /\/pull\/\d+(?:[/?#]|$)/;
  // The run id in the URL is a long opaque id, so this only detects the route.
  // runLabel() reads the number that is actually displayed.
  const RUN_RE = /\/actions\/runs\/\d+(?:[/?#]|$)/;

  const STATUS_FAIL = '\u2717';
  const STATUS_PENDING = '\u2026';
  const STATUS_PASS = '\u2713';

  // The merge box redesign (2026-11) draws the Checks tile as a progress bar, one
  // segment per status, each tagged `data-testid="checks-progress-<kind>"`. Verified
  // 2026-11-25 against a failing (`required-failure`, `optional-failure`), an
  // attention-needed (`attention-required`), a pending (`pending`) and a green PR
  // (`success`, `skipped`, `neutral`). The segments render whether the tile is
  // open or shut, so they are the one signal that does not depend on a click.
  const SEGMENT_PREFIX = 'checks-progress-';
  const SEGMENT = `[data-testid="mini-status"] [data-testid^="${SEGMENT_PREFIX}"]`;
  // Ordered failure-first, because a failure outranks anything else on the page.
  const SEGMENT_KINDS = [
    [/fail|error|cancel|timed-out|attention|action/, STATUS_FAIL],
    [/pending|queued|progress|waiting|expected|running/, STATUS_PENDING],
    [/success|skipped|neutral|stale/, STATUS_PASS],
  ];

  // The merge box before the redesign stated its verdict in one <h3>. GitHub still
  // offers the old one (the "Preview" toggle on the PR header), so it stays as a
  // fallback, read only when the page has no progress segments.
  const OVERALL = [
    [/not successful|have failed/i, STATUS_FAIL],
    [/haven't completed|are queued|in progress|still running/i, STATUS_PENDING],
    [/have passed|checks passed/i, STATUS_PASS],
  ];

  let warnedKind = false;

  /** The marker from the progress segments, null when none decides it, undefined when there are none. */
  function segmentStatus() {
    const kinds = [...document.querySelectorAll(SEGMENT)]
      .map(segment => segment.getAttribute('data-testid').slice(SEGMENT_PREFIX.length));
    if (!kinds.length) return undefined;

    const found = new Set();
    for (const kind of kinds) {
      const match = SEGMENT_KINDS.find(([pattern]) => pattern.test(kind));
      if (match) { found.add(match[1]); continue; }
      // An unknown kind could be anything, so it never counts as a pass.
      found.add(null);
      if (!warnedKind) {
        warnedKind = true;
        console.warn(`${TAG} unknown checks progress segment "${SEGMENT_PREFIX}${kind}". Add it to SEGMENT_KINDS.`);
      }
    }
    if (found.has(STATUS_FAIL)) return STATUS_FAIL;
    if (found.has(STATUS_PENDING)) return STATUS_PENDING;
    if (found.has(null)) return null;
    return STATUS_PASS;
  }

  // Null on anything that is not a PR, and null until the merge box hydrates. The
  // body observer re-runs apply() when it does, so the marker arrives a moment after
  // the number rather than not at all.
  function checksStatus() {
    if (!PR_RE.test(location.pathname)) return null;

    const fromSegments = segmentStatus();
    if (fromSegments !== undefined) return fromSegments;

    for (const heading of document.querySelectorAll('h3')) {
      const text = heading.textContent;
      // Guards against "This branch is waiting for a deployment approval", which is
      // a sibling heading about deployments rather than about checks.
      if (!/check/i.test(text)) continue;
      for (const [pattern, status] of OVERALL) if (pattern.test(text)) return status;
    }
    return null;
  }

  // Matches a prefix this script wrote, with or without a status marker, so a stale
  // one is always replaced rather than stacked.
  const STALE_PREFIX_RE =
    new RegExp('^(?:[' + STATUS_FAIL + STATUS_PASS + STATUS_PENDING + ']\\s)?#\\d+ - ');

  function currentNumber() {
    const m = location.pathname.match(NUM_RE);
    return m ? m[1] : null;
  }

  // On a run page, prefer the originating PR (present only for pull_request-triggered
  // runs) and fall back to the run number shown next to the heading. Null until the DOM
  // hydrates, so callers re-run on mutations.
  function runLabel() {
    if (!RUN_RE.test(location.pathname)) return null;

    // Scoped to <main> so PR links elsewhere in the page chrome cannot match.
    const main = document.querySelector('main') ?? document;
    const prLink = main.querySelector('a[href*="/pull/"]');
    const pr = prLink?.pathname.match(/\/pull\/(\d+)/);
    if (pr) return `#${pr[1]}`;

    for (const el of main.querySelectorAll('.markdown-title .color-fg-muted, h1 .color-fg-muted')) {
      const text = el.textContent.trim();
      if (/^#\d+$/.test(text)) return text;
    }
    return null;
  }

  let selfWrite = false;

  function apply() {
    const num = currentNumber();
    const label = num ? `#${num}` : runLabel();
    if (!label) return;
    const status = checksStatus();
    const prefix = `${status ? status + ' ' : ''}${label} - `;

    const title = document.title;
    if (title.startsWith(prefix)) return;

    // Strip any stale prefix left over from a previous page or an earlier status.
    const stripped = title.replace(STALE_PREFIX_RE, '');

    selfWrite = true;
    document.title = prefix + stripped;
    setTimeout(() => { selfWrite = false; }, 0);
  }

  let titleObserver = null;
  function watchTitle() {
    if (titleObserver) return;
    const head = document.head;
    if (!head) return;
    titleObserver = new MutationObserver(() => {
      if (selfWrite) return;
      schedule();
    });
    titleObserver.observe(head, { childList: true, characterData: true, subtree: true });
  }

  // The PR link, the run-number span and the check statuses all hydrate after the
  // title and never touch <head>, so the head observer alone never re-fires apply()
  // once they appear. Needed on run pages for the label and on PRs for the marker.
  let bodyObserver = null;
  function watchBody() {
    if (!RUN_RE.test(location.pathname) && !PR_RE.test(location.pathname)) {
      if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
      return;
    }
    if (bodyObserver) return;
    const body = document.body;
    if (!body) return;
    bodyObserver = new MutationObserver(() => { if (!selfWrite) schedule(); });
    bodyObserver.observe(body, { childList: true, subtree: true });
  }

  // setTimeout, not rAF. See CLAUDE.md "SPA navigation". apply() reads the merge box
  // on every call now, and a PR mutates constantly, so the observers coalesce here
  // rather than repeating that per mutation record. boot() still calls apply()
  // directly, so the first title write is not delayed by 50 ms.
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try { apply(); } catch (error) { console.error(TAG, error); }
    }, 50);
  }

  function boot() {
    apply();
    watchTitle();
    watchBody();
  }

  if (document.head?.querySelector('title')) {
    boot();
  } else {
    // check-ignore: debounce this one waits for <title> to exist and then
    // disconnects, so it fires once. Delaying it by 50 ms would only postpone the
    // first title write, which is the one write that has to beat the site's own.
    const headObserver = new MutationObserver(() => {
      if (document.head?.querySelector('title')) {
        headObserver.disconnect();
        boot();
      }
    });
    headObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function onUrlMaybeChanged() {
    watchTitle();
    watchBody();
    apply();
  }

  (function patchHistory() {
    const wrap = (orig) => function () {
      const ret = orig.apply(this, arguments);
      Promise.resolve().then(onUrlMaybeChanged);
      return ret;
    };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
  })();

  window.addEventListener('popstate', onUrlMaybeChanged);
  // 'soft-nav:end' is GitHub's React router. With it and the history patch above,
  // every navigation is covered by an event rather than a poll.
  for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
    document.addEventListener(event, onUrlMaybeChanged);
  }
})();