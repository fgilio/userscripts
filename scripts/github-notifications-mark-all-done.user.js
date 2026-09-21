// ==UserScript==
// @name         GitHub Notifications: Mark All As Done
// @namespace    https://github.com/fgilio
// @version      1.2.0
// @description  On the grouped notifications inbox, adds "Mark all N as done" beside a repo group's "Mark as done" when the group holds more notifications than it shows
// @author       Franco Gilio
// @match        https://github.com/*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @run-at       document-idle
// @noframes
// @downloadURL  https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-notifications-mark-all-done.user.js
// @updateURL    https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/github-notifications-mark-all-done.user.js
// @grant        none
// ==/UserScript==

// Why the native button falls short: a group's "Mark as done" form posts only the
// notification_ids[] of the rows it renders, so a group reading "View all 3" loses
// two and keeps the third.
//
// How this closes the gap: the "View all" page carries GitHub's own "select all
// matching" form, which posts `query=repo:owner/name` plus `mark_all=1` to the same
// archive endpoint and lets the server resolve the whole set. On click, this fetches
// that page, takes that exact form (token and query), and submits it natively. No
// id scraping, no pagination, and the page reloads just as it does after the native
// button.
//
// Scope: a filtered inbox (e.g. ?query=is:unread) keeps its filter in each group's
// "View all" link ("repo:owner/name is:unread") and in the select-all form there,
// verified 2026-09-21. The script still refuses to post when the link drops a term
// of the inbox's own query, so a GitHub change cannot widen the set silently.
//
// @match is all of github.com, not /notifications*, because a page reached by soft
// navigation never loads a script whose @match missed the page the tab started on.
// ROUTE keeps it idle everywhere else.

(function () {
  'use strict';

  const TAG = '[notifications-mark-all]';

  /** The inbox itself, with or without a filter query. Not /notifications/beta/... */
  const ROUTE = /^\/notifications\/?$/;

  const SEL = {
    group: '.js-notifications-group',
    doneForm: 'form.js-grouped-notifications-mark-all-read-button',
    ours: 'form[data-fg-mark-all]',
  };

  const VIEW_ALL = /View all (\d+) notifications?/;
  const ARCHIVE = /\/notifications\/beta\/archive$/;

  /** How long the first click keeps the button armed for the confirming second one. */
  const ARM_MS = 4000;

  const warned = new Set();
  function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`${TAG} ${message}`);
  }

  function viewAllLink(group) {
    return [...group.querySelectorAll('a[href]')].find(a => VIEW_ALL.test(a.textContent)) || null;
  }

  /** The query the "View all" link filters by, e.g. "repo:owner/name". */
  function queryOf(link) {
    return (new URL(link.getAttribute('href'), location.href).searchParams.get('query') || '').trim();
  }

  /** Whitespace-separated terms, so "is:unread repo:x" and "repo:x is:unread" compare equal. */
  function terms(query) {
    return (query || '').trim().split(/\s+/).filter(Boolean);
  }

  /** Every filter of the inbox on screen must survive into the group's query. */
  function keepsInboxFilter(linkQuery) {
    const kept = new Set(terms(linkQuery));
    return terms(new URL(location.href).searchParams.get('query')).every(term => kept.has(term));
  }

  /** Swaps the button's label text, leaving the check icon beside it alone. */
  function setLabel(button, text) {
    const node = [...button.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim());
    if (node) node.textContent = ` ${text}`;
    else button.append(` ${text}`);
  }

  /**
   * GitHub's "mark all matching" form on the fetched page. It must name the same
   * query the group links to, so a changed page can never mark a wider set than
   * the group this button sits in.
   */
  function findMarkAllForm(doc, query) {
    for (const form of doc.querySelectorAll('form')) {
      if (!ARCHIVE.test(form.getAttribute('action') || '')) continue;
      if ((form.getAttribute('method') || '').toLowerCase() !== 'post') continue;
      if (form.querySelector('input[name="mark_all"]')?.value !== '1') continue;
      if (!form.querySelector('input[name="authenticity_token"]')?.value) continue;
      if ((form.querySelector('input[name="query"]')?.value || '').trim() !== query) continue;
      return form;
    }
    return null;
  }

  async function markAll(form, button, link) {
    if (button.disabled) return;
    button.disabled = true;
    setLabel(button, 'Marking…');

    try {
      const query = queryOf(link);
      if (!query) throw new Error('the "View all" link carries no query');
      if (!keepsInboxFilter(query)) throw new Error(`the "View all" query "${query}" drops a filter of this inbox`);

      const response = await fetch(link.href, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`the "View all" page answered ${response.status}`);

      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const source = findMarkAllForm(doc, query);
      if (!source) throw new Error(`no archive form with mark_all=1 and query "${query}" on the "View all" page`);

      // Post exactly the fields findMarkAllForm() checked, built here rather than
      // copied, so a field it validated can never be left out of the request.
      form.setAttribute('action', source.getAttribute('action'));
      const fields = {
        authenticity_token: source.querySelector('input[name="authenticity_token"]').value,
        query,
        mark_all: '1',
      };
      for (const [name, value] of Object.entries(fields)) {
        const field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        field.value = value;
        form.append(field);
      }
      // HTMLFormElement.submit() skips the submit event, so this cannot loop.
      form.submit();
    } catch (error) {
      // Fail visible: land on the full list, where GitHub's own select-all still works.
      console.warn(`${TAG} ${error.message}. Opening the full list instead.`);
      location.assign(link.href);
    }
  }

  function buildForm(native, link, count) {
    const form = document.createElement('form');
    form.method = 'post';
    form.setAttribute('action', native.getAttribute('action'));
    form.className = 'd-none d-md-block ml-2';
    form.dataset.turbo = 'false';
    form.dataset.fgMarkAll = '1';

    const button = native.querySelector('button').cloneNode(true);
    button.type = 'submit';
    button.title = `Marks all ${count} notifications in this group as done, including the ones not shown`;
    setLabel(button, `Mark all ${count} as done`);
    form.append(button);

    // Two clicks: the first arms the button (red, "Click again"), the second marks.
    // A stray click on a button that marks more than it shows then costs nothing,
    // and the arm lapses on its own. No confirm(), per CLAUDE.md golden rule 4.
    let armed = null;
    const disarm = () => {
      clearTimeout(armed);
      armed = null;
      button.classList.remove('btn-danger');
      setLabel(button, `Mark all ${count} as done`);
    };

    form.addEventListener('submit', event => {
      event.preventDefault();
      if (button.disabled) return;
      if (!armed) {
        button.classList.add('btn-danger');
        setLabel(button, `Click again to mark ${count}`);
        armed = setTimeout(disarm, ARM_MS);
        return;
      }
      clearTimeout(armed);
      markAll(form, button, link);
    });
    return form;
  }

  function apply() {
    if (!ROUTE.test(location.pathname)) return;

    // An empty inbox, or the flat (ungrouped) list, renders no groups: stay silent.
    for (const group of document.querySelectorAll(SEL.group)) {
      if (group.querySelector(SEL.ours)) continue;

      // No "View all" means every notification is on screen and the native button covers it.
      const link = viewAllLink(group);
      if (!link) continue;

      const native = group.querySelector(SEL.doneForm);
      if (!native?.querySelector('button')) {
        warnOnce('form', `group "Mark as done" form not found (selector "${SEL.doneForm}"). Site markup changed. Update the selector in this script.`);
        continue;
      }

      const count = Number(link.textContent.match(VIEW_ALL)[1]);
      native.after(buildForm(native, link, count));
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
