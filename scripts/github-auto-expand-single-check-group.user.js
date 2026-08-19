// ==UserScript==
// @name         GitHub Auto-Expand Single Check Group
// @namespace    https://github.com/
// @version      1.2.2
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
        if (!/\/pull\/\d+\/checks(?:[/?#]|$)/.test(location.pathname)) return;
        const items = document.querySelectorAll(SELECTOR);
        if (items.length === 1 && !items[0].open) {
            // The summary contains an <a>, so clicking it navigates away.
            items[0].open = true;
        }
    }

    expandIfSingle();

    const observer = new MutationObserver(expandIfSingle);
    observer.observe(document.body, { childList: true, subtree: true });

    for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'pjax:end']) {
        document.addEventListener(event, expandIfSingle);
    }
})();