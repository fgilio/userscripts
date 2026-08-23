// ==UserScript==
// @name         GitHub Auto-Expand Single Check Group
// @namespace    https://github.com/
// @version      1.5.0
// @description  Auto-expands check workflows on the PR Checks tab: all of them up to three, otherwise the one named CI plus any workflow holding a failure
// @author       Franco Gilio
// @match        https://github.com/*/*/pull/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @run-at       document-idle
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-auto-expand-single-check-group.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-auto-expand-single-check-group.user.js
// @grant        none
// ==/UserScript==

// The @name says "Single" because it started out only handling the one-group case.
// It is the installed identity, so per golden rule 1 it stays, and the filename with
// it: renaming the file would move the @downloadURL and break updates for anyone
// who already installed this. The @description carries the current behaviour.

(function () {
  'use strict';

  const TAG = '[auto-expand]';
  const SELECTOR = 'details.checks-list-item';

  // `checks-list-item` is on the workflow <summary> as well as on every job row, so
  // the row selector has to say div where the workflow selector says details.
  const ROW = 'div.checks-list-item';

  // Read from the accessible name on a job's status icon, e.g. "This job failed".
  // Verified that the rows stay in the DOM while their workflow is collapsed, which
  // is what makes a failure findable before anything has been opened.
  const FAILED = /fail|timed out|cancel|action required|error/i;

  const ROUTE = /\/pull\/\d+\/checks(?:[/?#]|$)/;

  // Up to this many workflows, open all of them. Above it, open only what is worth
  // reading (CI, plus anything failing), because the point is not to face a wall of
  // collapsed workflows.
  const EXPAND_ALL_UP_TO = 3;
  const CI_NAME = 'ci';

  // Set on a group once it has been expanded. apply() runs on every mutation, so
  // without this a group collapsed by hand would spring straight back open. The
  // marker lives on the node, which SPA navigation replaces, so it resets per page.
  const MARKER = 'fgAutoExpanded';

  let warnedNoName = false;

  // The workflow name is the first non-empty line of the summary, which also renders
  // "on: <event>" beneath it. Verified against GitHub's live markup: there is no bold
  // wrapper, no aria-label, and no unhashed class to key on, so the text is the most
  // durable thing available.
  function groupName(details) {
    const summary = details.querySelector('summary');
    if (!summary) return null;
    return summary.textContent.trim().split('\n').map(s => s.trim()).find(Boolean) ?? null;
  }

  /** True when any job in this workflow needs attention. */
  function hasFailure(group) {
    for (const row of group.querySelectorAll(ROW)) {
      const icon = row.querySelector('svg[aria-label]') ?? row.querySelector('[aria-label]');
      if (icon && FAILED.test(icon.getAttribute('aria-label'))) return true;
    }
    return false;
  }

  function expand(details) {
    if (details.dataset[MARKER] === '1') return;
    details.dataset[MARKER] = '1';
    // The summary contains an <a>, so clicking it navigates away. Set open instead.
    if (!details.open) details.open = true;
  }

  function apply() {
    if (!ROUTE.test(location.pathname)) return;

    const groups = [...document.querySelectorAll(SELECTOR)];
    if (!groups.length) return;

    if (groups.length <= EXPAND_ALL_UP_TO) {
      groups.forEach(expand);
      return;
    }

    const named = groups.map(g => [g, groupName(g)]);

    // A group with no readable name means the summary is no longer name-then-event.
    // That is a real markup change and the only thing here worth a console line.
    if (!warnedNoName && named.some(([, name]) => !name)) {
      warnedNoName = true;
      console.warn(`${TAG} could not read a workflow name from a "${SELECTOR}" summary. ` +
                   `Expected the name as its first line, with "on: <event>" beneath. ` +
                   `GitHub changed the markup; update groupName().`);
    }

    // A workflow holding a failure is opened whatever it is called. Without this a
    // failure outside CI was hoisted to the top of the page by
    // github-pr-checks-signal-first and then left shut, which is worse than either
    // behaviour on its own.
    const wanted = new Set(groups.filter(hasFailure));
    for (const [group, name] of named) {
      if (name && name.toLowerCase() === CI_NAME) wanted.add(group);
    }

    if (wanted.size) {
      wanted.forEach(expand);
      return;
    }

    // Nothing failing and nothing called CI. Plenty of repos name their workflows
    // something else entirely, so this is an ordinary state rather than a fault:
    // fall back to the small-list behaviour and open everything. Deliberately quiet.
    groups.forEach(expand);
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
