// ==UserScript==
// @name         Amazon: Image Viewer Arrow Keys
// @namespace    https://github.com/fgilio
// @version      1.0.0
// @description  In the full-size product image viewer, Left and Right arrows step to the previous and next image, wrapping at both ends.
// @author       Franco Gilio
// @match        https://www.amazon.es/*dp/*
// @match        https://www.amazon.es/gp/product/*
// @match        https://www.amazon.com/*dp/*
// @match        https://www.amazon.com/gp/product/*
// @match        https://www.amazon.co.uk/*dp/*
// @match        https://www.amazon.co.uk/gp/product/*
// @match        https://www.amazon.de/*dp/*
// @match        https://www.amazon.de/gp/product/*
// @match        https://www.amazon.fr/*dp/*
// @match        https://www.amazon.fr/gp/product/*
// @match        https://www.amazon.it/*dp/*
// @match        https://www.amazon.it/gp/product/*
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

  const STEP_BY_KEY = { ArrowLeft: -1, ArrowRight: 1 };

  let warned = false;

  function isTypingTarget(target) {
    return target instanceof Element
      && (target.isContentEditable || target.closest('input, textarea, select, .vjs-control-bar'));
  }

  /** The viewer stays in the DOM once opened, so only a rendered one counts as open. */
  function openImageViewer() {
    const viewer = document.querySelector(SEL.viewer);
    return viewer && viewer.offsetParent !== null ? viewer : null;
  }

  function wrappedIndex(current, step, count) {
    return (current + step + count) % count;
  }

  function handleKeyDown(event) {
    const step = STEP_BY_KEY[event.key];
    if (!step) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isTypingTarget(event.target)) return;
    if (!openImageViewer()) return;

    const thumbs = [...document.querySelectorAll(SEL.thumbs)];
    const current = thumbs.findIndex(thumb => thumb.matches(SEL.selectedThumb));
    if (current === -1) {
      if (!warned) {
        warned = true;
        console.warn(`${TAG} image viewer is open but no selected thumbnail matched "${SEL.thumbs}${SEL.selectedThumb}". Amazon markup changed. Update the selectors in this script.`);
      }
      return;
    }
    if (thumbs.length < 2) return;

    event.preventDefault();
    event.stopPropagation();
    thumbs[wrappedIndex(current, step, thumbs.length)].click();
  }

  // Capture phase, so the popover's own key handling cannot swallow the arrows first.
  window.addEventListener('keydown', handleKeyDown, true);
})();
