// ==UserScript==
// @name         GitHub Actions — CI + default branch pin
// @namespace    https://github.com/fgilio
// @version      1.2.3
// @description  Pins a "CI+main" filter at the top of the GitHub Actions sidebar: one click to the CI workflow runs on the repository default branch.
// @author       Franco Gilio
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @match        https://github.com/*
// @run-at       document-idle
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-actions-ci-branch-pin.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-actions-ci-branch-pin.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

// The @match is the whole host rather than the Actions path, because you reach
// Actions by clicking the repo tab from a PR. That is a Turbo soft nav, and
// Tampermonkey decides whether to inject at document load, so a path-scoped
// @match leaves the script absent on the one route it exists for. repoSlug()
// does the narrowing instead, and apply() is a no-op everywhere else.

(function () {
  'use strict';

  /** Sidebar label of the workflow to pin (matched case-insensitively). */
  const WORKFLOW_LABEL = 'CI';
  const WORKFLOW_LABEL_LC = WORKFLOW_LABEL.toLowerCase();
  /** How long a resolved default branch stays trusted before it is re-checked. */
  const BRANCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  const TAG = '[ci-pin]';
  const PIN_ID = 'fg-workflow-branch-pin';
  const DIVIDER_ID = `${PIN_ID}-divider`;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const BOLT_PATH = 'M9.6 1 3.2 9.2h4L6.4 15l6.4-8.2h-4L9.6 1Z';

  /** The one piece of GitHub markup this script depends on. Named so a miss can be reported. */
  const SIDEBAR_LIST = 'nav-list > ul.ActionListWrap';

  const inFlight = new Set();

  // Without this, a Primer markup change presents as "the pin stopped appearing".
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

  /** `owner/repo` when the current page is that repository's Actions area. */
  function repoSlug() {
    const [owner, repo, section] = location.pathname.split('/').filter(Boolean);
    return section === 'actions' ? `${owner}/${repo}` : null;
  }

  function readCache(slug) {
    try {
      return JSON.parse(GM_getValue(`default-branch:${slug}`, 'null'));
    } catch {
      return null;
    }
  }

  // One key per repo rather than the single blob snippets/gm-store.js prescribes:
  // entries are independent, ~40 bytes, and never need a cross-repo migration.
  function writeCache(slug, branch) {
    GM_setValue(`default-branch:${slug}`, JSON.stringify({ branch, ts: Date.now() }));
  }

  /** Reads the default branch off the repository home page, which states it verbatim. */
  async function fetchDefaultBranch(slug) {
    const home = await fetch(`/${slug}`, { credentials: 'include' });
    if (home.ok) {
      const stated = (await home.text()).match(/"defaultBranch":"([^"]+)"/);
      if (stated) return stated[1];
    }

    // Fallback only, despite being ~100x smaller than the page above: this list
    // is ordered heuristically, so it names the default branch by guess, not by
    // statement. Cheap bytes are not worth a wrong branch in the label.
    const refs = await fetch(`/${slug}/refs?type=branch`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    const names = refs?.refs ?? [];
    return names.find((name) => name === 'main' || name === 'master') ?? names[0];
  }

  /** Cached default branch, or null while it is still being resolved in the background. */
  function defaultBranch(slug, { force = false } = {}) {
    const cached = force ? null : readCache(slug);
    if (cached && Date.now() - cached.ts < BRANCH_TTL_MS) return cached.branch;

    if (!inFlight.has(slug)) {
      inFlight.add(slug);
      fetchDefaultBranch(slug)
        .then((branch) => branch && writeCache(slug, branch))
        .catch((error) => console.error(`${TAG} default branch lookup failed`, error))
        .finally(() => {
          inFlight.delete(slug);
          schedule();
        });
    }
    return cached?.branch ?? null;
  }

  /** The sidebar link for the pinned workflow, if this repository has one. */
  function workflowLink(list) {
    // Scoped to the sidebar <ul>: the rightmost compound is a bare class, so
    // against `document` this would collect every ActionList label on the page
    // (Primer uses ActionList for menus too) on every render.
    const labels = list.querySelectorAll('a.ActionListContent .ActionListItem-label');
    for (const label of labels) {
      if (label.textContent.trim().toLowerCase() !== WORKFLOW_LABEL_LC) continue;
      const link = label.closest('a');
      if (link?.pathname.includes('/actions/workflows/')) return link;
    }
    return null;
  }

  function boltIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', BOLT_PATH);
    svg.append(path);
    return svg;
  }

  function buildPin() {
    const item = document.createElement('li');
    item.id = PIN_ID;
    item.className = 'ActionListItem';

    const link = document.createElement('a');
    link.className = 'ActionListContent';
    link.dataset.turboFrame = 'repo-content-turbo-frame';

    const visual = document.createElement('span');
    visual.className = 'ActionListItem-visual ActionListItem-visual--leading';
    visual.append(boltIcon());

    const label = document.createElement('span');
    label.className = 'ActionListItem-label ActionListItem-label--truncate';

    link.append(visual, label);
    item.append(link);
    return item;
  }

  function buildDivider() {
    const divider = document.createElement('li');
    divider.id = DIVIDER_ID;
    divider.className = 'ActionList-sectionDivider';
    divider.setAttribute('role', 'presentation');
    divider.setAttribute('aria-hidden', 'true');
    return divider;
  }

  function addStyles() {
    if (document.getElementById(`${PIN_ID}-styles`)) return;
    const style = document.createElement('style');
    style.id = `${PIN_ID}-styles`;
    style.textContent = `
      #${PIN_ID} .ActionListContent { display: flex; align-items: center; gap: 8px; }
      #${PIN_ID} .ActionListItem-visual { display: flex; color: var(--fgColor-muted, #848d97); }
      #${PIN_ID}.ActionListItem--navActive .ActionListItem-visual { color: inherit; }
    `;
    document.head.append(style);
  }

  function removePin() {
    document.getElementById(PIN_ID)?.remove();
    document.getElementById(DIVIDER_ID)?.remove();
  }

  function apply() {
    const slug = repoSlug();
    if (!slug) {
      removePin();
      return;
    }

    // The sidebar is absent for a moment on every navigation, so only report it
    // once <nav-list> itself exists, by which point a miss is a real markup change.
    const list = document.querySelector(SIDEBAR_LIST);
    if (!list) {
      if (document.querySelector('nav-list')) need(document, SIDEBAR_LIST, 'Actions sidebar list');
      removePin();
      return;
    }

    // No workflow by this name in this repository: nothing to pin, and that is fine.
    const workflow = workflowLink(list);
    if (!workflow) {
      removePin();
      return;
    }

    const branch = defaultBranch(slug);
    if (!branch) return; // Still resolving. Render once the answer is in rather than guess.

    const href = `${workflow.pathname}?query=${encodeURIComponent(`branch:${branch}`)}`;
    const query = new URLSearchParams(location.search).get('query')?.trim();
    const isCurrent = location.pathname === workflow.pathname && query === `branch:${branch}`;

    addStyles();
    const pin = document.getElementById(PIN_ID) ?? buildPin();
    const link = pin.querySelector('a');
    const label = pin.querySelector('.ActionListItem-label');
    const text = `${workflow.textContent.trim()}+${branch}`;

    link.href = href;
    link.ariaLabel = text;
    link.ariaCurrent = isCurrent ? 'page' : null;
    pin.classList.toggle('ActionListItem--navActive', isCurrent);
    // Guarded, unlike the writes above: assigning textContent replaces a child
    // node, which the childList observer sees, re-entering apply() forever.
    if (label.textContent !== text) label.textContent = text;

    // The pin and the workflow entry point at the same view, so only one of them is current.
    const workflowItem = workflow.closest('li.ActionListItem');
    if (isCurrent && workflowItem?.classList.contains('ActionListItem--navActive')) {
      workflowItem.classList.remove('ActionListItem--navActive');
      workflow.removeAttribute('aria-current');
    }

    if (!pin.isConnected) list.prepend(pin, buildDivider());
  }

  let scheduled = false;
  // setTimeout, not rAF. See CLAUDE.md "SPA navigation".
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try {
        apply();
      } catch (error) {
        console.error(`${TAG} apply failed`, error);
      }
    }, 50);
  }

  GM_registerMenuCommand('Re-detect default branch', () => {
    const slug = repoSlug();
    if (slug) defaultBranch(slug, { force: true });
  });

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  // 'soft-nav:end' is GitHub's React router, which drives the Actions pages and
  // fires nothing else; the rest cover the Turbo/pjax pages GitHub still serves.
  for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
    document.addEventListener(event, schedule);
  }
  window.addEventListener('popstate', schedule);
  schedule();
})();
