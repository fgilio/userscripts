// snippets/warn-once.js — say WHY the script stopped working, exactly once.
//
// Without this, a site markup change presents as "the script just does nothing".
// With it, the console names the selector that broke.

const TAG = '[script-name]';
const warned = new Set();

function need(root, selector, what) {
  const el = root.querySelector(selector);
  if (el) { warned.delete(selector); return el; }
  if (!warned.has(selector)) {
    warned.add(selector);
    console.warn(`${TAG} ${what} not found (selector "${selector}"). Site markup probably changed — re-inspect the DOM and update the script.`);
  }
  return null;
}

// Usage:
//   const list = need(document, 'nav-list > ul.ActionListWrap', 'Actions sidebar list');
//   if (!list) return;
