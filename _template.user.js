// ==UserScript==
// @name         Site: What It Does
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

  const SEL = {
    container: 'main .container',
  };

  const warned = new Set();
  function need(root, selector, what) {
    const el = root.querySelector(selector);
    if (el) { warned.delete(selector); return el; }
    if (!warned.has(selector)) {
      warned.add(selector);
      console.warn(`${TAG} ${what} not found (selector "${selector}"). Site markup changed. Update the selector in this script.`);
    }
    return null;
  }

  function apply() {
    if (!ROUTE.test(location.pathname)) return;

    const container = need(document, SEL.container, 'page container');
    if (!container) return;

    if (container.dataset.fgDone === '1') return;

    // ...do the work...

    container.dataset.fgDone = '1';
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
  // Output derived from the URL rather than the DOM also needs the history patch
  // in snippets/spa-nav.js.

  schedule();
})();
