// ==UserScript==
// @name         Laravel Cloud ↔ Nightwatch Linker
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Native-looking links between Laravel Cloud environments and Nightwatch dashboards
// @author       Franco Gilio
// @match        https://cloud.laravel.com/*
// @match        https://nightwatch.laravel.com/*
// @icon         https://cloud.laravel.com/docs/_mintlify/favicons/cloud/CwnEEs8UQ8WD3Jou/_generated/favicon/apple-touch-icon.png
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-nightwatch-linker.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-nightwatch-linker.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  // check-ignore: prompt one-time pairing UI, fires only when a mapping is missing.
  // Replace with an inline input if this script is ever driven by browser automation.

  var TAG = '[cloud-nightwatch]';
  var STORAGE_KEY = 'laravel-cloud-nightwatch-mappings';

  // Entry: { uuid, region, cloudPath }, keyed 'org:app:env'.
  // Two legacy shapes migrate on read: a bare string value, and the old
  // 'app:env' key, which collided whenever two orgs reused an app and
  // environment name and could then open the wrong org's environment.
  function getMappings() {
    var raw;
    try { raw = JSON.parse(GM_getValue(STORAGE_KEY, '{}')); }
    catch (e) { raw = {}; }
    if (!raw || typeof raw !== 'object') raw = {};

    // Normalize any legacy string entries -> objects.
    var changed = false;
    Object.keys(raw).forEach(function (k) {
      if (typeof raw[k] === 'string') {
        raw[k] = { uuid: raw[k], region: 'us' };
        changed = true;
      } else if (raw[k] && typeof raw[k] === 'object' && !raw[k].region) {
        raw[k].region = 'us';
      }
    });

    // Re-key legacy 'app:env' entries to 'org:app:env'. cloudPath already carries
    // the org, so anything that has been visited on Cloud migrates losslessly.
    Object.keys(raw).forEach(function (k) {
      if (k.split(':').length !== 2) return;
      var path = raw[k] && raw[k].cloudPath;
      var seg = path ? path.split('/') : [];
      if (seg.length !== 3) return;
      var upgraded = generateKey(seg[0], seg[1], seg[2]);
      if (!raw[upgraded]) raw[upgraded] = raw[k];
      delete raw[k];
      changed = true;
    });

    if (changed) { try { GM_setValue(STORAGE_KEY, JSON.stringify(raw)); } catch (e) {} }
    return raw;
  }
  function saveMappings(m) { GM_setValue(STORAGE_KEY, JSON.stringify(m)); }

  // Fully qualified by org. Cloud always knows its org, so nothing here can
  // collide; Nightwatch does not, which is why it looks up by UUID instead.
  function generateKey(org, app, env) {
    return org.toLowerCase() + ':' + app.toLowerCase() + ':' + env.toLowerCase();
  }
  function legacyKey(app, env) { return app.toLowerCase() + ':' + env.toLowerCase(); }

  // Cloud is the only side that knows the org, so it is the only side that can move
  // a legacy 'app:env' entry under its org-qualified key. Both Cloud entry points
  // route through here: when only one of them adopted, the other would overwrite
  // the org key with a bare entry and strand the uuid the legacy key was holding.
  function adoptForCloud(mappings, info) {
    var key = generateKey(info.org, info.app, info.env);
    var entry = getEntry(mappings, key);
    if (!entry) {
      var legacy = legacyKey(info.app, info.env);
      var stale = getEntry(mappings, legacy);
      if (stale) {
        entry = stale;
        delete mappings[legacy];
      }
    }
    return { key: key, entry: entry || {}, isNew: !mappings[key] };
  }

  // A Nightwatch environment UUID is globally unique, so this is the one lookup
  // that is always unambiguous. Returns the key, or null.
  function findKeyByUuid(mappings, uuid) {
    var keys = Object.keys(mappings);
    for (var i = 0; i < keys.length; i++) {
      var e = getEntry(mappings, keys[i]);
      if (e && e.uuid === uuid) return keys[i];
    }
    return null;
  }

  function getEntry(mappings, key) {
    var e = mappings[key];
    if (typeof e === 'string') return { uuid: e, region: 'us' };
    return e || null;
  }

  function parseCloudUrl() {
    var parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length >= 3) return { org: parts[0], app: parts[1], env: parts[2] };
    return null;
  }
  function parseNightwatchUrl() {
    var path = window.location.pathname;
    var marker = '/environments/';
    var idx = path.indexOf(marker);
    if (idx === -1) return null;
    var rest = path.substring(idx + marker.length);
    var slash = rest.indexOf('/');
    var uuid = slash !== -1 ? rest.substring(0, slash) : rest;
    var before = path.substring(0, idx).split('/').filter(Boolean);
    var region = before.length ? before[before.length - 1] : 'us';
    return uuid.length > 10 ? { envUuid: uuid, region: region } : null;
  }
  function getNightwatchAppEnv() {
    var combobox = document.querySelector('aside button[role="combobox"]') ||
                   document.querySelector('aside button[type="button"]');
    if (!combobox) return null;
    var spans = combobox.querySelectorAll('span');
    if (spans.length >= 2) {
      return { app: spans[0].textContent.trim(), env: spans[1].textContent.trim() };
    }
    var txt = combobox.textContent.trim().split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (txt.length >= 2) return { app: txt[0], env: txt[1] };
    return null;
  }

  // Official Nightwatch favicon (rose badge + white monogram), inlined for offline use.
  function nightwatchIconDataUri() {
    var svg =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="24" height="24" rx="6" fill="oklch(58.6% 0.253 17.585)"/>' +
      '<rect width="24" height="24" rx="6" stroke="rgba(255,255,255,0.5)" stroke-width="1" fill="none"/>' +
      '<g clip-path="url(#nwclip)">' +
      '<path fill-rule="evenodd" clip-rule="evenodd" d="M5 16.8438C5 16.93 5.06996 17 5.15625 17H8.0417' +
      'C8.3364 17 8.61395 16.8614 8.79105 16.6259L12.1251 12.1911C12.1876 12.1079 12.3124 12.1079 12.3749 12.1911' +
      'L15.709 16.6259C15.886 16.8614 16.1636 17 16.4583 17H19.3438C19.43 17 19.5 16.93 19.5 16.8438V12V7.15625' +
      'C19.5 7.06996 19.43 7 19.3438 7H16.4583C16.1636 7 15.886 7.13858 15.709 7.37414L12.3749 11.8089' +
      'C12.3124 11.8921 12.1876 11.8921 12.1251 11.8089L8.79105 7.37414C8.61395 7.13858 8.3364 7 8.04169 7' +
      'H5.15625C5.06996 7 5 7.06996 5 7.15625V12V16.8438Z" fill="#ffffff"/></g>' +
      '<defs><clipPath id="nwclip"><rect x="5" y="7" width="14" height="10" rx="1" fill="white"/></clipPath></defs>' +
      '</svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  function cloudIconSvg(color) {
    color = color || 'currentColor';
    return '<svg viewBox="0 0 98 98" width="16" height="16" fill="' + color + '" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path fill-rule="evenodd" clip-rule="evenodd" d="M97.466 64.97 64.98 97.457H0v-64.97' +
      'L32.485 0h64.98v64.98-.01Zm-64.98-45.477v6.501h38.986v38.987h6.5V19.493H32.486Zm0-6.5h51.978' +
      'V64.97h6.5V6.49H32.486v6.501Zm0 19.492v32.486H64.97V32.485H32.485Z"/></svg>';
  }

  function findVisitButton() {
    var anchors = document.querySelectorAll('a');
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i].textContent.trim() === 'Visit') return anchors[i];
    }
    return null;
  }

