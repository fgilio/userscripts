// ==UserScript==
// @name         GitHub PR Commits — Newest First
// @namespace    https://github.com/
// @version      1.4.0
// @description  Reverse the PR Commits tab so newest commits (and newest day) appear on top
// @author       Franco Gilio
// @match        https://github.com/*/*/pull/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @run-at       document-idle
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-commits-newest-first.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-commits-newest-first.user.js
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

  // Arrival order, stamped once per node. A plain reverse() is only correct the
  // first time, so the old marker had to retire the script after one run, and a
  // commit pushed while the tab is open then stayed at the bottom. Sorting on the
  // stamp instead is correct every run: re-running changes nothing, and a node
  // that arrives later sorts ahead of everything already stamped.
  const ORDER = 'fgOrder';

  /** Returns true when the DOM had to move. */
  function newestFirst(container) {
    const children = [...container.children];
    if (!children.length) return false;

    let next = children.reduce(
      (highest, child) => Math.max(highest, Number(child.dataset[ORDER] ?? -1)), -1) + 1;
    for (const child of children) {
      if (child.dataset[ORDER] === undefined) child.dataset[ORDER] = String(next++);
    }

    const wanted = [...children].sort(
      (a, b) => Number(b.dataset[ORDER]) - Number(a.dataset[ORDER]));
    // Touching the DOM unconditionally would retrigger the observer for ever.
    if (wanted.every((child, i) => child === children[i])) return false;

    for (const child of wanted) container.appendChild(child);
    return true;
  }

  function apply() {
    if (!isOnCommitsTab()) return;

    const timeline = need(document, TIMELINE, 'Timeline container');
    if (!timeline) return;
    if (!need(timeline, COMMIT_UL, 'Commit list')) return;

    for (const ul of timeline.querySelectorAll(COMMIT_UL)) newestFirst(ul);
    newestFirst(timeline);
  }

  // setTimeout, not rAF. See CLAUDE.md "SPA navigation".
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try { apply(); } catch (error) { console.error(TAG, error); }
    }, 50);
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
    document.addEventListener(event, schedule);
  }
  window.addEventListener('popstate', schedule);
  schedule();
})();