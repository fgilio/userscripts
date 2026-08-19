// ==UserScript==
// @name         GitHub Auto-Expand Single Check Group
// @namespace    https://github.com/
// @version      1.2.1
// @description  Auto-expand a check workflow on the PR Checks tab when there is only one
// @author       Franco Gilio
// @match        https://github.com/*/*/pull/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const SELECTOR = 'details.checks-list-item';

    function expandIfSingle() {
        // Only act on the Checks subtab
        if (!/\/pull\/\d+\/checks(?:[/?#]|$)/.test(location.pathname + location.search)) return;
        const items = document.querySelectorAll(SELECTOR);
        if (items.length === 1 && !items[0].open) {
            // Just set .open — do NOT click the summary (it contains an <a> that navigates away)
            items[0].open = true;
        }
    }

    // Run now in case we landed directly on /checks
    expandIfSingle();

    // Watch for the checks list to appear (handles async render + SPA navigation)
    const observer = new MutationObserver(expandIfSingle);
    observer.observe(document.body, { childList: true, subtree: true });

    // GitHub's own SPA event (most reliable for tab switches inside a PR)
    document.addEventListener('soft-nav:end', expandIfSingle);

    // Fallbacks for other navigation systems GitHub uses in different contexts
    document.addEventListener('turbo:load', expandIfSingle);
    document.addEventListener('turbo:render', expandIfSingle);
    document.addEventListener('pjax:end', expandIfSingle);
})();