function buildCloudButton(label, href, onClick) {
    var template = findVisitButton();
    var el;
    if (template) {
      el = template.cloneNode(true);

      var oldSvg = el.querySelector('svg');
      var img = document.createElement('img');
      img.src = nightwatchIconDataUri();
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      if (oldSvg) {
        // keep the design-system size classes (e.g. size-5) so layout is identical
        img.setAttribute('class', oldSvg.getAttribute('class') || '');
        img.classList.add('rounded-[4px]'); // match the badge's rounded corners at small size
        oldSvg.parentNode.replaceChild(img, oldSvg);
      } else {
        img.style.cssText = 'width:16px;height:16px;border-radius:4px;';
        el.insertBefore(img, el.firstChild);
      }

      for (var n = 0; n < el.childNodes.length; n++) {
        if (el.childNodes[n].nodeType === 3 && el.childNodes[n].textContent.trim()) {
          el.childNodes[n].textContent = label;
          break;
        }
      }
      el.removeAttribute('data-headlessui-state');
    } else {
      el = document.createElement('a');
      el.className =
        'shrink-0 gap-x-1.5 relative isolate inline-flex items-center justify-center rounded-md ' +
        'border border-transparent font-medium whitespace-nowrap min-h-8 px-4 text-sm text-strong ' +
        'bg-(--btn-border) before:absolute before:inset-0 before:-z-10 before:rounded-md ' +
        'before:bg-(--btn-bg) before:shadow-xs [--btn-bg:var(--background-color-default)] ' +
        '[--btn-border:var(--border-color-default)]';
      var fImg = document.createElement('img');
      fImg.src = nightwatchIconDataUri();
      fImg.alt = '';
      fImg.style.cssText = 'width:16px;height:16px;border-radius:4px;margin-right:6px;';
      el.appendChild(fImg);
      el.appendChild(document.createTextNode(label));
    }

    el.id = 'fg-nightwatch-link';
    el.href = href || '#';
    el.target = href && href !== '#' ? '_blank' : '';
    el.rel = 'noopener';
    el.title = 'Open in Nightwatch';
    if (onClick) el.addEventListener('click', onClick);
    return el;
  }

  function addCloudLink() {
    var info = parseCloudUrl();
    if (!info || !info.app || !info.env) return;

    var skip = ['settings', 'deployments', 'commands', 'logs', 'metrics', 'queues'];
    if (skip.indexOf(info.env) !== -1) return;
    if (document.getElementById('fg-nightwatch-link')) return;

    var mappings = getMappings();
    var found = adoptForCloud(mappings, info);
    var key = found.key;
    var entry = found.entry;

    // Persist an adoption that recordCloudPath did not already write, so a legacy
    // entry cannot be read here and then lost on the next page.
    if (found.isNew && entry.uuid) {
      entry.cloudPath = info.org + '/' + info.app + '/' + info.env;
      mappings[key] = entry;
      saveMappings(mappings);
    }

    var uuid = entry.uuid;
    var region = entry.region || 'us';

    var visitBtn = findVisitButton();
    var container = visitBtn && visitBtn.parentElement;
    if (!container) return;

    var link;
    if (uuid) {
      var href = 'https://nightwatch.laravel.com/' + region + '/environments/' + uuid + '/dashboard';
      link = buildCloudButton('Nightwatch', href, null);
    } else {
      link = buildCloudButton('Link Nightwatch', '#', function (e) {
        e.preventDefault();
        var u = prompt('Paste the Nightwatch environment URL (or just the UUID):');
        if (!u) return;
        var m = u.match(/environments\/([0-9a-f-]{20,})/i);
        var val = m ? m[1] : u.trim();
        if (val.length > 10) {
          var mm = getMappings();
          var rMatch = u.match(/nightwatch\.laravel\.com\/([a-z]{2,})\/environments/i);
          var existing = getEntry(mm, key) || {};
          existing.uuid = val;
          existing.region = rMatch ? rMatch[1] : 'us';
          // also record the current cloud path so the reverse link works in any org
          existing.cloudPath = info.org + '/' + info.app + '/' + info.env;
          mm[key] = existing;
          saveMappings(mm);
          location.reload();
        }
      });
    }
    container.insertBefore(link, visitBtn);
  }

  function buildNightwatchButton(label, href, onClick) {
    var a = document.createElement('a');
    a.id = 'fg-cloud-link';
    a.href = href || '#';
    a.target = href && href !== '#' ? '_blank' : '';
    a.rel = 'noopener';
    a.title = 'Open in Laravel Cloud';
    a.className =
      'group/parent relative flex h-9 w-full cursor-pointer items-center gap-3 rounded-md ' +
      'border border-transparent px-2 pr-0.5 text-sm text-neutral-500 dark:text-neutral-400 ' +
      'hover:text-neutral-900 dark:hover:text-white';

    var icon = document.createElement('div');
    icon.className = 'flex aspect-square size-4 items-center justify-center';
    icon.innerHTML = cloudIconSvg('#f97316');

    var text = document.createElement('div');
    text.className = 'grow';
    text.textContent = label;

    var tail = document.createElement('div');
    tail.className = 'flex items-center gap-1';

    a.appendChild(icon);
    a.appendChild(text);
    a.appendChild(tail);
    if (onClick) a.addEventListener('click', onClick);
    return a;
  }

  function addNightwatchLink() {
    var nw = parseNightwatchUrl();
    // The sidebar combobox is the anchor this link sits beside, so its presence
    // doubles as the readiness signal that the aside has finished rendering.
    if (!nw || !getNightwatchAppEnv()) return;

    // The UUID in this URL is globally unique. Matching on it is the only lookup
    // that cannot resolve to another org's environment; app and env names can be
    // reused freely across orgs, and this page never learns which org it is in.
    var mappings = getMappings();
    var key = findKeyByUuid(mappings, nw.envUuid);
    var existing = (key && getEntry(mappings, key)) || {};

    if (key && existing.region !== nw.region) {
      existing.region = nw.region;
      mappings[key] = existing;
      saveMappings(mappings);
    }
    if (!key) {
      console.warn(TAG, 'no Cloud environment paired with this Nightwatch UUID yet');
    }

    if (document.getElementById('fg-cloud-link')) return;

    var aside = document.querySelector('aside');
    if (!aside) return;
    var firstNavLink = aside.querySelector('a[href*="/dashboard"]') || aside.querySelector('a');
    var navList = firstNavLink ? firstNavLink.parentElement : null;

    var link;
    if (existing.cloudPath) {
      link = buildNightwatchButton('Laravel Cloud',
        'https://cloud.laravel.com/' + existing.cloudPath, null);
    } else {
      link = buildNightwatchButton('Link Laravel Cloud', '#', function (e) {
        e.preventDefault();
        var u = prompt('Paste the Laravel Cloud environment URL (any org):');
        if (!u) return;
        var m = u.match(/cloud\.laravel\.com\/([^\/\s]+\/[^\/\s]+\/[^\/\s?#]+)/i);
        var path = m ? m[1] : null;
        if (!path && /^[^\/\s]+\/[^\/\s]+\/[^\/\s]+$/.test(u.trim())) path = u.trim();
        if (path) {
          // The pasted path is 'org/app/env', which is exactly the org-qualified
          // key this entry belongs under.
          var seg = path.split('/');
          var mm = getMappings();
          var newKey = generateKey(seg[0], seg[1], seg[2]);
          var ex = getEntry(mm, newKey) || {};
          ex.cloudPath = path;
          ex.uuid = nw.envUuid;
          ex.region = nw.region;
          mm[newKey] = ex;
          saveMappings(mm);
          location.reload();
        }
      });
    }

    if (navList) {
      navList.appendChild(link);
    } else {
      var combo = aside.querySelector('button[role="combobox"]') ||
                  aside.querySelector('button[type="button"]');
      if (combo && combo.parentElement) combo.parentElement.insertBefore(link, combo.nextSibling);
    }
  }

  function recordCloudPath() {
    var info = parseCloudUrl();
    if (!info) return;
    var m = getMappings();
    var found = adoptForCloud(m, info);
    var path = info.org + '/' + info.app + '/' + info.env;
    // found.isNew also covers an adoption, where the entry already carries the
    // right cloudPath but is not yet stored under its org-qualified key.
    if (found.isNew || found.entry.cloudPath !== path) {
      found.entry.cloudPath = path;
      m[found.key] = found.entry;
      saveMappings(m);
    }
  }

  function apply() {
    var host = window.location.hostname;
    try {
      if (host === 'cloud.laravel.com') {
        try { recordCloudPath(); } catch (e) { /* ignore */ }
        addCloudLink();
      } else if (host === 'nightwatch.laravel.com') {
        addNightwatchLink();
      }
    } catch (e) {
      console.warn(TAG, e);
    }
  }

  // setTimeout, not rAF. See CLAUDE.md "SPA navigation".
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; apply(); }, 50);
  }

  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true });
  window.addEventListener('popstate', schedule);
  schedule();
})();