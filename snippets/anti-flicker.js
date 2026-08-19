// snippets/anti-flicker.js: hide, rearrange, reveal. No flash of native layout.
//
// Needs @run-at document-start. Three parts, all required:
//   1. CSS injected before first paint hides the target
//   2. apply() sets the ready attribute, which reveals it
//   3. a fail-safe timer reveals it no matter what, so a markup change can never
//      leave the page permanently blank
//
// Re-arm the fail-safe on soft navigation (turbo:visit), since the new page's
// element starts hidden again.

const TARGET = 'nav[aria-label="Repository"] ul.the-list';
const READY = 'data-fg-ready';
const FAILSAFE_MS = 1500;

function injectStyle() {
  const ID = '__fg_anti_flicker';
  if (document.getElementById(ID)) return;
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = `${TARGET}:not([${READY}]) { visibility: hidden !important; }`;
  // <head> may not exist yet at document-start.
  (document.head || document.documentElement).appendChild(style);
}

function reveal() {
  document.querySelectorAll(TARGET).forEach((el) => el.setAttribute(READY, '1'));
}

function armFailsafe() {
  setTimeout(reveal, FAILSAFE_MS);
}

injectStyle();
armFailsafe();
document.addEventListener('turbo:visit', armFailsafe);
// ...then call reveal() at the end of a successful apply().
