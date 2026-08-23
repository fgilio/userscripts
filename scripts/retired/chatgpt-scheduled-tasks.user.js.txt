// RETIRED 2026-08-19. Do not reinstall.
//
// Two independent reasons, both verified live on chatgpt.com:
//   1. Obsolete. ChatGPT now ships its own "Scheduled" item in the sidebar nav,
//      linking to /scheduled. The script duplicates a native feature.
//   2. Broken. Its mount point `aside[class*="pt-"]` no longer matches anything
//      (0 elements; the sidebar is now nav > div, with no <aside> on the page),
//      so `aside.appendChild(...)` throws TypeError on every page load.
//
// Kept only as a record of what was tried. Delete it from Tampermonkey.

// ==UserScript==
// @name         ChatGPT "Scheduled Tasks"
// @namespace    https://chatgpt.com/
// @version      2.0.0
// @description  Adds "Scheduled Tasks" button to ChatGPT sidebar
// @author       Franco Gilio
// @match        https://chatgpt.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

  // Find the aside element
  const aside = document.querySelector('aside[class*="pt-"]');

  // Create the new button
  const scheduledTasksButton = document.createElement('a');
  scheduledTasksButton.tabIndex = 0;
  scheduledTasksButton.setAttribute('data-fill', '');
  scheduledTasksButton.className = 'group __menu-item hoverable';
  scheduledTasksButton.href = 'https://chatgpt.com/schedules';

  scheduledTasksButton.innerHTML = `
    <div class="flex min-w-0 items-center gap-1.5">
      <div class="flex items-center justify-center group-disabled:opacity-50
  group-data-disabled:opacity-50 icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"
  xmlns="http://www.w3.org/2000/svg" class="icon" aria-hidden="true">
          <path d="M10 2C5.589 2 2 5.589 2 10s3.589 8 8 8 8-3.589
  8-8-3.589-8-8-8zm0 14.5c-3.584 0-6.5-2.916-6.5-6.5S6.416 3.5 10 3.5s6.5
  2.916 6.5 6.5-2.916 6.5-6.5 6.5zm.75-10.25h-1.5v4.5l3.5
  2.1.75-1.225-3-1.8V6.25z"/>
        </svg>
      </div>
      <div class="flex min-w-0 grow items-center gap-2.5
  group-data-no-contents-gap:gap-0">
        <div class="truncate">Scheduled Tasks</div>
      </div>
    </div>
  `;

  // Insert after the Library button
  aside.appendChild(scheduledTasksButton);
})();