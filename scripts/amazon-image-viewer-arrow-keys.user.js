// ==UserScript==
// @name         Amazon: Image Viewer Arrow Keys
// @namespace    https://github.com/fgilio
// @version      1.1.0
// @description  Left and Right arrows step through images in the full-size product image viewer and in the customer review photo galleries.
// @author       Franco Gilio
// @match        https://www.amazon.es/*dp/*
// @match        https://www.amazon.es/gp/product/*
// @match        https://www.amazon.es/*product-reviews/*
// @match        https://www.amazon.com/*dp/*
// @match        https://www.amazon.com/gp/product/*
// @match        https://www.amazon.com/*product-reviews/*
// @match        https://www.amazon.co.uk/*dp/*
// @match        https://www.amazon.co.uk/gp/product/*
// @match        https://www.amazon.co.uk/*product-reviews/*
// @match        https://www.amazon.de/*dp/*
// @match        https://www.amazon.de/gp/product/*
// @match        https://www.amazon.de/*product-reviews/*
// @match        https://www.amazon.fr/*dp/*
// @match        https://www.amazon.fr/gp/product/*
// @match        https://www.amazon.fr/*product-reviews/*
// @match        https://www.amazon.it/*dp/*
// @match        https://www.amazon.it/gp/product/*
// @match        https://www.amazon.it/*product-reviews/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=amazon.com
// @updateURL    https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/amazon-image-viewer-arrow-keys.user.js
// @downloadURL  https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/amazon-image-viewer-arrow-keys.user.js
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[amazon-image-viewer-arrow-keys]';

  const SEL = {
    viewer: '#ivMain',
    thumbs: '#ivThumbs .ivThumb[id^="ivImage_"]',
    selectedThumb: '.selected',
  };

  // Both kinds keep their buttons in the DOM and hide the one with nowhere to go.
  const REVIEW_GALLERIES = [
    // "Fotos y videos de clientes" on product pages. Class names carry a build hash, so match their stable part.
    {
      root: '[class*="media-popover-media-container"]',
      previous: '[class*="left-icon-container"]',
      next: '[class*="right-icon-container"]',
    },
    // The photos of a single review on the reviews page.
    {
      root: '.cr-lightbox-image-viewer',
      previous: '.cr-lightbox-navigator-button__back',
      next: '.cr-lightbox-navigator-button__next',
    },
  ];

  const STEP_BY_KEY = { ArrowLeft: -1, ArrowRight: 1 };

  const warnedSelectors = new Set();

  function warnOnce(selector) {
    if (warnedSelectors.has(selector)) return;
    warnedSelectors.add(selector);
    console.warn(`${TAG} a viewer is open but "${selector}" matched nothing. Amazon markup changed. Update the selectors in this script.`);
  }

  function isTypingTarget(target) {
    return target instanceof Element
      && (target.isContentEditable || target.closest('input, textarea, select, .vjs-control-bar'));
  }

  /** Viewers stay in the DOM once opened, so only a rendered one counts as open. */
  function isRendered(element) {
    return element.offsetParent !== null;
  }

  function wrappedIndex(current, step, count) {
    return (current + step + count) % count;
  }

  function thumbToStepTo(step) {
    const viewer = document.querySelector(SEL.viewer);
    if (!viewer || !isRendered(viewer)) return null;

    const thumbs = [...document.querySelectorAll(SEL.thumbs)];
    const current = thumbs.findIndex(thumb => thumb.matches(SEL.selectedThumb));
    if (current === -1) {
      warnOnce(`${SEL.thumbs}${SEL.selectedThumb}`);
      return null;
    }
    if (thumbs.length < 2) return null;

    return thumbs[wrappedIndex(current, step, thumbs.length)];
  }

  function reviewGalleryButtonToStepTo(step) {
    for (const gallery of REVIEW_GALLERIES) {
      const root = [...document.querySelectorAll(gallery.root)].find(isRendered);
      if (!root) continue;

      const selector = step < 0 ? gallery.previous : gallery.next;
      const button = root.querySelector(selector);
      if (!button) warnOnce(selector);
      return button && isRendered(button) ? button : null;
    }
    return null;
  }

  function handleKeyDown(event) {
    const step = STEP_BY_KEY[event.key];
    if (!step) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isTypingTarget(event.target)) return;

    const control = thumbToStepTo(step) || reviewGalleryButtonToStepTo(step);
    if (!control) return;

    event.preventDefault();
    event.stopPropagation();
    control.click();
  }

  // Capture phase, so the popover's own key handling cannot swallow the arrows first.
  window.addEventListener('keydown', handleKeyDown, true);
})();
