// ==UserScript==
// @name         GitHub PR Commits — Newest First
// @namespace    https://github.com/
// @version      1.5.0
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
  // GitHub's own test ids, stable across the 2026-10 move from a <div> timeline
  // with hashed ListView classes to a Primer React <ol>. The hashed classes broke
  // this script that day, so neither list is found by its class any more.
  const DAY_TITLE = 'h3[data-testid="commit-group-title"]';
  const COMMIT_ROW = 'li[data-testid="commit-row-item"]';

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

  // Classes that only the first child carries, captured the first time a
  // container is seen. The Primer timeline marks its first day with one
  // (`top__…`, it trims the connector line above the badge), so the mark must
  // follow whichever day is on top, or the line pokes out above the newest day
  // and a gap opens above the oldest.
  const firstOnly = new WeakMap();

  function edgeClasses(children) {
    if (children.length < 2) return [];
    const [first, ...rest] = children;
    return [...first.classList].filter((name) => !rest.some((child) => child.classList.contains(name)));
  }

  function moveEdgeClasses(container) {
    const names = firstOnly.get(container) ?? [];
    [...container.children].forEach((child, i) => {
      for (const name of names) {
        // toggle() with a force that matches is not a mutation, so this stays quiet on re-runs.
        if (child.classList.contains(name) !== (i === 0)) child.classList.toggle(name, i === 0);
      }
    });
  }

  /** Returns true when the DOM had to move. */
  function newestFirst(container) {
    const children = [...container.children];
    if (!children.length) return false;
    if (!firstOnly.has(container)) firstOnly.set(container, edgeClasses(children));

    let next = children.reduce(
      (highest, child) => Math.max(highest, Number(child.dataset[ORDER] ?? -1)), -1) + 1;
    for (const child of children) {
      if (child.dataset[ORDER] === undefined) child.dataset[ORDER] = String(next++);
    }

    const wanted = [...children].sort(
      (a, b) => Number(b.dataset[ORDER]) - Number(a.dataset[ORDER]));
    // Touching the DOM unconditionally would retrigger the observer for ever.
    const moved = !wanted.every((child, i) => child === children[i]);
    if (moved) for (const child of wanted) container.appendChild(child);
    moveEdgeClasses(container);
    return moved;
  }

  function apply() {
    if (!isOnCommitsTab()) return;

    const title = need(document, DAY_TITLE, 'Commit day heading');
    if (!title) return;
    if (!need(document, COMMIT_ROW, 'Commit row')) return;

    const lists = new Set([...document.querySelectorAll(COMMIT_ROW)].map((row) => row.parentElement));
    for (const list of lists) newestFirst(list);

    const timeline = title.closest('li')?.parentElement;
    if (timeline) newestFirst(timeline);
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