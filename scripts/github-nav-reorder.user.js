// ==UserScript==
// @name         GitHub Repo & Org Nav Reorder
// @namespace    https://github.com/
// @version      3.1.1
// @description  Reorders the GitHub repo tab nav to Settings, Code, Pull requests, Actions, Releases, then the rest. Pulls Settings to the front of the org-level nav. Flattens the "More" overflow into one horizontal-scroll row so order is resize-proof. Adds a synthetic Releases tab. Hides ALL tab icons and injects CSS at document-start so the nav never flickers: icons never paint, and the nav stays hidden until reordered (with a fail-safe reveal so it can never get stuck invisible).
// @author       Franco Gilio
// @match        https://github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const LEAD_ORDER = ['settings', 'code', 'pull-requests', 'actions', 'releases'];

    // For the org-level nav, only Settings is reordered to the front; everything
    // else keeps its natural order behind it.
    const ORG_LEAD_ORDER = ['settings'];

    const REPO_NAV_SEL = 'nav[aria-label="Repository"]';
    const ORG_NAV_SEL  = 'nav[aria-label="Organization"]';

    const VIS_SEL = 'ul.prc-components-UnderlineItemList-xKlKC';
    const DD_SEL  = 'ul.prc-ActionList-ActionList-rPFF2';

    // How long (ms) we allow the nav to stay hidden waiting to be reordered
    // before we force-reveal it. This is the fail-safe: if our reorder logic
    // never runs (GitHub markup change, error, etc.), the user still sees the
    // nav — just briefly in GitHub's native order — instead of a blank gap.
    const REVEAL_FAILSAFE_MS = 1500;

    const tabKey = li => {
        const a = li.querySelector('a[data-tab-item]');
        return a ? a.getAttribute('data-tab-item') : null;
    };

    // True when the current URL is within this repo's Releases section.
    // Includes /tags since tags and releases are the same conceptual area.
    // Anchored to the repo base so a repo named "releases"/"tags" won't false-match.
    function onReleasesPage(repoBase) {
        const base = repoBase.replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('^' + base + '/(releases|tags)(/|$)').test(location.pathname);
    }

    // True when the current URL is within this repo's Settings section.
    // Anchored to the repo base so a repo named "settings" won't false-match.
    function onSettingsPage(repoBase) {
        const base = repoBase.replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('^' + base + '/settings(/|$)').test(location.pathname);
    }

    // True when the current URL is within this org's Settings section.
    // Org settings live under /organizations/<org>/settings (not /<org>/settings),
    // so this is matched separately from the repo settings check.
    function onOrgSettingsPage(orgName) {
        const org = orgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('^/organizations/' + org + '/settings(/|$)').test(location.pathname);
    }

    // Inject CSS as early as possible (document-start). Two jobs:
    //   1) Hide ALL tab icons. GitHub renders tab anchors with an optional
    //      span[data-component="icon"] whose presence flips with viewport width
    //      during hydration, which caused icons to flicker in/out. A declarative
    //      CSS rule applies the instant any icon span exists — including every
    //      mid-hydration frame — so no icon ever paints. No JS timing dependency.
    //   2) Keep the nav's tab list hidden until our reorder logic marks it ready
    //      (data-gh-ready). This suppresses the "native order flashes, then jumps
    //      to reordered" flicker: the user never sees the intermediate order, the
    //      nav simply appears already-correct. A fail-safe timer reveals it no
    //      matter what, so it can never get permanently stuck invisible.
    //
    // Appends to document.head if present, else documentElement, since at
    // document-start <head> may not exist yet.
    function injectStyle() {
        const ID = '__gh_nav_reorder_style';
        if (document.getElementById(ID)) return;
        const style = document.createElement('style');
        style.id = ID;
        style.textContent = `
nav[aria-label="Repository"] ${VIS_SEL},
nav[aria-label="Organization"] ${VIS_SEL} {
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    scrollbar-width: none !important;
}
nav[aria-label="Repository"] ${VIS_SEL}::-webkit-scrollbar,
nav[aria-label="Organization"] ${VIS_SEL}::-webkit-scrollbar { display: none !important; }
nav[aria-label="Repository"] ${VIS_SEL} > li:not([data-gh-overflow-container]),
nav[aria-label="Organization"] ${VIS_SEL} > li:not([data-gh-overflow-container]) {
    flex: 0 0 auto !important;
}
nav[aria-label="Repository"] li[data-gh-overflow-container],
nav[aria-label="Organization"] li[data-gh-overflow-container] { display: none !important; }

/* (1) Hide every tab icon at every width / hydration phase. */
nav[aria-label="Repository"] ${VIS_SEL} a[data-tab-item] span[data-component="icon"],
nav[aria-label="Organization"] ${VIS_SEL} a[data-tab-item] span[data-component="icon"] { display: none !important; }

/* (2) Hide the tab list until reordered; revealed by setting data-gh-ready. */
nav[aria-label="Repository"] ${VIS_SEL}:not([data-gh-ready]),
nav[aria-label="Organization"] ${VIS_SEL}:not([data-gh-ready]) { visibility: hidden !important; }
`;
        (document.head || document.documentElement).appendChild(style);
    }

    // Mark a tab list as ready so the CSS above reveals it.
    function reveal(visible) {
        if (visible && !visible.hasAttribute('data-gh-ready')) {
            visible.setAttribute('data-gh-ready', '1');
        }
    }

    // Fail-safe: after a short delay, reveal ALL nav lists no matter what, so a
    // markup change or error can never leave the nav permanently hidden.
    function armFailsafe() {
        setTimeout(() => {
            document.querySelectorAll(
                `${REPO_NAV_SEL} ${VIS_SEL}, ${ORG_NAV_SEL} ${VIS_SEL}`
            ).forEach(reveal);
        }, REVEAL_FAILSAFE_MS);
    }

    // Build the Releases <li> by cloning a sibling tab so it inherits whichever
    // layout variant GitHub is currently rendering. Icons are hidden by CSS, so
    // we don't touch icon markup — we only fix href/data-tab-item and the label.
    function buildReleasesItem(nav, visible, repoBase) {
        const template =
            (nav.querySelector('a[data-tab-item="actions"]') ||
             nav.querySelector('a[data-tab-item="code"]')).closest('li');
        if (!template) return null;
        const li = template.cloneNode(true);
        const a = li.querySelector('a');
        a.setAttribute('href', repoBase.replace(/\/$/, '') + '/releases');
        a.setAttribute('data-tab-item', 'releases');
        a.removeAttribute('data-react-nav');
        a.removeAttribute('data-react-nav-anchor');
        a.removeAttribute('aria-current');

        // Set ONLY the text span (create it if the cloned variant lacked one).
        let text = a.querySelector('span[data-component="text"]');
        if (!text) {
            text = document.createElement('span');
            text.setAttribute('data-component', 'text');
            a.appendChild(text);
        }
        text.textContent = 'Releases';
        text.setAttribute('data-content', 'Releases');

        li.dataset.ghNavInjected = 'releases';
        return li;
    }

    // Shared helper: flatten the "More" dropdown into the visible row and
    // de-duplicate by data-tab-item. Returns the Set of tab keys now present.
    function flattenAndDedupe(nav, visible) {
        const dd = nav.querySelector(DD_SEL);
        if (dd) {
            Array.from(dd.children).forEach(li => {
                if (tabKey(li)) visible.appendChild(li);
            });
            const containerLi = dd.closest('li');
            if (containerLi && containerLi.parentElement === visible) {
                containerLi.dataset.ghOverflowContainer = '1';
            }
        }
        const seen = new Set();
        Array.from(visible.children).forEach(li => {
            const k = tabKey(li);
            if (!k) return;
            if (seen.has(k)) li.remove();
            else seen.add(k);
        });
        return seen;
    }

    // Shared helper: assign CSS order so the lead tabs come first (survives
    // React re-renders and resize). Everything not in leadOrder keeps its
    // relative order behind the lead tabs.
    function applyOrder(visible, leadOrder) {
        let tail = 100;
        Array.from(visible.children).forEach((li, i) => {
            const k = tabKey(li);
            if (!k) { li.style.order = '999'; return; }
            const lead = leadOrder.indexOf(k);
            li.style.order = String(lead === -1 ? tail + i : lead);
        });
    }

    let applying = false;

    function applyRepo(nav) {
        const visible = nav.querySelector(VIS_SEL);
        if (!visible) return;
        const codeLink = visible.querySelector('a[data-tab-item="code"]') ||
                         nav.querySelector('a[data-tab-item="code"]');
        if (!codeLink) return;
        const repoBase = codeLink.getAttribute('href');

        const seen = flattenAndDedupe(nav, visible);

        if (!seen.has('releases')) {
            const li = buildReleasesItem(nav, visible, repoBase);
            if (li) { visible.appendChild(li); seen.add('releases'); }
        }

        const releasesLink = visible.querySelector('a[data-tab-item="releases"]');
        if (releasesLink) {
            if (onReleasesPage(repoBase)) {
                releasesLink.setAttribute('aria-current', 'page');
                codeLink.removeAttribute('aria-current');
            } else {
                releasesLink.removeAttribute('aria-current');
            }
        }

        const settingsLink = visible.querySelector('a[data-tab-item="settings"]');
        if (settingsLink) {
            if (onSettingsPage(repoBase)) {
                settingsLink.setAttribute('aria-current', 'page');
                codeLink.removeAttribute('aria-current');
            } else {
                settingsLink.removeAttribute('aria-current');
            }
        }

        applyOrder(visible, LEAD_ORDER);
        reveal(visible);
    }

    function applyOrg(nav) {
        const visible = nav.querySelector(VIS_SEL);
        if (!visible) return;

        const overviewLink = visible.querySelector('a[data-tab-item="overview"]') ||
                             nav.querySelector('a[data-tab-item="overview"]');

        const seen = flattenAndDedupe(nav, visible);

        // If there's no Settings tab (non-admins), there's nothing to reorder —
        // but we must still reveal the nav so it doesn't stay hidden.
        if (!seen.has('settings')) { reveal(visible); return; }

        const settingsLink = visible.querySelector('a[data-tab-item="settings"]');
        const orgName = overviewLink
            ? overviewLink.getAttribute('href').replace(/^\//, '').replace(/\/$/, '')
            : null;
        if (settingsLink && orgName) {
            if (onOrgSettingsPage(orgName)) {
                settingsLink.setAttribute('aria-current', 'page');
                if (overviewLink) overviewLink.removeAttribute('aria-current');
            } else {
                settingsLink.removeAttribute('aria-current');
            }
        }

        applyOrder(visible, ORG_LEAD_ORDER);
        reveal(visible);
    }

    function apply() {
        if (applying) return;
        const repoNav = document.querySelector(REPO_NAV_SEL);
        const orgNav  = document.querySelector(ORG_NAV_SEL);
        if (!repoNav && !orgNav) return;
        applying = true;
        try {
            if (repoNav) applyRepo(repoNav);
            if (orgNav)  applyOrg(orgNav);
        } finally {
            applying = false;
        }
    }

    function boot() {
        injectStyle();
        apply();
    }

    // Inject CSS immediately at document-start (before the nav paints), then arm
    // the fail-safe reveal. The rest of the work happens once the nav exists.
    injectStyle();
    armFailsafe();
    boot();

    document.addEventListener('turbo:load', boot);
    document.addEventListener('turbo:render', boot);
    document.addEventListener('pjax:end', boot);

    // turbo navigations swap content without a full reload, so re-hide + re-arm
    // the fail-safe on each navigation start so the new nav also reorders cleanly.
    document.addEventListener('turbo:visit', armFailsafe);

    // setTimeout, not rAF — see CLAUDE.md "SPA navigation". Here specifically:
    // a cmd-clicked repo would sit on the fail-safe reveal (native order) until
    // focused, then visibly jump.
    let scheduled = false;
    function schedule() {
        if (applying || scheduled) return;
        scheduled = true;
        setTimeout(() => { scheduled = false; apply(); }, 50);
    }

    const mo = new MutationObserver(schedule);
    // documentElement is guaranteed to exist at document-start.
    mo.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('resize', schedule);
})();