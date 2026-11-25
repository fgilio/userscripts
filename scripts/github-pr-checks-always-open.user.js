// ==UserScript==
// @name         GitHub PR Checks Always Open
// @namespace    https://github.com/fgilio
// @version      1.0.0
// @description  Opens the Checks panel of the PR merge box on every load, so the check list shows without a click
// @author       Franco Gilio
// @match        https://github.com/*/*/pull/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @run-at       document-idle
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-checks-always-open.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-checks-always-open.user.js
// @grant        none
// ==/UserScript==

// The merge box shows three tiles, Checks, Comments and Approvals, as one accordion:
// at most one is open, and GitHub renders all of them shut. This opens Checks.
//
// Hands off once you touch the box. A click (or Enter) on any tile is your choice,
// so from then on the page is left as you set it: open Comments, and Checks stays
// shut; collapse Checks, and it stays collapsed. Any URL change starts fresh. Without
// this rule the script and the accordion would fight over every click.

(function () {
  'use strict';

  const TAG = '[checks-always-open]';

  /** The PR conversation page only. The merge box is not on /checks, /files, /commits. */
  const ROUTE = /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/;

  // Verified 2026-11-25. `data-testid="mini-status"` is on each tile. The Checks tile
  // is the one whose buttons carry the telemetry action `pull_requests.checks.expand`
  // (collapsed) or `.collapse` (open). The hashed classes (MiniStatus__eXKwQ4) are not
  // used.
  const TILE = '[data-testid="mini-status"]';
  const CHECKS_ACTION = /^pull_requests\.checks\./;

  // The tile holds several buttons that all toggle it: the title, the "2 pending"
  // summary and one per progress-bar segment. The title is the one in the tab order.
  const TOGGLE = 'button[aria-expanded]:not([tabindex="-1"]):not([data-testid])';

  /**
   * The path the user took over by clicking a tile, or null. Cleared on any path
   * change, so a soft nav to another PR, or to Commits and back, starts fresh.
   */
  let handsOff = null;

  let warned = false;

  function checksTile() {
    for (const tile of document.querySelectorAll(TILE)) {
      const button = tile.querySelector('button[data-telemetry-action]');
      if (button && CHECKS_ACTION.test(button.dataset.telemetryAction)) return tile;
    }
    return null;
  }

  function apply() {
    const path = location.pathname;
    if (handsOff !== path) handsOff = null;
    if (!ROUTE.test(path) || handsOff) return;

    // No tiles at all is normal: the merge box has not rendered yet, or the PR has no
    // merge box. Stay quiet and let the observer call again.
    if (!document.querySelector(TILE)) return;

    // A PR with no checks has no Checks tile either, so this is quiet too.
    const tile = checksTile();
    if (!tile) return;

    const toggle = tile.querySelector(TOGGLE) ?? tile.querySelector('button[aria-expanded]');
    if (!toggle) {
      if (!warned) {
        warned = true;
        console.warn(`${TAG} found the Checks tile but no toggle (selector "${TOGGLE}"). GitHub changed the merge box. Update TOGGLE.`);
      }
      return;
    }

    // Another tile is open: the accordion would close it. That only happens when the
    // user opened it, which handsOff already covers, but GitHub may restore it too.
    const other = [...document.querySelectorAll(`${TILE} button[aria-expanded="true"]`)]
      .some(button => !tile.contains(button));
    if (other) return;

    if (toggle.getAttribute('aria-expanded') === 'false') toggle.click();
  }

  // Our own toggle.click() is untrusted, so only a real click or key press lands here.
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    if (event.target instanceof Element && event.target.closest(TILE)) handsOff = location.pathname;
  }, true);

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

  // childList ONLY. A collapse unmounts the check list, so it shows up as childList too.
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
    document.addEventListener(event, schedule);
  }
  window.addEventListener('popstate', schedule);
  schedule();
})();
