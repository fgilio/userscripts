// snippets/clone-native.js — the most durable way to add a button to someone
// else's design system: clone one of theirs and swap its guts.
//
// Inherits every utility class, size variant, dark-mode rule and hover state,
// including whichever layout variant the site happens to be rendering right now.

// 1. Find a template by its VISIBLE TEXT, not by class — text survives redesigns.
//
// COST: this reads .textContent of every anchor and button on the page, which
// serializes each one's whole subtree into a string. Never call it from apply()
// unconditionally — guard on the marker first, so it runs once per DOM
// generation rather than on every mutation:
//
//     if (document.getElementById(MY_ID)) return;   // already built
//     const template = findTemplate('Visit');
function findTemplate(label) {
  for (const a of document.querySelectorAll('a, button')) {
    if (a.textContent.trim() === label) return a;
  }
  return null;
}

// 2. Clone, then replace only the icon and the label text node.
function cloneAs(template, { label, href, iconSvg }) {
  const el = template.cloneNode(true);

  const oldIcon = el.querySelector('svg, img');
  if (oldIcon && iconSvg) {
    // Keep the design-system size classes so layout is byte-identical.
    iconSvg.setAttribute('class', oldIcon.getAttribute('class') || '');
    oldIcon.replaceWith(iconSvg);
  }

  // Only the first non-empty TEXT node — never innerHTML, which would nuke the icon.
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      node.textContent = label;
      break;
    }
  }

  if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener'; }

  // Drop framework state attributes so the clone is inert.
  for (const attr of ['data-headlessui-state', 'aria-current', 'data-react-nav', 'id']) {
    el.removeAttribute(attr);
  }
  return el;
}

// Build SVG this way — innerHTML is rejected on Trusted-Types pages.
function icon(viewBox, pathData) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}
