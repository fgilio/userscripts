// ==UserScript==
// @name         Universal Sidebar Toggle with Hyper Key
// @namespace    http://tampermonkey.net/
// @version      3.8.0
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
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // check-ignore: icon spans 10 sites, no single favicon represents it.

  const TAG = '[sidebar-toggle]';
  const currentHost = location.hostname;

  // Google Docs renders the sidebar inside several iframes, so one handler per
  // frame would fire the toggle once per frame.
  if (currentHost === 'docs.google.com' && window !== window.top) return;

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

  function handleKeyDown(event) {
    if (!(event.metaKey && event.shiftKey && event.ctrlKey && event.altKey && event.code === 'KeyS')) return;

    // Google Docs claims this chord on the document, so stop it here.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const toggleButton = findToggleButton();
    if (!toggleButton) {
      console.warn(`${TAG} No sidebar toggle on ${currentHost}. Tried: ${config.selectors.join(', ')}`);
      return;
    }
    clickButton(toggleButton);
  }

  document.addEventListener('keydown', handleKeyDown, config.useCapturePhase);
})();