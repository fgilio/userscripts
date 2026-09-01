// ==UserScript==
// @name         Laravel Cloud - Firewall Rule IDs
// @namespace    https://github.com/fgilio
// @version      1.0.0
// @description  Print the provider rule id under every custom, rate limit and cache rule name, in the rules table and in the rule editor, on edge network zone pages, so a rule id read off a Cloudflare log names a rule you can see
// @author       Franco Gilio
// @icon         https://cloud.laravel.com/docs/_mintlify/favicons/cloud/CwnEEs8UQ8WD3Jou/_generated/favicon/apple-touch-icon.png
// @match        https://cloud.laravel.com/*
// @run-at       document-idle
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-firewall-rule-ids.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-firewall-rule-ids.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[firewall-rule-ids]';

  const ROUTE = /^\/org\/[^/]+\/network\/zones\/[^/]+(?:[/?#]|$)/;

  // Every rule row carries a dnd-kit drag handle. aria-roledescription survives
  // redesigns where Tailwind class soup does not.
  const HANDLE = '[aria-roledescription="sortable"]';

  /** The Inertia page payload, a plain JSON script beside the app root. */
  const PAYLOAD = 'script[type="application/json"]';

  /** One array per card on the page: Custom rules, Rate limiting, Caching. */
  const RULE_ARRAYS = ['firewallRules', 'rateLimitRules', 'cacheRules'];

  /** The rule editor, and the field the id is written under inside it. */
  const DIALOG = '[role="dialog"]';
  const NAME_FIELD = '#rule_name';
  const CONTROL = '[data-slot="control"]';
  const DESCRIPTION = '[data-slot="description"]';

  const LINE = 'data-fg-rule-id';

  const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';

  const LINE_STYLE = [
    // A full-width item in a wrapping flex row, so it lands under the name.
    'flex:0 0 100%',
    'margin-top:1px',
    'font-size:11px',
    'line-height:1.3',
    `font-family:${MONO}`,
  ].join(';');

  const warned = new Set();
  function warnShapeOnce(reason) {
    if (warned.has(reason)) return;
    warned.add(reason);
    console.warn(`${TAG} the rule markup changed (${reason}). Update the traversal in this script.`);
  }


  /** Maps each rule name to its provider id, or to null when two rules share a name. */
  function indexRules(props) {
    const ids = new Map();
    for (const key of RULE_ARRAYS) {
      if (!Array.isArray(props[key])) continue;
      for (const rule of props[key]) {
        if (!rule || !rule.name || !rule.provider_identifier) continue;
        const clash = ids.has(rule.name) && ids.get(rule.name) !== rule.provider_identifier;
        ids.set(rule.name, clash ? null : rule.provider_identifier);
      }
    }
    return ids;
  }

  /** Reads the rule payload out of a document, and only when it describes `path`. */
  function readProps(doc, path) {
    for (const node of doc.querySelectorAll(PAYLOAD)) {
      let page;
      try { page = JSON.parse(node.textContent); } catch (error) { continue; }
      if (!page || !page.props || !RULE_ARRAYS.some(key => Array.isArray(page.props[key]))) continue;
      if (String(page.url).split('?')[0] !== path) continue;
      return page.props;
    }
    return null;
  }

  /**
   * Fetches the zone page currently in the address bar.
   *
   * The copy of the payload in the page is written once, at first paint, and
   * every later visit is an Inertia navigation that leaves it untouched. So it
   * names the rules of whichever page you opened directly, which on a zone you
   * navigated to is another page entirely.
   */
  async function freshProps(path) {
    const response = await fetch(location.href, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });
    if (!response.ok) throw new Error(`the zone page responded ${response.status}`);

    const props = readProps(new DOMParser().parseFromString(await response.text(), 'text/html'), path);
    if (!props) throw new Error(`the response carries no rule payload for ${path} (selector "${PAYLOAD}")`);
    return props;
  }


  let known = { path: '', ids: new Map() };
  let unknownNames = '';
  let fetching = false;

  function refresh(path) {
    if (fetching) return;
    fetching = true;
    freshProps(path)
      .then(props => {
        if (known.path !== path) return;
        known = { path, ids: indexRules(props) };
        schedule();
      })
      .catch(error => console.warn(TAG, 'no rule ids for this zone.', error.message))
      .finally(() => { fetching = false; });
  }


  function nameCell(handle) {
    const row = handle.closest('.group');
    const cell = row && row.firstElementChild && row.firstElementChild.lastElementChild;
    if (!cell || cell.childElementCount !== 3) {
      warnShapeOnce('expected a 3-child cell of action, name, events');
      return null;
    }

    const wrap = cell.children[1];
    const label = wrap.firstElementChild;
    if (!label) { warnShapeOnce('the name cell holds no label'); return null; }
    return { wrap, name: label.textContent.trim() };
  }

  /** Prints one row's id, and returns the rule name when it has none to print. */
  function printId(handle, ids) {
    const cell = nameCell(handle);
    if (!cell) return null;

    const id = ids.get(cell.name);
    let line = cell.wrap.querySelector(`:scope > [${LINE}]`);

    if (!id) {
      if (line) line.remove();
      return ids.has(cell.name) ? null : cell.name;
    }

    if (!line) {
      line = document.createElement('div');
      line.setAttribute(LINE, '');
      // The design system's own muted colour, so the line follows the page into
      // dark mode where a sampled literal would not.
      line.className = 'text-weak';
      line.style.cssText = LINE_STYLE;
      // Appending to the name cell rather than reparenting the name keeps every
      // node React owns where React put it. A badge beside the name stays on the
      // first line, and the id wraps below both.
      cell.wrap.style.flexWrap = 'wrap';
      cell.wrap.appendChild(line);
    }

    line.textContent = id;
    return null;
  }

  /**
   * Writes the id under the rule name in the editor.
   *
   * The name is read once, when the dialog first appears. Renaming the rule in
   * the field must not take the id away, and a name typed into the New rule
   * dialog must not borrow the id of the rule that already answers to it. Every
   * open mounts a dialog of its own, so the mark leaves with it.
   */
  function labelEditor(dialog, ids) {
    if (!ids.size || dialog.dataset.fgRuleIdRead) return;

    const input = dialog.querySelector(NAME_FIELD);
    if (!input) return;

    const control = input.closest(CONTROL);
    if (!control) { warnShapeOnce(`the rule name field sits outside a "${CONTROL}" wrapper`); return; }

    dialog.dataset.fgRuleIdRead = '1';
    const id = ids.get(input.value.trim());
    if (!id) return;

    // Cloned from a description the dialog already renders, so the line keeps
    // whichever type scale and muted colour the design system is on, and the
    // slot earns it the spacing the form gives every other description.
    const template = dialog.querySelector(DESCRIPTION);
    const line = template ? template.cloneNode(false) : document.createElement('p');
    if (!template) line.className = 'text-weak';
    line.setAttribute('data-slot', 'description');
    line.setAttribute(LINE, '');
    line.style.fontFamily = MONO;
    line.textContent = id;
    control.insertAdjacentElement('afterend', line);
  }

  function apply() {
    const path = location.pathname;
    if (!ROUTE.test(path)) return;

    if (known.path !== path) {
      known = { path, ids: indexRules(readProps(document, path) || {}) };
      unknownNames = '';
    }

    const unknown = [];
    for (const handle of document.querySelectorAll(HANDLE)) {
      const name = printId(handle, known.ids);
      if (name) unknown.push(name);
    }

    for (const dialog of document.querySelectorAll(DIALOG)) labelEditor(dialog, known.ids);

    // A rule the payload does not name means the wrong payload: the one left in
    // the page by an Inertia navigation, or one from before you added a rule.
    // Ask the server for the current one, once per set of unknown names.
    const signature = unknown.join('\n');
    if (signature && signature !== unknownNames) {
      unknownNames = signature;
      refresh(path);
    }
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

  schedule();
})();
