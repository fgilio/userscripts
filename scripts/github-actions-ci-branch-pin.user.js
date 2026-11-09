// ==UserScript==
// @name         GitHub Actions — CI + default branch pin
// @namespace    https://github.com/fgilio
// @version      1.4.0
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
  const SECTION_ID = `${PIN_ID}-section`;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const BOLT_PATH = 'M9.6 1 3.2 9.2h4L6.4 15l6.4-8.2h-4L9.6 1Z';

  // The GitHub markup this script depends on, named so a miss can be reported.
  // GitHub hashes its class names (Item__jZ1pZ3, current__itRjMz), so every hook
  // here is an aria-label, a data-component or a data-* flag, which it does not.
  // 2026-11: the Actions sidebar moved from ActionList to this Sidebar component.
  const SIDEBAR = 'aside[aria-label="Actions"] nav[data-component="Sidebar.Main"]';
  const SECTION = '[data-component="Sidebar.Section"]';
  const ITEM = '[data-component="Sidebar.Item"]';
  const ITEM_LABEL = 'a > [data-sidebar-collapse-content]';
  const ITEM_ICON = 'a svg';
  const ITEM_EXTRAS = '[data-component="Sidebar.Action"], [role="tooltip"]';
  /**
   * The current item is marked by a hashed class only (current__itRjMz on the
   * item, current__3yAyXP on its link), and no attribute the CSS reads. The
   * stem before the hash is the durable part, so match on that.
   */
  const CURRENT_CLASS = /^current__/;

  const inFlight = new Set();

  // Without this, a GitHub markup change presents as "the pin stopped appearing".
  const warned = new Set();
  function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(message);
  }
  function need(root, selector, what) {
    const el = root.querySelector(selector);
    if (el) { warned.delete(selector); return el; }
    warnOnce(selector, `${TAG} ${what} not found (selector "${selector}"). Site markup changed. Update the selector in this script.`);
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

  /**
   * The default branch as the repository home page states it. GitHub wrote it as
   * JSON ("defaultBranch":"main") until 2026-10, then as a JS literal
   * (defaultBranch:"main"). Both match, and so does the escaped form
   * (\"defaultBranch\":\"main\") a JSON-in-a-string payload would carry.
   */
  function parseDefaultBranch(html) {
    return html.match(/\\?"?defaultBranch\\?"?:\\?"([^"\\]+)/)?.[1] ?? null;
  }

  /** Reads the default branch off the repository home page, which states it verbatim. */
  async function fetchDefaultBranch(slug) {
    const home = await fetch(`/${slug}`, { credentials: 'include' });
    if (home.ok) {
      const stated = parseDefaultBranch(await home.text());
      if (stated) return stated;
      console.warn(`${TAG} defaultBranch not found on the /${slug} page. Falling back to the branch list. Update parseDefaultBranch().`);
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
  function workflowLink(sidebar) {
    for (const label of sidebar.querySelectorAll(`${ITEM} > ${ITEM_LABEL}`)) {
      if (label.closest(`#${SECTION_ID}`)) continue;
      if (label.textContent.trim().toLowerCase() !== WORKFLOW_LABEL_LC) continue;
      const link = label.closest('a');
      if (link?.pathname.includes('/actions/workflows/')) return link;
    }
    return null;
  }

  function boltIcon(template) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    // Keep the octicon class and inline alignment of the icon it replaces.
    for (const attr of ['class', 'style', 'display', 'overflow']) {
      const value = template?.getAttribute(attr);
      if (value) svg.setAttribute(attr, value);
    }
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

  /** The hashed "current" classes GitHub put on an item and its link. */
  function currentClasses(el) {
    return [...el.classList].filter((name) => CURRENT_CLASS.test(name));
  }

  // Learned from whichever item GitHub marks current, since the hash is per build.
  // Every Actions view has one (All workflows, or a workflow), so this fills in
  // before the pin can ever need it.
  let learned = { item: [], link: [] };
  function learnCurrentClasses(sidebar) {
    const link = sidebar.querySelector(`${ITEM} > a[aria-current="page"]`);
    if (!link) return;
    const item = currentClasses(link.parentElement);
    const own = currentClasses(link);
    if (item.length || own.length) learned = { item, link: own };
    else warnOnce('current-class', `${TAG} The current sidebar item has no class matching ${CURRENT_CLASS}. The pin cannot show itself as current. Update CURRENT_CLASS.`);
  }

  /** Marks an item current or not, the way GitHub does: aria-current plus the hashed classes. */
  function setCurrent(item, link, on) {
    link.ariaCurrent = on ? 'page' : null;
    for (const name of learned.item) item.classList.toggle(name, on);
    for (const name of learned.link) link.classList.toggle(name, on);
  }

  /**
   * Clones a native sidebar item rather than rebuilding one, so the pin inherits
   * whatever hashed classes this build ships. See CLAUDE.md "Making injected UI
   * look native". It sits in its own section, cloned from the first one, so the
   * site's own rule draws the line between it and "All workflows" (every section
   * but the first carries a top border). Null until an item with an icon exists.
   */
  function buildPin(sidebar) {
    const firstSection = sidebar.querySelector(SECTION);
    const template = [...sidebar.querySelectorAll(ITEM)].find((el) => el.querySelector(ITEM_ICON));
    if (!firstSection || !template) return null;

    const item = template.cloneNode(true);
    item.id = PIN_ID;
    for (const el of item.querySelectorAll(ITEM_EXTRAS)) el.remove();
    // React ids would duplicate the original's, and aria-labelledby would point back at it.
    for (const el of item.querySelectorAll('[id]')) el.removeAttribute('id');
    const link = item.querySelector('a');
    for (const attr of ['aria-labelledby', 'aria-current', 'data-discover']) link.removeAttribute(attr);
    // The template is "All workflows", which is current on /actions.
    for (const el of [item, link]) el.classList.remove(...currentClasses(el));

    const icon = item.querySelector(ITEM_ICON);
    icon.replaceWith(boltIcon(icon));

    const section = firstSection.cloneNode(false);
    section.id = SECTION_ID;
    section.append(item);
    return section;
  }

  function removePin() {
    document.getElementById(SECTION_ID)?.remove();
  }

  function apply() {
    const slug = repoSlug();
    if (!slug) {
      removePin();
      return;
    }

    // The sidebar is absent for a moment on every navigation, so only report it
    // once the run list in the main pane exists, by which point a miss is a
    // real markup change.
    const sidebar = document.querySelector(SIDEBAR);
    if (!sidebar) {
      if (document.querySelector('a[href*="/actions/runs/"]')) need(document, SIDEBAR, 'Actions sidebar');
      removePin();
      return;
    }

    // No workflow by this name in this repository: nothing to pin, and that is fine.
    const workflow = workflowLink(sidebar);
    if (!workflow) {
      removePin();
      return;
    }

    const branch = defaultBranch(slug);
    if (!branch) return; // Still resolving. Render once the answer is in rather than guess.

    const href = `${workflow.pathname}?query=${encodeURIComponent(`branch:${branch}`)}`;
    const query = new URLSearchParams(location.search).get('query')?.trim();
    const isCurrent = location.pathname === workflow.pathname && query === `branch:${branch}`;

    learnCurrentClasses(sidebar);
    const section = document.getElementById(SECTION_ID) ?? buildPin(sidebar);
    if (!section) {
      need(sidebar, `${ITEM} ${ITEM_ICON}`, 'Sidebar item with an icon, to clone');
      return;
    }
    const pin = section.querySelector(`#${PIN_ID}`);
    const link = pin.querySelector('a');
    const label = pin.querySelector(ITEM_LABEL);
    const text = `${workflow.textContent.trim()}+${branch}`;

    // GitHub's React router intercepts clicks on same-origin links, so a plain
    // href still navigates softly, without a page load.
    link.href = href;
    link.ariaLabel = text;
    setCurrent(pin, link, isCurrent);
    // Guarded, unlike the writes above: assigning textContent replaces a child
    // node, which the childList observer sees, re-entering apply() forever.
    if (label.textContent !== text) label.textContent = text;

    // The pin and the workflow entry point at the same view, so only one of them is current.
    // React marks the workflow current on every view of its path, the pinned one
    // included, and never re-applies a mark it believes is still there. So the
    // mark is taken off for the pinned view and handed back for any other view of
    // that path. Attribute writes do not trip the childList observer, so this never loops.
    const workflowItem = workflow.closest(ITEM);
    const workflowMarked = workflow.getAttribute('aria-current') === 'page';
    if (workflowItem && location.pathname === workflow.pathname && workflowMarked === isCurrent) {
      setCurrent(workflowItem, workflow, !isCurrent);
    }

    // Before the first section, not inside it: React owns that section's children.
    if (!section.isConnected) sidebar.querySelector(SECTION)?.before(section);
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
