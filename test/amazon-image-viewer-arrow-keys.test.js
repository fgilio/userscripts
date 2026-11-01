// Tests for amazon-image-viewer-arrow-keys.
//
//   node test/amazon-image-viewer-arrow-keys.test.js      (or bin/test.sh to run every test)
//
// The script is evaluated against a DOM stub holding the viewer and its thumbnails,
// and optionally a review gallery. A thumbnail click moves the `selected` class,
// and a gallery button moves the position and hides at the ends, as Amazon's own handlers do.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/amazon-image-viewer-arrow-keys.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

// --- DOM stub ---------------------------------------------------------------

class Element {
  constructor({ tag = 'div', isContentEditable = false } = {}) {
    this.tag = tag;
    this.isContentEditable = isContentEditable;
    this.selected = false;
  }

  matches(selector) {
    if (selector !== '.selected') throw new Error(`the stub cannot match "${selector}"`);
    return this.selected;
  }

  closest(selector) {
    return selector.split(', ').includes(this.tag) ? this : null;
  }
}

function buildPage({ thumbCount = 4, selectedIndex = 0, viewerOpen = true, reviewGallery = null } = {}) {
  const thumbs = Array.from({ length: thumbCount }, () => new Element());
  thumbs.forEach(thumb => {
    thumb.click = () => thumbs.forEach(other => { other.selected = other === thumb; });
  });
  if (thumbs[selectedIndex]) thumbs[selectedIndex].selected = true;

  const viewer = new Element();
  viewer.offsetParent = viewerOpen ? new Element() : null;

  const listeners = [];
  const warnings = [];
  const document = {
    querySelector: selector => (selector === '#ivMain' ? viewer : null),
    querySelectorAll(selector) {
      if (selector === '#ivThumbs .ivThumb[id^="ivImage_"]') return thumbs;
      return reviewGallery && reviewGallery.selector === selector ? reviewGallery.roots : [];
    },
  };
  const window = {
    addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
  };
  const console = { warn: message => warnings.push(message) };

  vm.runInNewContext(src, { window, document, Element, console });

  return {
    listeners,
    warnings,
    viewer,
    selected: () => thumbs.findIndex(thumb => thumb.selected),
    press(key, { target = new Element(), ...modifiers } = {}) {
      const event = { key, target, defaultPrevented: false, ...modifiers };
      event.preventDefault = () => { event.defaultPrevented = true; };
      event.stopPropagation = () => {};
      listeners.filter(l => l.type === 'keydown').forEach(l => l.handler(event));
      return event;
    },
  };
}

function buildReviewGallery({ selector, previous, next, itemCount = 3, position = 0, rendered = true, buttons = true }) {
  const gallery = { selector, position, roots: [] };

  // A closed popover of the same kind sits ahead of the open one in the DOM.
  gallery.roots.push(Object.assign(new Element(), { offsetParent: null, querySelector: () => null }));

  const button = (step, isAvailable) => {
    const element = new Element();
    Object.defineProperty(element, 'offsetParent', { get: () => (isAvailable() ? new Element() : null) });
    element.click = () => { gallery.position += step; };
    return element;
  };
  const previousButton = button(-1, () => gallery.position > 0);
  const nextButton = button(1, () => gallery.position < itemCount - 1);

  const root = new Element();
  root.offsetParent = rendered ? new Element() : null;
  root.querySelector = wanted => {
    if (!buttons) return null;
    return { [previous]: previousButton, [next]: nextButton }[wanted] || null;
  };
  gallery.roots.push(root);

  return gallery;
}

const POPOVER_GALLERY = {
  selector: '[class*="media-popover-media-container"]',
  previous: '[class*="left-icon-container"]',
  next: '[class*="right-icon-container"]',
};

const LIGHTBOX_GALLERY = {
  selector: '.cr-lightbox-image-viewer',
  previous: '.cr-lightbox-navigator-button__back',
  next: '.cr-lightbox-navigator-button__next',
};

// --- cases ------------------------------------------------------------------

{
  const page = buildPage();
  check('listens on keydown in the capture phase', page.listeners.map(l => [l.type, l.capture]), [['keydown', true]]);
}

