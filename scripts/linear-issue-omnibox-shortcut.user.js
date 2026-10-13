// ==UserScript==
// @name         Linear: Issue Omnibox Shortcut
// @namespace    https://github.com/fgilio
// @version      1.0.0
// @description  Typing lFUL-698 in Chrome's address bar opens Linear issue FUL-698 instead of a Google search.
// @author       Franco Gilio
// @match        https://www.google.com/search*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=linear.app
// @updateURL    https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/linear-issue-omnibox-shortcut.user.js
// @downloadURL  https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/linear-issue-omnibox-shortcut.user.js
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const WORKSPACE = 'publica';

  /**
   * A lowercase "l", then an uppercase team key and the issue number. The
   * case is the whole guard, so searches like "lsd-25" stay searches.
   */
  const SHORTCUT = /^l([A-Z]{2,5}-\d+)$/;

  function issueUrlFor(search) {
    const params = new URLSearchParams(search);

    // Chrome adds sourceid=chrome to address bar searches only, so a query
    // typed into Google's own search box is never redirected.
    if (params.get('sourceid') !== 'chrome') return null;

    const match = SHORTCUT.exec((params.get('q') || '').trim());
    if (!match) return null;

    return `https://linear.app/${WORKSPACE}/issue/${match[1]}`;
  }

  const url = issueUrlFor(location.search);
  if (url) location.replace(url);
})();
