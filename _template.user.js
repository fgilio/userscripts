// ==UserScript==
// @name         Site — What It Does
// @namespace    https://github.com/fgilio
// @version      1.0.0
// @description  One sentence. What appears, where, and what it is for.
// @author       Franco Gilio
// @match        https://example.com/*/*/thing*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=example.com
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[template]';

  /** Anchored so a path segment that merely contains the word cannot false-match. */
  const ROUTE = /^\/[^/]+\/[^/]+\/thing(?:[/?#]|$)/;

  /** Elements this script depends on. Named here so a warning can point at them. */
  const SEL = {
    container: 'main .container',
  };

  const warned = new Set();
  function need(root, selector, what) {
    const el = root.querySelector(selector);
    if (el) { warned.delete(selector); return el; }
    if (!warned.has(selector)) {
      warned.add(selector);
      console.warn(`${TAG} ${what} not found (selector "${selector}"). Site markup probably changed — re-inspect the DOM and update the script.`);
    }
    return null;
  }

  // ---------------------------------------------------------------- apply ---
  // Idempotent: called many times per second, must be safe every time.
  function apply() {
    if (!ROUTE.test(location.pathname)) return;

    const container = need(document, SEL.container, 'page container');
    if (!container) return;

    // Marker guard, not a closure flag: soft navigation destroys the DOM but
    // keeps the closure, so a boolean would wrongly report "already done".
    if (container.dataset.fgDone === '1') return;

    // …do the work…

    container.dataset.fgDone = '1';
  }

  // ----------------------------------------------------------------- boot ---
  // setTimeout, not requestAnimationFrame: rAF does not fire in background tabs.
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try { apply(); } catch (error) { console.error(TAG, error); }
    }, 50);
  }

  // documentElement, not body: at @run-at document-start there is no body yet.
  // childList ONLY — characterData or attributes would turn near-zero records
  // into thousands per second on a busy page.
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  // 'soft-nav:end' is GitHub's React router and fires first; the rest cover Turbo/pjax.
  for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
    document.addEventListener(event, schedule);
  }
  window.addEventListener('popstate', schedule);
  // If this script's output derives from the URL rather than the DOM, also patch
  // history.pushState/replaceState — see snippets/spa-nav.js.

  schedule();
})();
