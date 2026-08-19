// ==UserScript==
// @name         GitHub PR Commits — Newest First
// @namespace    https://github.com/
// @version      1.1.1
// @description  Reverse the PR Commits tab so newest commits (and newest day) appear on top
// @author       Franco Gilio
// @match        https://github.com/*/*/pull/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[PR-Commits-Reverse]';
    const TIMELINE = 'div.prc-Timeline-Timeline-awSoC';
    const COMMIT_UL = 'ul.ListView-module__ul__uMK30';

    // Throttle "selector missed" warnings so we don't spam the console
    // while the page is still loading or while on other PR subtabs.
    let warnedTimeline = false;
    let warnedUl = false;

    function onCommitsTab() {
        return /\/pull\/\d+\/commits(?:[/?#]|$)/.test(location.pathname + location.search);
    }

    function reverseCommits() {
        if (!onCommitsTab()) return;

        const timeline = document.querySelector(TIMELINE);
        if (!timeline) {
            if (!warnedTimeline) {
                console.warn(`${TAG} Timeline container not found (selector "${TIMELINE}"). GitHub may have changed its class hash — re-inspect the DOM and update the script.`);
                warnedTimeline = true;
            }
            return;
        }
        warnedTimeline = false;

        if (timeline.dataset.reversed === '1') return;

        const uls = timeline.querySelectorAll(COMMIT_UL);
        if (uls.length === 0) {
            if (!warnedUl) {
                console.warn(`${TAG} Commit list <ul> not found inside timeline (selector "${COMMIT_UL}"). Class hash may have changed.`);
                warnedUl = true;
            }
            return;
        }
        warnedUl = false;

        let commitCount = 0;
        uls.forEach(ul => {
            const lis = [...ul.children];
            commitCount += lis.length;
            lis.reverse().forEach(li => ul.appendChild(li));
        });

        const days = [...timeline.children];
        days.reverse().forEach(d => timeline.appendChild(d));

        timeline.dataset.reversed = '1';
        console.info(`${TAG} Reversed ${commitCount} commits across ${days.length} day group(s).`);
    }

    reverseCommits();

    const observer = new MutationObserver(reverseCommits);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('soft-nav:end', reverseCommits);
    document.addEventListener('turbo:load', reverseCommits);
    document.addEventListener('turbo:render', reverseCommits);
    document.addEventListener('pjax:end', reverseCommits);

    console.info(`${TAG} loaded.`);
})();