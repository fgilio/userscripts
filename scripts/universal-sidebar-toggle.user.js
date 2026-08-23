// ==UserScript==
// @name         Universal Sidebar Toggle with Hyper Key
// @namespace    http://tampermonkey.net/
// @version      4.0.0
// @description  Toggle sidebar on multiple sites with macOS hyper key (Cmd+Shift+Ctrl+Option+S)
// @author       Franco Gilio
// @match        https://gitlab.com/*
// @run-at       document-idle
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://claude.ai/*
// @match        https://calendar.google.com/*
// @match        https://mail.google.com/*
// @match        https://gemini.google.com/*
// @match        https://portal.singlestore.com/*
// @match        https://dash.cloudflare.com/*
// @match        https://docs.google.com/*
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/universal-sidebar-toggle.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/universal-sidebar-toggle.user.js
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // check-ignore: icon spans 10 sites, no single favicon represents it.
  // check-ignore: noframes the chord must work while focus is inside an iframe.
  // Key events do not cross document boundaries, so a subframe cannot simply run
  // the toggle: it forwards the chord to the top frame, which owns the sidebar.
  // Exactly one frame acts, so the toggle never fires twice.

  const TAG = '[sidebar-toggle]';
  const currentHost = location.hostname;
  const BRIDGE_MESSAGE = 'fg-sidebar-toggle-request';
  const isSubframe = window !== window.top;

  const SITE_CONFIG = {
    'gitlab.com': {
      selectors: ['[data-testid="super-sidebar-collapse-button"]']
    },

    'chatgpt.com': {
      selectors: [
        '[data-testid="close-sidebar-button"]',
        '[aria-label="Open sidebar"]'
      ],
      usePointerEvents: true
    },

    'chat.openai.com': {
      selectors: [
        '[data-testid="close-sidebar-button"]',
        '[aria-label="Open sidebar"]'
      ],
      usePointerEvents: true
    },

    'claude.ai': {
      selectors: [
        '[data-testid="pin-sidebar-toggle"]',
        'button[aria-label="Collapse sidebar"]',
        'button[aria-label="Open sidebar"]'
      ]
    },

    'calendar.google.com': {
      selectors: ['[aria-label="Main drawer"]']
    },

    'mail.google.com': {
      selectors: ['[aria-label="Main menu"]']
    },

    'gemini.google.com': {
      selectors: [
        '[data-test-id="side-nav-menu-button"]',
        'button[aria-label="Main menu"]',
        '.main-menu-button'
      ],
      skipVisibilityCheck: true
    },

    'portal.singlestore.com': {
      selectors: [
        'button.navigation-sidebar__collapse-button',
        '[aria-label="Collapse sidebar"]',
        '[aria-label="Expand sidebar"]'
      ]
    },

    'dash.cloudflare.com': {
      selectors: ['[data-testid="classic-sidebar-nav-trigger"]']
    },

    // Closure Library: separate elements for open and closed, a parent with
    // pointer-events:none that children override, and aggressive key capture.
    'docs.google.com': {
      selectors: [
        '.navigation-widget-hat-close-floating-navigation-button',
        '.miniChapterSwitcherView'
      ],
      skipVisibilityCheck: true,
      useMouseEvents: true,
      useCapturePhase: true
    }
  };

  const config = SITE_CONFIG[currentHost];
  if (!config) return;

  function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    let el = element;
    while (el) {
      const elStyle = window.getComputedStyle(el);
      if (elStyle.pointerEvents === 'none') return false;
      if (el === document.body) break;
      el = el.parentElement;
    }

    return true;
  }

  function findToggleButton() {
    for (const selector of config.selectors) {
      const button = document.querySelector(selector);
      if (!button) continue;
      if (config.skipVisibilityCheck) {
        const rect = button.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return button;
        continue;
      }
      if (isElementVisible(button)) return button;
    }
    return null;
  }

  function clickButton(button) {
    if (config.useMouseEvents) {
      // Closure Library ignores a bare click().
      const events = ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'];
      events.forEach(type => {
        const event = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window
        });
        button.dispatchEvent(event);
      });

    } else if (config.usePointerEvents) {
      button.focus();

      const pointerDown = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: 'mouse'
      });

      const pointerUp = new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: 'mouse'
      });

      button.dispatchEvent(pointerDown);

      setTimeout(() => {
        button.dispatchEvent(pointerUp);
        button.click();
      }, 10);
    } else {
      button.click();
    }
  }

  function toggleSidebar() {
    const toggleButton = findToggleButton();
    if (!toggleButton) {
      console.warn(`${TAG} No sidebar toggle on ${currentHost}. Tried: ${config.selectors.join(', ')}`);
      return;
    }
    clickButton(toggleButton);
  }

  function handleKeyDown(event) {
    if (!(event.metaKey && event.shiftKey && event.ctrlKey && event.altKey && event.code === 'KeyS')) return;

    // Google Docs claims this chord on the document, so stop it here.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (isSubframe) {
      // '*' as the target origin: a frame cannot read the top origin when the two
      // differ, and the only thing this message can ask for is a sidebar toggle.
      window.top.postMessage({ type: BRIDGE_MESSAGE }, '*');
      return;
    }
    toggleSidebar();
  }

  document.addEventListener('keydown', handleKeyDown, config.useCapturePhase);

  // Only the top frame owns a sidebar, so only it listens. Any page could post
  // this message; the worst it can do is collapse a sidebar the user can reopen.
  if (!isSubframe) {
    window.addEventListener('message', event => {
      if (event.data && event.data.type === BRIDGE_MESSAGE) toggleSidebar();
    });
  }
})();