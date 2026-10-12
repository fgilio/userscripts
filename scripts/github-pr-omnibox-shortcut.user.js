// ==UserScript==
// @name         GitHub: PR Omnibox Shortcut
// @namespace    https://github.com/fgilio
// @version      1.0.0
// @description  Typing mentat#369 or mentat/369 in Chrome's address bar opens that pull request on GitHub instead of a Google search.
// @author       Franco Gilio
// @match        https://www.google.com/search*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @updateURL    https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-omnibox-shortcut.user.js
// @downloadURL  https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-omnibox-shortcut.user.js
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULT_OWNER = 'publicala';

  /**
   * repo#N, repo/N, owner/repo#N or owner/repo/N. The repo name needs two
   * characters, so searches like "c#10" or "f#6" stay searches.
   */
  const SHORTCUT = /^(?:([A-Za-z0-9-]+)\/)?([A-Za-z0-9._-]{2,})[#/](\d+)$/;

  function pullRequestUrlFor(search) {
    const params = new URLSearchParams(search);

    // Chrome adds sourceid=chrome to address bar searches only, so a query
    // typed into Google's own search box is never redirected.
    if (params.get('sourceid') !== 'chrome') return null;

    const match = SHORTCUT.exec((params.get('q') || '').trim());
    if (!match) return null;

    const [, owner = DEFAULT_OWNER, repo, number] = match;

    // GitHub redirects /pull/N to /issues/N when N is an issue.
    return `https://github.com/${owner}/${repo}/pull/${number}`;
  }

  const url = pullRequestUrlFor(location.search);
  if (url) location.replace(url);
})();
