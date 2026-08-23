// ==UserScript==
// @name         GitHub PR Checks Signal First
// @namespace    https://github.com/
// @version      1.0.0
// @description  On the PR Checks tab, floats whatever needs attention to the top (both workflows and jobs) and sinks skipped jobs to the bottom, dimmed
// @author       Franco Gilio
// @match        https://github.com/*/*/pull/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @run-at       document-idle
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-checks-signal-first.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-pr-checks-signal-first.user.js
// @grant        none
// ==/UserScript==

// Sorting jobs inside their workflow is not enough on its own. A real PR had its
// single failure sitting at row 16 of 17 even after the rows were sorted, because
// the failure was in the third workflow. So this sorts at both levels: workflows by
// their worst job, then jobs within each workflow.

(function () {
  'use strict';

  const TAG = '[checks-signal-first]';

  const ROUTE = /\/pull\/\d+\/checks(?:[/?#]|$)/;

  // `checks-list-item` sits on the workflow <summary> AND on every job row, so the
  // row selector must say div, and the workflow selector must say details.
  const GROUP = 'details.checks-list-item';
  const ROW = 'div.checks-list-item';

  // Status comes from the accessible name on each row's icon: "This job failed",
  // "This job is waiting", "This job was skipped", "This job succeeded". Verified
  // against a live PR, and aria-label is the most durable handle GitHub offers here.
  const RANK = [
    [/fail|timed out|cancel|action required|error/i, 0],   // needs you now
    [/waiting|pending|queued|in progress|running|expected/i, 1],
    [/succeed|success|passed|neutral/i, 2],
    [/skip/i, 3],                                          // noise
  ];

  // Anything unreadable is left where it is, never hoisted and never buried.
  const UNKNOWN_RANK = 2;

  const DIMMED_RANK = 3;
  const DIM_OPACITY = '0.55';

  let warnedNoLabel = false;

  function statusLabel(row) {
    const icon = row.querySelector('svg[aria-label]') ?? row.querySelector('[aria-label]');
    return icon?.getAttribute('aria-label') ?? null;
  }

  function rowRank(row) {
    const label = statusLabel(row);
    if (!label) return UNKNOWN_RANK;
    for (const [pattern, rank] of RANK) if (pattern.test(label)) return rank;
    return UNKNOWN_RANK;
  }

  /** A workflow ranks as badly as its worst job, so a failure anywhere floats it up. */
  function groupRank(group) {
    const rows = [...group.querySelectorAll(ROW)];
    return rows.length ? Math.min(...rows.map(rowRank)) : UNKNOWN_RANK;
  }

  /** Stable: equal ranks keep GitHub's own order. */
  function rankSorted(items, rankOf) {
    return items
      .map((item, index) => ({ item, index, rank: rankOf(item) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(entry => entry.item);
  }

  function sortRows() {
    // Group rows by their container, so a job can never move between workflows.
    const byParent = new Map();
    for (const row of document.querySelectorAll(ROW)) {
      if (!byParent.has(row.parentElement)) byParent.set(row.parentElement, []);
      byParent.get(row.parentElement).push(row);
    }

    for (const [parent, siblings] of byParent) {
      for (const row of siblings) {
        // Writing the same value twice changes nothing, so this stays idempotent.
        row.style.opacity = rowRank(row) === DIMMED_RANK ? DIM_OPACITY : '';
      }

      const sorted = rankSorted(siblings, rowRank);
      // Only touch the DOM when the order is wrong. apply() runs on every mutation,
      // and re-appending unconditionally would spin the observer forever.
      if (sorted.every((row, i) => row === siblings[i])) continue;
      for (const row of sorted) parent.appendChild(row);
    }
  }

  function sortGroups() {
    const groups = [...document.querySelectorAll(GROUP)];
    if (groups.length < 2) return;

    // Each workflow sits in its own js-socket-channel wrapper, and the aside holds
    // several more of those that are empty. Reordering therefore happens on the
    // wrappers, and only within the slots the non-empty ones already occupy, so the
    // empty placeholders beside them are never moved.
    const slots = groups.map(group => group.parentElement);
    if (new Set(slots.map(slot => slot.parentElement)).size !== 1) return;

    const sorted = rankSorted(slots, slot => groupRank(slot.querySelector(GROUP)));
    if (sorted.every((slot, i) => slot === slots[i])) return;

    // Mark each slot, then swap the wrappers into the marks. This preserves the
    // exact positions rather than bunching the workflows together.
    const marks = slots.map(slot => {
      const mark = document.createComment(TAG);
      slot.parentElement.insertBefore(mark, slot);
      return mark;
    });
    sorted.forEach((slot, i) => marks[i].parentElement.replaceChild(slot, marks[i]));
  }

  function apply() {
    if (!ROUTE.test(location.pathname)) return;

    const rows = [...document.querySelectorAll(ROW)];
    if (!rows.length) return;

    if (rows.every(row => !statusLabel(row))) {
      if (!warnedNoLabel) {
        warnedNoLabel = true;
        console.warn(`${TAG} no "${ROW}" row exposes an aria-label for its status. ` +
                     `Expected names like "This job failed" / "This job was skipped". ` +
                     `GitHub changed the markup; update statusLabel().`);
      }
      return;
    }

    sortRows();
    sortGroups();
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
