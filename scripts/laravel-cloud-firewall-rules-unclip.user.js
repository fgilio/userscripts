// ==UserScript==
// @name         Laravel Cloud - Firewall Rules Unclip
// @namespace    https://github.com/fgilio
// @version      1.0.1
// @description  Truncate long firewall rule names with an ellipsis so the events count stays visible, and lock the rules cards against the stray horizontal scroll that hides the action column, on edge network zone pages
// @author       Franco Gilio
// @icon         https://cloud.laravel.com/docs/_mintlify/favicons/cloud/CwnEEs8UQ8WD3Jou/_generated/favicon/apple-touch-icon.png
// @match        https://cloud.laravel.com/*
// @run-at       document-idle
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-firewall-rules-unclip.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-firewall-rules-unclip.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[firewall-rules-unclip]';

  const ROUTE = /^\/org\/[^/]+\/network\/zones\/[^/]+(?:[/?#]|$)/;

  // Every rule row carries a dnd-kit drag handle. aria-roledescription survives
  // redesigns where Tailwind class soup does not.
  const HANDLE = '[aria-roledescription="sortable"]';

  let warnedShape = false;
  function warnShapeOnce(reason) {
    if (warnedShape) return;
    warnedShape = true;
    console.warn(`${TAG} rule row markup changed (${reason}). Update the traversal in this script.`);
  }

  function fixRow(handle) {
    const row = handle.closest('.group');
    if (!row) { warnShapeOnce('no .group ancestor above the drag handle'); return; }
    if (row.dataset.fgUnclipped === '1') return;

    const strip = row.firstElementChild;
    const cell = strip && strip.lastElementChild;
    if (!cell || !cell.classList.contains('flex-1') || cell.childElementCount !== 3) {
      warnShapeOnce('expected a 3-child flex-1 cell of action, name, events');
      return;
    }

    // The cell ships with min-width auto, so a long rule name pushes the row
    // past the card instead of letting the truncate class do its job. Pinning
    // the events cluster keeps the count visible while the name gives way.
    cell.style.minWidth = '0';
    cell.lastElementChild.style.flex = '0 0 auto';

    const name = cell.children[1].firstElementChild;
    if (name) name.title = name.textContent;

    fixCard(row);
    row.dataset.fgUnclipped = '1';
  }

  // The per-row "..." menu hangs a few px outside the card on purpose, which
  // gives the overflow-hidden card scrollable width. Any focus jump can then
  // shove the whole table sideways and hide the action column. overflow: clip
  // keeps the visual clipping but removes the scroll container entirely.
  function fixCard(row) {
    // A card this script already clipped computes overflow-x: clip, so the
    // climb must stop on clip as well as hidden. Otherwise the next row walks
    // past its own card onto the body, whose overflow-x-hidden would match,
    // and clipping the body freezes page scrolling entirely.
    let card = row.parentElement;
    while (card && card !== document.body && !/^(hidden|clip)$/.test(getComputedStyle(card).overflowX)) {
      card = card.parentElement;
    }
    if (!card || card === document.body || card.dataset.fgUnclipped === '1') return;
    card.style.overflow = 'clip';
    card.scrollLeft = 0;
    card.dataset.fgUnclipped = '1';
  }

  function apply() {
    if (!ROUTE.test(location.pathname)) return;
    for (const handle of document.querySelectorAll(HANDLE)) fixRow(handle);
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

  // childList ONLY. characterData or attributes would turn near-zero records
  // into thousands per second on a busy page.
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
    document.addEventListener(event, schedule);
  }
  window.addEventListener('popstate', schedule);

  schedule();
})();
