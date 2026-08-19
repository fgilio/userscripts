// ==UserScript==
// @name         GitHub Repo & Org Nav Reorder
// @namespace    https://github.com/
// @version      3.3.0
// @description  Reorders the repo and org tab navs, flattens the "More" overflow, adds a Releases tab, and hides tab icons without flicker
// @author       Franco Gilio
// @match        https://github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @noframes
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const LEAD_ORDER = ['settings', 'code', 'pull-requests', 'actions', 'releases'];

    // Only Settings moves to the front of the org nav. Everything else keeps its order.
    const ORG_LEAD_ORDER = ['settings'];

    const REPO_NAV_SEL = 'nav[aria-label="Repository"]';
    const ORG_NAV_SEL  = 'nav[aria-label="Organization"]';

    const VIS_SEL = 'ul.prc-components-UnderlineItemList-xKlKC';
    const DD_SEL  = 'ul.prc-ActionList-ActionList-rPFF2';

    // The nav reveals itself unreordered after this, so a markup change cannot
    // leave a blank gap where the tabs should be.
    const REVEAL_FAILSAFE_MS = 1500;

    const tabKey = li => li.querySelector('a[data-tab-item]')?.dataset.tabItem ?? null;

    const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Anchored to the base path, so a repo named "releases" or "settings" cannot
    // false-match its own section.
    function isInSection(base, pattern) {
        return new RegExp('^' + escapeRe(base.replace(/\/$/, '')) + '/' + pattern + '(/|$)')
            .test(location.pathname);
    }

    // Tags and releases are the same conceptual area.
    const isOnReleasesPage = repoBase => isInSection(repoBase, '(releases|tags)');
    const isOnSettingsPage = repoBase => isInSection(repoBase, 'settings');
    // Org settings live under /organizations/<org>/settings, not /<org>/settings.
    const isOnOrgSettingsPage = orgName => isInSection(`/organizations/${orgName}`, 'settings');

    function injectStyle() {
        const ID = '__gh_nav_reorder_style';
        if (document.getElementById(ID)) return;
        const style = document.createElement('style');
        style.id = ID;
        const NAV = `:is(${REPO_NAV_SEL}, ${ORG_NAV_SEL})`;
        style.textContent = `
${NAV} ${VIS_SEL} {
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    scrollbar-width: none !important;
}
${NAV} ${VIS_SEL}::-webkit-scrollbar { display: none !important; }
${NAV} ${VIS_SEL} > li:not([data-gh-overflow-container]) { flex: 0 0 auto !important; }
${NAV} li[data-gh-overflow-container] { display: none !important; }

/* The icon span's presence flips with viewport width during hydration, so hide it
   declaratively rather than on a JS tick. */
${NAV} ${VIS_SEL} a[data-tab-item] span[data-component="icon"] { display: none !important; }

/* Hidden until reordered, so the native order never paints. armFailsafe() reveals
   it regardless. */
${NAV} ${VIS_SEL}:not([data-gh-ready]) { visibility: hidden !important; }
`;
        // <head> may not exist yet at document-start.
        (document.head ?? document.documentElement).append(style);
    }

    function reveal(visible) {
        visible.dataset.ghReady = '1';
    }

    function armFailsafe() {
        setTimeout(() => {
            document.querySelectorAll(
                `${REPO_NAV_SEL} ${VIS_SEL}, ${ORG_NAV_SEL} ${VIS_SEL}`
            ).forEach(reveal);
        }, REVEAL_FAILSAFE_MS);
    }

    // Cloning a sibling inherits whichever layout variant GitHub is currently rendering.
    function buildReleasesItem(nav, repoBase) {
        const template = (nav.querySelector('a[data-tab-item="actions"]') ??
                          nav.querySelector('a[data-tab-item="code"]'))?.closest('li');
        if (!template) return null;
        const li = template.cloneNode(true);
        const a = li.querySelector('a');
        a.href = repoBase.replace(/\/$/, '') + '/releases';
        a.dataset.tabItem = 'releases';
        a.removeAttribute('data-react-nav');
        a.removeAttribute('data-react-nav-anchor');
        a.removeAttribute('aria-current');

        let text = a.querySelector('span[data-component="text"]');
        if (!text) {
            text = document.createElement('span');
            text.dataset.component = 'text';
            a.append(text);
        }
        text.textContent = 'Releases';
        text.dataset.content = 'Releases';

        li.dataset.ghNavInjected = 'releases';
        return li;
    }

    function flattenAndDedupe(nav, visible) {
        const dd = nav.querySelector(DD_SEL);
        if (dd) {
            visible.append(...[...dd.children].filter(tabKey));
            const containerLi = dd.closest('li');
            if (containerLi?.parentElement === visible) {
                containerLi.dataset.ghOverflowContainer = '1';
            }
        }
        const seen = new Set();
        for (const li of [...visible.children]) {
            const key = tabKey(li);
            if (!key) continue;
            if (seen.has(key)) li.remove();
            else seen.add(key);
        }
        return seen;
    }

    // CSS order, not DOM order, so React re-renders and resizes cannot undo it.
    function applyOrder(visible, leadOrder) {
        [...visible.children].forEach((li, i) => {
            const key = tabKey(li);
            if (!key) { li.style.order = '999'; return; }
            const lead = leadOrder.indexOf(key);
            li.style.order = String(lead === -1 ? 100 + i : lead);
        });
    }

    function applyRepo(nav) {
        const visible = nav.querySelector(VIS_SEL);
        if (!visible) return;
        const codeLink = visible.querySelector('a[data-tab-item="code"]') ||
                         nav.querySelector('a[data-tab-item="code"]');
        if (!codeLink) return;
        const repoBase = codeLink.getAttribute('href');

        const seen = flattenAndDedupe(nav, visible);

        if (!seen.has('releases')) {
            const li = buildReleasesItem(nav, repoBase);
            if (li) { visible.append(li); seen.add('releases'); }
        }

        const releasesLink = visible.querySelector('a[data-tab-item="releases"]');
        if (releasesLink) {
            if (isOnReleasesPage(repoBase)) {
                releasesLink.setAttribute('aria-current', 'page');
                codeLink.removeAttribute('aria-current');
            } else {
                releasesLink.removeAttribute('aria-current');
            }
        }

        const settingsLink = visible.querySelector('a[data-tab-item="settings"]');
        if (settingsLink) {
            if (isOnSettingsPage(repoBase)) {
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

        // Non-admins have no Settings tab. Reveal the nav anyway so it is not left hidden.
        if (!seen.has('settings')) { reveal(visible); return; }

        const settingsLink = visible.querySelector('a[data-tab-item="settings"]');
        const orgName = overviewLink
            ? overviewLink.getAttribute('href').replace(/^\//, '').replace(/\/$/, '')
            : null;
        if (settingsLink && orgName) {
            if (isOnOrgSettingsPage(orgName)) {
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
        const repoNav = document.querySelector(REPO_NAV_SEL);
        const orgNav  = document.querySelector(ORG_NAV_SEL);
        if (repoNav) applyRepo(repoNav);
        if (orgNav)  applyOrg(orgNav);
    }

    function boot() {
        injectStyle();
        apply();
    }

    armFailsafe();
    boot();

    // 'soft-nav:end' is GitHub's React router, which drives most of github.com.
    for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
        document.addEventListener(event, boot);
    }
    window.addEventListener('popstate', boot);

    // A turbo navigation swaps content without a reload, so re-arm the fail-safe.
    document.addEventListener('turbo:visit', armFailsafe);

    // setTimeout, not rAF. See CLAUDE.md "SPA navigation". Here specifically, a
    // cmd-clicked repo would sit on the fail-safe reveal until focused, then jump.
    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => { scheduled = false; apply(); }, 50);
    }

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('resize', schedule);
})();