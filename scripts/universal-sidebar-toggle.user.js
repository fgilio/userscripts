// ==UserScript==
// @name         Universal Sidebar Toggle with Hyper Key
// @namespace    http://tampermonkey.net/
// @version      3.7.1
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

    // check-ignore: icon — spans 10 sites, no single favicon represents it.

    // ============================================================================
    // FRAME CHECK
    // ============================================================================
    // Some sites (like Google Docs) have multiple iframes. Only run in top frame
    // to avoid duplicate handlers and ensure we're in the right context.
    //
    const FRAME_CHECK = {
        'docs.google.com': true  // Only run in top frame for Google Docs
    };

    const currentHost = window.location.hostname;
    let needsFrameCheck = false;
    for (const host in FRAME_CHECK) {
        if (currentHost.includes(host)) {
            needsFrameCheck = FRAME_CHECK[host];
            break;
        }
    }

    if (needsFrameCheck && window !== window.top) {
        console.log('Universal Sidebar Toggle: Skipping iframe on', currentHost);
        return;
    }

    // ============================================================================
    // SITE CONFIGURATION
    // ============================================================================
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

        // Google Docs: Complex setup with Closure Library
        // - Two different elements for open/closed states
        // - Parent has pointer-events:none but children override
        // - Needs full mouse event sequence
        // - Aggressive keyboard capture requires capture phase listener
        'docs.google.com': {
            selectors: [
                '.navigation-widget-hat-close-floating-navigation-button',
                '.miniChapterSwitcherView'
            ],
            skipVisibilityCheck: true,
            useMouseEvents: true,
            useCapturePhase: true  // Use capture phase for keyboard events
        }
    };

    // ============================================================================
    // INITIALIZATION
    // ============================================================================
    let config = null;

    for (const host in SITE_CONFIG) {
        if (currentHost.includes(host)) {
            config = SITE_CONFIG[host];
            break;
        }
    }

    if (!config) {
        console.log('Universal Sidebar Toggle: No configuration for', currentHost);
        return;
    }

    // ============================================================================
    // VISIBILITY DETECTION
    // ============================================================================
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

    // ============================================================================
    // BUTTON DISCOVERY
    // ============================================================================
    function findToggleButton() {
        for (const selector of config.selectors) {
            const button = document.querySelector(selector);
            if (button) {
                if (config.skipVisibilityCheck) {
                    const rect = button.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        console.log('Found button (skipping full visibility check):', selector);
                        return button;
                    }
                    console.log('Checking selector:', selector, 'found:', true, 'has dimensions:', false);
                    continue;
                }

                const visible = isElementVisible(button);
                console.log('Checking selector:', selector, 'found:', true, 'visible:', visible);
                if (visible) return button;
            } else {
                console.log('Checking selector:', selector, 'found:', false);
            }
        }
        return null;
    }

    // ============================================================================
    // CLICK SIMULATION
    // ============================================================================
    function clickButton(button) {
        if (config.useMouseEvents) {
            // Full mouse event sequence for Closure Library / Google apps
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

    // ============================================================================
    // KEYBOARD SHORTCUT HANDLER
    // ============================================================================
    function handleKeyDown(event) {
        if (event.metaKey && event.shiftKey && event.ctrlKey && event.altKey && event.code === 'KeyS') {
            // Stop event immediately to prevent Google Docs from capturing it
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            console.log('Hyper+S detected, finding toggle button...');

            const toggleButton = findToggleButton();

            if (toggleButton) {
                console.log('Toggling sidebar');
                clickButton(toggleButton);
            } else {
                console.warn('Universal Sidebar Toggle: Button not found on', currentHost);
            }
        }
    }

    // Use capture phase for sites that aggressively capture keyboard events
    const useCapture = config.useCapturePhase || false;
    document.addEventListener('keydown', handleKeyDown, useCapture);

    console.log('Universal Sidebar Toggle: Active on', currentHost, useCapture ? '(capture phase)' : '');
})();