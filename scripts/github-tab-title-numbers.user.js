// ==UserScript==
// @name         GitHub Issue/PR/Run Number in Tab Title
// @namespace    https://github.com/
// @version      1.3.0
// @description  Prefixes the tab title with the issue/PR/discussion number, or on Actions run pages the originating PR number
// @author       Franco Gilio
// @match        https://github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @noframes
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';
  // check-ignore: body-start watchBody() null-checks document.body and is only
  // called from boot(), which itself waits for <head> and <title> to exist.
  // check-ignore: debounce the observers guard on selfWrite and apply() returns
  // immediately once the title is correct, so a debounce would only add latency.

  // The issue/PR/discussion number comes straight from the URL path.
  const NUM_RE = /\/(?:pull|issues|discussions)\/(\d+)(?:[/?#]|$)/;
  // The run id in the URL is a long opaque id, so this only detects the route.
  // runLabel() reads the number that is actually displayed.
  const RUN_RE = /\/actions\/runs\/\d+(?:[/?#]|$)/;

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
    const prefix = `${label} - `;

    const title = document.title;
    if (title.startsWith(prefix)) return;

    // Strip any stale "#NNN - " prefix left over from a previous page.
    const stripped = title.replace(/^#\d+ - /, '');

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
      apply();
    });
    titleObserver.observe(head, { childList: true, characterData: true, subtree: true });
  }

  // The PR link and run-number span hydrate after the title and never touch <head>,
  // so the head observer alone never re-fires apply() once they appear.
  let bodyObserver = null;
  function watchBody() {
    if (!RUN_RE.test(location.pathname)) {
      if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
      return;
    }
    if (bodyObserver) return;
    const body = document.body;
    if (!body) return;
    bodyObserver = new MutationObserver(() => { if (!selfWrite) apply(); });
    bodyObserver.observe(body, { childList: true, subtree: true });
  }

  function boot() {
    apply();
    watchTitle();
    watchBody();
  }

  if (document.head?.querySelector('title')) {
    boot();
  } else {
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