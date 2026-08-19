// ==UserScript==
// @name         GitHub Issue/PR/Run Number in Tab Title
// @namespace    https://github.com/
// @version      1.2.1
// @description  Prefixes the tab/document title with the issue/PR/discussion number, or for Actions run pages, the originating PR number when present (falling back to the workflow run number "#NNNN"). Survives Turbo soft navigations and history.pushState navigations, with a guard against feedback loops.
// @author       Franco Gilio
// @match        https://github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';
    // check-ignore: body-start — watchBody() null-checks document.body and is only
    // called from boot(), which itself waits for <head> and <title> to exist.

    // Issue/PR/discussion number comes straight from the URL path — authoritative.
    //   /owner/repo/pull/374  -> 374    /owner/repo/issues/123 -> 123    /owner/repo/discussions/12 -> 12
    const NUM_RE = /\/(?:pull|issues|discussions)\/(\d+)(?:[/?#]|$)/;
    // NEW: detect Actions run pages. The run *id* in the URL is NOT the number
    // we want to show (it's a long opaque id), so we only use this to know we're
    // on a run page; the actual label is scraped from the DOM by runLabel().
    const RUN_RE = /\/actions\/runs\/(\d+)(?:[/?#]|$)/;

    function currentNumber() {
        const m = location.pathname.match(NUM_RE);
        return m ? m[1] : null;
    }

    // NEW: On an Actions run page, prefer the originating PR (only present for
    // pull_request-triggered runs) and otherwise fall back to the run number
    // ("#1861") shown next to the run heading. Returns null until the relevant
    // DOM is hydrated, so callers must re-run on mutations (we already do).
    function runLabel() {
        if (!RUN_RE.test(location.pathname)) return null;

        // 1) Originating PR, if GitHub rendered a link to it. Scope to <main> to
        //    avoid matching unrelated PR links elsewhere on the chrome.
        const main = document.querySelector('main') || document;
        const prLink = main.querySelector('a[href*="/pull/"]');
        if (prLink) {
            const m = prLink.getAttribute('href').match(/\/pull\/(\d+)/);
            if (m) return '#' + m[1];
        }

        // 2) Fallback: the run number span in the run heading. GitHub renders it
        //    as a muted span (e.g. "#1861") inside the .markdown-title heading.
        for (const el of main.querySelectorAll('.markdown-title .color-fg-muted, h1 .color-fg-muted')) {
            const t = (el.textContent || '').trim();
            if (/^#\d+$/.test(t)) return t; // already includes the leading '#'
        }
        return null;
    }

    let selfWrite = false;

    function apply() {
        // NEW: compute the desired "#N" prefix from whichever route we're on.
        let prefix = null;
        const num = currentNumber();
        if (num) {
            prefix = `#${num} - `;
        } else {
            const label = runLabel(); // already "#NNNN" or null
            if (label) prefix = `${label} - `;
        }
        if (!prefix) return;

        const title = document.title;
        if (title.startsWith(prefix)) return; // already correct

        // Strip any stale "#NNN - " prefix left over from a previous page.
        const stripped = title.replace(/^#\d+ - /, '');

        selfWrite = true;
        document.title = prefix + stripped;
        setTimeout(() => { selfWrite = false; }, 0);
    }

    let titleObserver = null;
    function watchTitle() {
        if (titleObserver) return;
        const head = document.head || document.querySelector('head');
        if (!head) return;
        titleObserver = new MutationObserver(() => {
            if (selfWrite) return;
            apply();
        });
        titleObserver.observe(head, { childList: true, characterData: true, subtree: true });
    }

    // NEW: On run pages the PR link / run-number span hydrate *after* the title,
    // and never touch <head> — so the head observer alone won't re-fire apply()
    // once they appear. Watch <body> for the run label to show up. Cheap because
    // apply() early-returns once the title is correct, and we disconnect on nav.
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
        watchBody(); // NEW
    }

    if (document.head && document.querySelector('title')) {
        boot();
    } else {
        const headObserver = new MutationObserver(() => {
            if (document.head && document.querySelector('title')) {
                headObserver.disconnect();
                boot();
            }
        });
        headObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    // --- Navigation handling -------------------------------------------------
    function onUrlMaybeChanged() {
        watchTitle();
        watchBody(); // NEW: (re)arm or tear down the body observer per route
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
    document.addEventListener('turbo:load', onUrlMaybeChanged);
    document.addEventListener('turbo:render', onUrlMaybeChanged);
    document.addEventListener('pjax:end', onUrlMaybeChanged);

    let lastPath = location.pathname;
    setInterval(() => {
        if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            onUrlMaybeChanged();
        }
    }, 500);
})();