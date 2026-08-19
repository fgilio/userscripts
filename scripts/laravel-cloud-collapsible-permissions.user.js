// ==UserScript==
// @name         Laravel Cloud - Collapsible Permission Categories
// @namespace    https://cloud.laravel.com/
// @version      1.13.0
// @description  Collapsible permission categories + Select all / Clear with live count (amber at zero), plus a native-matching search box for the Resources list (flush to the list, with native focus ring), in the API token creation modal
// @author       Franco Gilio
// @icon         https://cloud.laravel.com/docs/_mintlify/favicons/cloud/CwnEEs8UQ8WD3Jou/_generated/favicon/apple-touch-icon.png
// @match        https://cloud.laravel.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const ARROW_ATTR = 'data-collapse-arrow';
  const TOOLBAR_ATTR = 'data-perm-toolbar';
  const RES_SEARCH_ATTR = 'data-res-search';

  // Native Laravel Cloud tokens (sampled directly from the modal)
  const MUTED = 'color(display-p3 0.379 0.392 0.421)';
  const DARK = 'color(display-p3 0.113 0.125 0.14)';
  const AMBER = '#b45309';
  const BORDER = 'color(display-p3 0.008 0.027 0.184 / 0.197)';
  const SEARCH_ICON = 'color(display-p3 0.004 0.031 0.176 / 0.275)';
  const PLACEHOLDER = 'color(display-p3 0.547 0.553 0.592)';
  const FONT = 'Inter,ui-sans-serif,system-ui,sans-serif';

  // Native focus-state tokens (sampled from the Permissions search box)
  const FOCUS_BORDER = 'color(display-p3 0 0.2431 0.8706 / 0.851)';
  const FOCUS_RING = 'color(display-p3 0.0078 0.4039 0.9451 / 0.138)';
  const FOCUS_BG = 'oklch(0.982 0.011 260.3)';

  const CHEVRON_SVG =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round" style="display:block;">' +
    '<polyline points="6 9 12 15 18 9"></polyline></svg>';

  // 20px / stroke-width 2, matching the native Permissions search icon
  const SEARCH_SVG =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" style="display:block;">' +
    '<circle cx="11" cy="11" r="8"></circle>' +
    '<line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

  function ensurePlaceholderStyle() {
    if (document.getElementById('res-search-ph-style')) return;
    const st = document.createElement('style');
    st.id = 'res-search-ph-style';
    st.textContent =
      '[' + RES_SEARCH_ATTR + '] input::placeholder{color:' + PLACEHOLDER + ';opacity:1;}';
    document.head.appendChild(st);
  }

  function looksLikeGroup(el) {
    if (!el || el.children.length !== 2) return false;
    const header = el.children[0];
    const body = el.children[1];
    const headerLabel = header.querySelector('label');
    if (!headerLabel) return false;
    if (!header.querySelector('input[type=checkbox], [role=checkbox]')) return false;
    const fw = parseInt(getComputedStyle(headerLabel).fontWeight, 10) || 400;
    if (fw < 500) return false;
    if (body.children.length < 1) return false;
    const firstRow = body.children[0];
    if (!firstRow.querySelector('input[type=checkbox], [role=checkbox]')) return false;
    return true;
  }

  function enhanceGroup(group) {
    const header = group.children[0];
    const body = group.children[1];
    if (header.querySelector('[' + ARROW_ATTR + ']')) return;
    const btn = document.createElement('span');
    btn.setAttribute(ARROW_ATTR, '1');
    btn.innerHTML = CHEVRON_SVG;
    btn.style.cssText =
      'margin-left:auto;display:inline-flex;align-items:center;' +
      'justify-content:center;width:28px;height:28px;border-radius:8px;' +
      'cursor:pointer;user-select:none;color:#6b7280;flex:none;' +
      'transition:background-color .15s ease, color .15s ease, transform .2s ease;' +
      'transform:rotate(0deg);';
    btn.addEventListener('mouseenter', function () {
      btn.style.backgroundColor = 'rgba(0,0,0,0.05)';
      btn.style.color = '#374151';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.backgroundColor = 'transparent';
      btn.style.color = '#6b7280';
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? '' : 'none';
      btn.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
    const hs = getComputedStyle(header);
    if (hs.display !== 'flex') header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.appendChild(btn);
  }

  function findListContainer() {
    const firstArrow = document.querySelector('[' + ARROW_ATTR + ']');
    if (!firstArrow) return null;
    return firstArrow.parentElement.parentElement.parentElement;
  }

  function countSelected(listContainer) {
    let total = 0, checked = 0;
    for (const g of [...listContainer.children]) {
      const body = g.children[1];
      if (!body) continue;
      body.querySelectorAll('[role=checkbox]').forEach(cb => {
        total++;
        if (cb.getAttribute('aria-checked') === 'true') checked++;
      });
    }
    return { total, checked };
  }

  // Laravel Cloud re-renders on every toggle, so leave a gap between clicks.
  async function setAll(listContainer, checked) {
    for (const g of [...listContainer.children]) {
      const cb = g.children[0] && g.children[0].querySelector('[role=checkbox]');
      if (!cb) continue;
      if ((cb.getAttribute('aria-checked') === 'true') !== checked) {
        cb.click();
        await new Promise(r => setTimeout(r, 60));
      }
    }
  }

  // Subtle inline text button, matching Laravel Cloud's ghost/secondary style.
  function makeTextBtn(label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      'font-family:' + FONT + ';font-size:13px;font-weight:500;' +
      'color:' + MUTED + ';background:transparent;border:none;' +
      'padding:4px 8px;border-radius:6px;cursor:pointer;' +
      'transition:background-color .15s ease,color .15s ease;';
    b.addEventListener('mouseenter', () => {
      b.style.backgroundColor = 'rgba(0,0,0,0.04)';
      b.style.color = DARK;
    });
    b.addEventListener('mouseleave', () => {
      b.style.backgroundColor = 'transparent';
      b.style.color = MUTED;
    });
    return b;
  }

  function ensureToolbar() {
    const listContainer = findListContainer();
    if (!listContainer) return;
    const parent = listContainer.parentElement;
    if (parent.querySelector('[' + TOOLBAR_ATTR + ']')) return;
    const bar = document.createElement('div');
    bar.setAttribute(TOOLBAR_ATTR, '1');
    bar.style.cssText = 'display:flex;align-items:center;gap:2px;margin:0 2px 10px;';
    const countLabel = document.createElement('span');
    countLabel.style.cssText =
      'font-family:' + FONT + ';font-size:13px;font-weight:400;' +
      'color:' + MUTED + ';margin-right:8px;';
    function refreshCount() {
      const { total, checked } = countSelected(listContainer);
      countLabel.textContent = checked + ' / ' + total + ' selected';
      countLabel.style.color = (checked === 0) ? AMBER : MUTED;
      countLabel.style.fontWeight = (checked === 0) ? '500' : '400';
    }
    const selectAll = makeTextBtn('Select all');
    selectAll.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      selectAll.disabled = true;
      await setAll(listContainer, true);
      selectAll.disabled = false;
      refreshCount();
    });
    const sep = document.createElement('span');
    sep.textContent = '·';
    sep.style.cssText = 'color:' + MUTED + ';font-size:13px;opacity:.5;';
    const clearAll = makeTextBtn('Clear');
    clearAll.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      clearAll.disabled = true;
      await setAll(listContainer, false);
      clearAll.disabled = false;
      refreshCount();
    });
    bar.appendChild(countLabel);
    bar.appendChild(selectAll);
    bar.appendChild(sep);
    bar.appendChild(clearAll);
    parent.insertBefore(bar, parent.firstChild);
    listContainer.addEventListener('click', () => setTimeout(refreshCount, 80), true);
    refreshCount();
  }

  function findResourceList() {
    const permList = findListContainer();
    const candidates = [];
    document.querySelectorAll('div').forEach(el => {
      const kids = [...el.children];
      if (kids.length < 5) return;
      const cbChildren = kids.filter(c =>
        c.querySelector('[role=checkbox], input[type=checkbox]')).length;
      if (cbChildren < 5) return;
      if (el === permList) return;
      // exclude the permissions list (its children carry collapse arrows)
      if (el.querySelector('[' + ARROW_ATTR + ']')) return;
      candidates.push(el);
    });
    if (!candidates.length) return null;
    // Prefer a scrollable container. Otherwise take the one with the most checkbox rows.
    let best = null, bestScore = -1;
    for (const c of candidates) {
      const oy = getComputedStyle(c).overflowY;
      const scrollable = (oy === 'auto' || oy === 'scroll') ? 1 : 0;
      const rows = [...c.children].filter(ch =>
        ch.querySelector('[role=checkbox], input[type=checkbox]')).length;
      const score = scrollable * 1000 + rows;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  function ensureResourceSearch() {
    const list = findResourceList();
    if (!list) return;
    // Vertical section stack: [ "Resources" label, description <p>, listWrapper ].
    let listWrapper = list;
    let column = listWrapper.parentElement;
    while (column && column.children.length === 1 && column.parentElement) {
      listWrapper = column;
      column = column.parentElement;
    }
    if (!column) return;
    if (column.querySelector('[' + RES_SEARCH_ATTR + ']')) return;
    ensurePlaceholderStyle();

    const box = document.createElement('div');
    box.setAttribute(RES_SEARCH_ATTR, '1');
    // Native Permissions search box: flex/center, 16px column-gap, 12px padding,
    // 0.75px border, top corners rounded 6px + bottom corners square, transparent
    // bg, no shadow, NO bottom margin, so it sits flush against the list below.
    box.style.cssText =
      'display:flex;align-items:center;column-gap:16px;' +
      'border:0.75px solid ' + BORDER + ';border-radius:6px 6px 0 0;' +
      'padding:12px;margin:0;background:transparent;box-shadow:none;' +
      'transition:box-shadow .15s ease,border-color .15s ease,background-color .15s ease;';

    const icon = document.createElement('div');
    icon.innerHTML = SEARCH_SVG;
    icon.style.cssText =
      'display:flex;align-items:center;flex:0 1 auto;color:' + SEARCH_ICON + ';';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search';
    input.style.cssText =
      'font-family:' + FONT + ';font-size:14px;font-weight:400;line-height:20px;' +
      'color:' + DARK + ';border:none;outline:none;background:transparent;' +
      'flex:1;padding:0;';

    // Native focus state: blue border + soft blue glow ring + faint bg tint.
    input.addEventListener('focus', () => {
      box.style.borderColor = FOCUS_BORDER;
      box.style.boxShadow = '0 0 0 3px ' + FOCUS_RING;
      box.style.backgroundColor = FOCUS_BG;
    });
    input.addEventListener('blur', () => {
      box.style.borderColor = BORDER;
      box.style.boxShadow = 'none';
      box.style.backgroundColor = 'transparent';
    });

    function filter() {
      const q = input.value.trim().toLowerCase();
      for (const g of [...list.children]) {
        const t = g.textContent.toLowerCase();
        g.style.display = (!q || t.includes(q)) ? '' : 'none';
      }
    }
    input.addEventListener('input', filter);
    input.addEventListener('click', e => e.stopPropagation());

    box.appendChild(icon);
    box.appendChild(input);
    column.insertBefore(box, listWrapper);

    // The list wrapper carries its own margin-top (12px), which would leave a
    // gap below the search box. Zero it so the box sits flush against the list.
    listWrapper.style.marginTop = '0px';
  }

  function scan() {
    document.querySelectorAll('div').forEach(el => {
      if (looksLikeGroup(el)) enhanceGroup(el);
    });
    ensureToolbar();
    ensureResourceSearch();
  }

  // setTimeout, not rAF. See CLAUDE.md "SPA navigation".
  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 50);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleScan();
})();