{
  const page = buildPage({ selectedIndex: 1 });
  const event = page.press('ArrowRight');
  check('ArrowRight selects the next image', page.selected(), 2);
  check('a handled arrow is prevented', event.defaultPrevented, true);
  page.press('ArrowLeft');
  page.press('ArrowLeft');
  check('ArrowLeft selects the previous image', page.selected(), 0);
}

{
  const page = buildPage({ selectedIndex: 3 });
  page.press('ArrowRight');
  check('ArrowRight on the last image wraps to the first', page.selected(), 0);
  page.press('ArrowLeft');
  check('ArrowLeft on the first image wraps to the last', page.selected(), 3);
}

{
  const page = buildPage({ viewerOpen: false });
  const event = page.press('ArrowRight');
  check('a closed viewer ignores arrows', [page.selected(), event.defaultPrevented], [0, false]);
}

{
  const page = buildPage();
  page.press('ArrowRight', { metaKey: true });
  page.press('ArrowRight', { shiftKey: true });
  page.press('ArrowRight', { target: new Element({ tag: 'input' }) });
  page.press('ArrowRight', { target: new Element({ isContentEditable: true }) });
  page.press('ArrowRight', { target: new Element({ tag: '.vjs-control-bar' }) });
  page.press('ArrowDown');
  check('modifiers, text fields, video controls and other keys are left alone', page.selected(), 0);
}

{
  const page = buildPage({ thumbCount: 1 });
  const event = page.press('ArrowRight');
  check('a single image leaves the arrow to the page', [page.selected(), event.defaultPrevented], [0, false]);
}

{
  const page = buildPage({ selectedIndex: -1 });
  page.press('ArrowRight');
  page.press('ArrowRight');
  check('no selected thumbnail warns once and selects nothing', [page.warnings.length, page.selected()], [1, -1]);
}

for (const [name, kind] of [['product page gallery', POPOVER_GALLERY], ['reviews page lightbox', LIGHTBOX_GALLERY]]) {
  {
    const reviewGallery = buildReviewGallery({ ...kind, position: 1 });
    const page = buildPage({ viewerOpen: false, reviewGallery });
    const event = page.press('ArrowRight');
    check(`${name}: ArrowRight clicks next`, [reviewGallery.position, event.defaultPrevented], [2, true]);
    page.press('ArrowLeft');
    page.press('ArrowLeft');
    check(`${name}: ArrowLeft clicks previous`, reviewGallery.position, 0);
  }

  {
    const reviewGallery = buildReviewGallery({ ...kind, position: 2 });
    const page = buildPage({ viewerOpen: false, reviewGallery });
    const event = page.press('ArrowRight');
    check(`${name}: the last item leaves the arrow to the page`, [reviewGallery.position, event.defaultPrevented], [2, false]);
  }

  {
    const reviewGallery = buildReviewGallery({ ...kind });
    const page = buildPage({ viewerOpen: false, reviewGallery });
    const event = page.press('ArrowLeft');
    check(`${name}: the first item leaves the arrow to the page`, [reviewGallery.position, event.defaultPrevented], [0, false]);
  }

  {
    const reviewGallery = buildReviewGallery({ ...kind, rendered: false });
    const page = buildPage({ viewerOpen: false, reviewGallery });
    const event = page.press('ArrowRight');
    check(`${name}: a closed gallery ignores arrows`, [reviewGallery.position, event.defaultPrevented], [0, false]);
  }

  {
    const reviewGallery = buildReviewGallery({ ...kind, buttons: false });
    const page = buildPage({ viewerOpen: false, reviewGallery });
    page.press('ArrowRight');
    page.press('ArrowRight');
    check(`${name}: missing buttons warn once and do nothing`, [page.warnings.length, reviewGallery.position], [1, 0]);
  }
}

{
  const reviewGallery = buildReviewGallery({ ...POPOVER_GALLERY });
  const page = buildPage({ selectedIndex: 1, reviewGallery });
  page.press('ArrowRight');
  check('an open image viewer wins over a review gallery', [page.selected(), reviewGallery.position], [2, 0]);
}

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
