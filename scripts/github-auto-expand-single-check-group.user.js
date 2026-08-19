// ==UserScript==
// @name         GitHub Auto-Expand Single Check Group
// @namespace    https://github.com/
// @version      1.3.0
// @description  Auto-expand a check workflow on the PR Checks tab when there is only one
// @author       Franco Gilio
// @match        https://github.com/*/*/pull/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[auto-expand]';
    const SELECTOR = 'details.checks-list-item';

    function expandIfSingle() {
        if (!/\/pull\/\d+\/checks(?:[/?#]|$)/.test(location.pathname)) return;
        const items = document.querySelectorAll(SELECTOR);
        if (items.length === 1 && !items[0].open) {
            // The summary contains an <a>, so clicking it navigates away.
            items[0].open = true;
        }
    }

    // setTimeout, not rAF. See CLAUDE.md "SPA navigation".
    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            try { expandIfSingle(); } catch (error) { console.error(TAG, error); }
        }, 50);
    }

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
        document.addEventListener(event, schedule);
    }
    window.addEventListener('popstate', schedule);
    schedule();
})();