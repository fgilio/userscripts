// ==UserScript==
// @name         GitHub PR Commits — Newest First
// @namespace    https://github.com/
// @version      1.3.0
// @description  Reverse the PR Commits tab so newest commits (and newest day) appear on top
// @author       Franco Gilio
// @match        https://github.com/*/*/pull/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[pr-commits]';
    const TIMELINE = 'div.prc-Timeline-Timeline-awSoC';
    const COMMIT_UL = 'ul.ListView-module__ul__uMK30';

    const warned = new Set();
    function need(root, selector, what) {
        const el = root.querySelector(selector);
        if (el) {
            warned.delete(selector);
            return el;
        }
        if (!warned.has(selector)) {
            warned.add(selector);
            console.warn(`${TAG} ${what} not found (selector "${selector}"). Site markup changed. Update the selector in this script.`);
        }
        return null;
    }

    function isOnCommitsTab() {
        return /\/pull\/\d+\/commits(?:[/?#]|$)/.test(location.pathname);
    }

    function reverseCommits() {
        if (!isOnCommitsTab()) return;

        const timeline = need(document, TIMELINE, 'Timeline container');
        if (!timeline || timeline.dataset.reversed === '1') return;
        if (!need(timeline, COMMIT_UL, 'Commit list')) return;

        for (const ul of timeline.querySelectorAll(COMMIT_UL)) {
            ul.append(...[...ul.children].reverse());
        }
        timeline.append(...[...timeline.children].reverse());
        timeline.dataset.reversed = '1';
    }

    // setTimeout, not rAF. See CLAUDE.md "SPA navigation".
    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            try { reverseCommits(); } catch (error) { console.error(TAG, error); }
        }, 50);
    }

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
        document.addEventListener(event, schedule);
    }
    window.addEventListener('popstate', schedule);
    schedule();
})();