// snippets/spa-nav.js — copy into a script, do not @require.
//
// Re-runs apply() on every way a modern SPA can change what is on screen.
// Covers: async hydration, GitHub React soft-nav, Turbo, Turbo frames, pjax,
// back/forward, and history.pushState done by the site's own router.

const TAG = '[script-name]';

function apply() {
  // Idempotent. Called many times per second. Early-return when not applicable.
}

// Debounce with setTimeout, NOT requestAnimationFrame: rAF never fires in a
// background tab, so a cmd-clicked link would render nothing until focused.
let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    try { apply(); } catch (error) { console.error(TAG, error); }
  }, 50);
}

// documentElement, not body: at @run-at document-start there is no body yet.
// childList ONLY. Adding characterData or attributes turns near-zero records
// into thousands per second on a busy page — GitHub's ticking workflow timers
// and aria-live churn are exactly those two kinds of mutation.
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });

// 'soft-nav:end' is GitHub's React router and fires first; the rest are fallbacks
// for the Turbo/pjax pages GitHub still serves, and for other sites.
for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
  document.addEventListener(event, schedule);
}
window.addEventListener('popstate', schedule);

// CONDITIONAL — include this only when the script's output derives from the URL
// rather than from the DOM. A DOM-driven script already sees the change through
// the observer above; patching two global host methods buys it nothing.
// Of the scripts in this repo, only github-tab-title-numbers needs it.
for (const method of ['pushState', 'replaceState']) {
  const original = history[method];
  history[method] = function () {
    const result = original.apply(this, arguments);
    Promise.resolve().then(schedule);
    return result;
  };
}

schedule();
